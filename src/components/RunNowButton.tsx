"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RunNowButton() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  async function run() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/agent/run", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setMsg(`Kész: ${data.executed} beavatkozás, ${data.proposed} javaslat, ${data.blocked} blokkolt.`);
        router.refresh();
      } else {
        setMsg("Hiba: " + (data.error || "ismeretlen"));
      }
    } catch (e: any) {
      setMsg("Hiba: " + (e?.message || "ismeretlen"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button className="btn btn-primary" onClick={run} disabled={loading}>
        {loading ? "Futtatás…" : "▶ Figyelés futtatása most"}
      </button>
      {msg && <span className="text-sm text-white/70">{msg}</span>}
    </div>
  );
}
