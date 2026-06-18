"use client";
import { useRef, useState } from "react";

type Msg = { role: "user" | "agent"; content: string };

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "agent", content: "Szia László! Az AI marketinges vagyok. Kérdezz a hirdetésekről, vagy mondd meg, mit változtassak." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages.map((m) => ({ role: m.role === "agent" ? "assistant" : "user", content: m.content })),
        }),
      });
      const data = await res.json();
      setMessages([...next, { role: "agent", content: data.reply || data.error || "…" }]);
    } catch (e: any) {
      setMessages([...next, { role: "agent", content: "Hiba: " + (e?.message || "ismeretlen") }]);
    } finally {
      setLoading(false);
      setTimeout(() => boxRef.current?.scrollTo(0, boxRef.current.scrollHeight), 50);
    }
  }

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-lg font-bold">Chat az AI marketingessel</h1>
      <div ref={boxRef} className="card flex h-[60vh] flex-col gap-3 overflow-y-auto">
        {messages.map((m, i) => (
          <div key={i} className={`max-w-[85%] rounded-xl px-4 py-2 text-sm ${m.role === "user" ? "ml-auto bg-brand text-white" : "bg-white/10"}`}>
            {m.content.split("\n").map((line, j) => <p key={j}>{line}</p>)}
          </div>
        ))}
        {loading && <div className="text-sm text-white/50">gépel…</div>}
      </div>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm outline-none focus:border-brand"
          placeholder="Írj az ügynöknek… (pl. emeld a keretet 6000-re, ha jó a ROAS)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button className="btn btn-primary" onClick={send} disabled={loading}>Küldés</button>
      </div>
      <p className="text-xs text-white/40">Ugyanezt a beszélgetést Telegramon is folytathatod a botoddal.</p>
    </main>
  );
}
