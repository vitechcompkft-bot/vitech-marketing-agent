"use client";

import { useState } from "react";

interface Turn {
  you: string;
  routedTo?: { name: string; department: string };
  reason?: string;
  reply?: string;
  pending?: boolean;
  error?: string;
}

export default function IrodaPage() {
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);

  async function send() {
    const message = input.trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    setTurns((t) => [...t, { you: message, pending: true }]);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const d = await res.json();
      setTurns((t) =>
        t.map((x, i) =>
          i === t.length - 1
            ? { you: message, routedTo: d.routedTo, reason: d.reason, reply: d.reply, error: d.error }
            : x
        )
      );
    } catch {
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, pending: false, error: "Hálózati hiba." } : x)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-col gap-4">
      <div className="card flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="https://api.dicebear.com/9.x/lorelei/svg?seed=Erika&backgroundColor=11243f" alt="Erika" className="h-12 w-12 rounded-full border border-white/20 bg-white/10" />
        <div>
          <div className="font-semibold">Titkárság — Erika</div>
          <div className="text-xs text-white/60">Írj nekem bármit; a megfelelő osztályhoz továbbítom, és rendezve válaszolok.</div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {turns.length === 0 && (
          <div className="card text-sm text-white/55">
            Pl. „Hogy teljesít a hirdetés?" → Erika Lucához továbbítja. „Lassú a gépem a boltban" → Gyulához (informatika).
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-brand/20 px-4 py-2 text-sm">{t.you}</div>
            {t.routedTo && (
              <div className="text-xs text-white/45">
                📨 Erika → <b>{t.routedTo.name}</b> ({t.routedTo.department}){t.reason ? ` · ${t.reason}` : ""}
              </div>
            )}
            {t.reply ? (
              <div className="card max-w-[88%] whitespace-pre-wrap text-sm">
                <div className="mb-1 text-xs font-semibold text-brand">{t.routedTo?.name} válasza (Erikán keresztül)</div>
                {t.reply}
              </div>
            ) : t.error ? (
              <div className="max-w-[80%] rounded-2xl bg-red-500/15 px-4 py-2 text-sm text-red-200">{t.error}</div>
            ) : (
              <div className="max-w-[80%] rounded-2xl bg-white/5 px-4 py-2 text-sm text-white/50">Erika intézi…</div>
            )}
          </div>
        ))}
      </div>

      <div className="sticky bottom-4 flex gap-2">
        <input
          className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm"
          placeholder="Írj Erikának…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button className="btn btn-primary" onClick={send} disabled={busy}>
          {busy ? "…" : "Küldés"}
        </button>
      </div>
    </main>
  );
}
