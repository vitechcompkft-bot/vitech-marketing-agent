"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ProposedAction({
  id,
  label,
  reasoning,
}: {
  id: number;
  label: string;
  reasoning: string;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const router = useRouter();

  async function decide(decision: "approve" | "reject") {
    setBusy(true);
    try {
      const res = await fetch(`/api/actions/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      setDone(decision === "approve" ? (data.ok ? "✅ Végrehajtva" : "⚠️ " + data.message) : "Elutasítva");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card flex flex-col gap-2">
      <div className="font-semibold">💡 {label}</div>
      <div className="text-sm text-white/70">{reasoning}</div>
      {done ? (
        <div className="text-sm text-white/80">{done}</div>
      ) : (
        <div className="flex gap-2">
          <button className="btn btn-primary" disabled={busy} onClick={() => decide("approve")}>Jóváhagyom</button>
          <button className="btn btn-ghost" disabled={busy} onClick={() => decide("reject")}>Elutasítom</button>
        </div>
      )}
    </div>
  );
}
