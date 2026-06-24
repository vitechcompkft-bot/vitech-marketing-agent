"use client";

import { useEffect, useState } from "react";

interface Task {
  id: number;
  route: "gyula" | "erika";
  subject: string;
  summary: string | null;
  gyula_note: string | null;
  from_addr: string | null;
  date: string | null;
  handled: boolean;
  is_shop: boolean;
  urgency: string | null;
  mailbox: string | null;
}

const fmtDate = (d: string | null) => {
  if (!d) return "";
  try {
    return new Date(d).toLocaleString("hu-HU", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

export default function TasksPanel() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function refresh() {
    const r = await fetch("/api/tasks").then((x) => x.json()).catch(() => ({ tasks: [] }));
    setTasks(r.tasks || []);
    setLoaded(true);
  }
  useEffect(() => {
    refresh();
  }, []);

  async function toggle(id: number, handled: boolean) {
    setTasks((arr) => arr.map((t) => (t.id === id ? { ...t, handled } : t)));
    const r = await fetch("/api/emails/handle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, handled }),
    })
      .then((x) => x.json())
      .catch(() => ({ ok: false }));
    if (!r.ok) {
      // visszaállítás hiba esetén
      setTasks((arr) => arr.map((t) => (t.id === id ? { ...t, handled: !handled } : t)));
    }
  }

  const gyula = tasks.filter((t) => t.route === "gyula");
  const erika = tasks.filter((t) => t.route === "erika");
  const openCount = (list: Task[]) => list.filter((t) => !t.handled).length;

  const Column = ({ title, accent, list, noteKey }: { title: string; accent: string; list: Task[]; noteKey: "gyula_note" | "summary" }) => (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold" style={{ color: accent }}>
          {title}
        </h3>
        <span className="badge bg-white/10 text-white/60">{openCount(list)} nyitott</span>
      </div>
      {list.length === 0 ? (
        <div className="text-sm text-white/45">Nincs feladat.</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {list
            .slice()
            .sort((a, b) => Number(a.handled) - Number(b.handled))
            .map((t) => (
              <li key={t.id} className={`flex gap-3 rounded-lg border border-white/10 p-3 ${t.handled ? "opacity-45" : "bg-white/5"}`}>
                <input
                  type="checkbox"
                  checked={t.handled}
                  onChange={(e) => toggle(t.id, e.target.checked)}
                  className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-emerald-500"
                  title={t.handled ? "Kész — kattints a visszavonáshoz" : "Pipáld ki, ha kész"}
                />
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-semibold ${t.handled ? "line-through" : ""}`}>{t.subject}</div>
                  <div className="mt-0.5 text-sm text-white/70">{(t[noteKey] || t.summary || "").toString()}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/40">
                    {t.is_shop && <span className="badge bg-amber-500/20 text-amber-200">🏬 bolt</span>}
                    {t.urgency === "magas" && <span className="badge bg-red-500/20 text-red-200">sürgős</span>}
                    <span>{t.from_addr}</span>
                    <span>· {fmtDate(t.date)}</span>
                  </div>
                </div>
              </li>
            ))}
        </ul>
      )}
    </div>
  );

  return (
    <section>
      <h2 className="section-title">✅ Feladatok</h2>
      {!loaded ? (
        <div className="card text-sm text-white/45">Betöltés…</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Column title="🛠️ Informatika — Gyula" accent="#22d3ee" list={gyula} noteKey="gyula_note" />
          <Column title="📋 Egyéb — Erika" accent="#22c55e" list={erika} noteKey="summary" />
        </div>
      )}
    </section>
  );
}
