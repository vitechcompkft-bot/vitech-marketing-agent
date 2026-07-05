"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** „Frissítés most" gomb — kikényszeríti az Unas-lekérést (force), majd újratölti az oldalt. */
export default function WebshopRefresh() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function refresh() {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/webshop/sync?force=1", { method: "POST" });
      const j = await r.json();
      if (j.ok) {
        setMsg(j.added ? `+${j.added} új rendelés` : "Naprakész");
        router.refresh();
      } else {
        setMsg(j.error || "hiba");
      }
    } catch {
      setMsg("hálózati hiba");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-white/50">{msg}</span>}
      <button className="btn btn-ghost" onClick={refresh} disabled={busy}>
        {busy ? "⏳ Frissítés…" : "🔄 Frissítés most"}
      </button>
    </div>
  );
}
