"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Prémium plakát jóváhagyási gombjai: Jóváhagyom / Elvetem / Posztolás most. */
export default function PremiumActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  async function act(action: string, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(action);
    setMsg("");
    try {
      const r = await fetch("/api/premium/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const j = await r.json();
      if (j.ok) {
        router.refresh();
      } else {
        setMsg(j.error || "hiba");
      }
    } catch {
      setMsg("hálózati hiba");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {status === "pending" && (
        <>
          <button className="btn btn-primary" disabled={!!busy} onClick={() => act("approve")}>
            {busy === "approve" ? "…" : "✅ Jóváhagyom"}
          </button>
          <button className="btn btn-ghost" disabled={!!busy} onClick={() => act("reject", "Biztosan elveted ezt a plakátot?")}>
            🗑️ Elvetem
          </button>
        </>
      )}
      {status === "approved" && (
        <>
          <span className="badge bg-green-500/20 text-green-200">✅ Jóváhagyva</span>
          <button className="btn btn-primary" disabled={!!busy} onClick={() => act("post", "Kiposztolod MOST a Facebookra?")}>
            {busy === "post" ? "⏳ Posztolás…" : "📘 Posztolás most"}
          </button>
          <button className="btn btn-ghost" disabled={!!busy} onClick={() => act("reject")}>
            Visszavonom
          </button>
        </>
      )}
      {status === "posted" && <span className="badge bg-sky-500/20 text-sky-200">📘 Kiposztolva</span>}
      {status === "rejected" && (
        <>
          <span className="badge bg-white/10 text-white/50">Elvetve</span>
          <button className="btn btn-ghost" disabled={!!busy} onClick={() => act("approve")}>
            Mégis jóváhagyom
          </button>
        </>
      )}
      {msg && <span className="text-xs text-red-300">{msg}</span>}
    </div>
  );
}
