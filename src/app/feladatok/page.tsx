import { loadDashboard } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

/** Ki, mikor, mi a feladata — a csapat visszatéro felelosségei. */
const DUTIES: { who: string; dept: string; task: string; when: string }[] = [
  { who: "Erika", dept: "Titkárság", task: "E-mailek triázsa + napi csapat-összegzés", when: "Naponta (jelentés 19:00)" },
  { who: "Luca", dept: "Marketing", task: "Kampány-figyelés, döntések, Meta-figyelés + napi jelentés", when: "Naponta (19:00)" },
  { who: "Klári", dept: "Marketing", task: "Napi termék-plakát (Luca jóváhagyásával) → FB-oldal", when: "Minden reggel 07:00" },
  { who: "Judit", dept: "Marketing", task: "Napi LinkedIn-poszt (AI-képpel)", when: "Naponta" },
  { who: "Judit", dept: "Marketing", task: "SEO blogcikk a webshopra", when: "Hetente (hétfő)" },
  { who: "Gyula", dept: "Informatika", task: "Rendszer-/uptime-ellenorzés + öngyógyítás (garancia-app)", when: "Naponta" },
  { who: "Mihály", dept: "Gazdasági", task: "Pénzügyi figyelés (költés, megtérülés, gazdaságosság)", when: "Naponta" },
  { who: "Mihály", dept: "Gazdasági", task: "Könyveloi e-mail: elozo havi számlatörténet (Excel) + kivonat (PDF)", when: "Havonta, 4-én" },
];

/** A napi fo feladatok (ezekhez mutatjuk az aznapi státuszt). */
const DAILY: { key: string; name: string; duty: string }[] = [
  { key: "erika", name: "Erika", duty: "E-mailek + napi összegzés" },
  { key: "luca", name: "Luca", duty: "Kampány-figyelés + jelentés" },
  { key: "klari", name: "Klári", duty: "Napi termék-plakát" },
  { key: "judit", name: "Judit", duty: "Napi LinkedIn-poszt" },
  { key: "gyula", name: "Gyula", duty: "Rendszer-ellenorzés" },
  { key: "mihaly", name: "Mihály", duty: "Pénzügyi figyelés" },
];

function whenStr(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest" }).format(new Date());
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest" }).format(d);
    const time = new Intl.DateTimeFormat("hu-HU", { timeZone: "Europe/Budapest", hour: "2-digit", minute: "2-digit" }).format(d);
    return day === today ? `ma ${time}` : `${day} ${time}`;
  } catch {
    return "—";
  }
}

function badge(status: string): { label: string; cls: string } {
  const s = (status || "").toLowerCase();
  if (s === "done" || s === "kész") return { label: "✅ kész", cls: "bg-green-500/20 text-green-300" };
  if (s === "working" || s === "folyamatban") return { label: "⚙️ folyamatban", cls: "bg-amber-500/20 text-amber-200" };
  if (s === "waiting" || s === "fogadva") return { label: "⏳ várakozik", cls: "bg-sky-500/20 text-sky-200" };
  if (s === "error" || s === "hiba") return { label: "⚠️ hiba", cls: "bg-red-500/20 text-red-200" };
  return { label: "• tétlen", cls: "bg-white/10 text-white/55" };
}

export default async function FeladatokPage() {
  const d = await loadDashboard();
  const st = (k: string) => d.statuses.find((s) => s.key === k);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest" }).format(new Date());
  const todayTasks = (d.tasks || []).filter((t) => {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest" }).format(new Date(t.createdAt)) === today;
    } catch {
      return false;
    }
  });

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">📋 Feladatok</h1>

      <section className="card">
        <h2 className="section-title">Ki, mikor, mi a feladata</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-white/55">
                <th className="py-2 pr-3">Munkatárs</th>
                <th className="py-2 pr-3">Osztály</th>
                <th className="py-2 pr-3">Feladat</th>
                <th className="py-2 pr-3">Mikor</th>
              </tr>
            </thead>
            <tbody>
              {DUTIES.map((r, i) => (
                <tr key={i} className="border-b border-white/5">
                  <td className="py-2 pr-3 font-semibold">{r.who}</td>
                  <td className="py-2 pr-3 text-white/60">{r.dept}</td>
                  <td className="py-2 pr-3 text-white/85">{r.task}</td>
                  <td className="py-2 pr-3 whitespace-nowrap text-white/70">{r.when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2 className="section-title">📅 Mai feladatok és státusz</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-white/55">
                <th className="py-2 pr-3">Munkatárs</th>
                <th className="py-2 pr-3">Mai feladat</th>
                <th className="py-2 pr-3">Státusz</th>
                <th className="py-2 pr-3">Hol tart / mit csinál</th>
                <th className="py-2 pr-3">Frissítve</th>
              </tr>
            </thead>
            <tbody>
              {DAILY.map((a) => {
                const s = st(a.key);
                const b = badge(s?.status || "idle");
                return (
                  <tr key={a.key} className="border-b border-white/5">
                    <td className="py-2 pr-3 font-semibold">{a.name}</td>
                    <td className="py-2 pr-3 text-white/85">{a.duty}</td>
                    <td className="py-2 pr-3"><span className={`badge ${b.cls}`}>{b.label}</span></td>
                    <td className="py-2 pr-3 text-white/70">{s?.status_note || "—"}</td>
                    <td className="py-2 pr-3 whitespace-nowrap text-white/60">{whenStr(s?.status_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-xs text-white/45">A státusz a munkatársak mai tevékenységét tükrözi (✅ kész = aznap teljesítve; ⚙️ folyamatban; ⏳ várakozik). A „Frissítve" mutatja, mikor lépett a feladatban.</div>
      </section>

      {todayTasks.length > 0 && (
        <section className="card">
          <h2 className="section-title">📨 Tőled kiadott mai feladatok</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-white/55">
                  <th className="py-2 pr-3">Megbízott</th>
                  <th className="py-2 pr-3">Feladat</th>
                  <th className="py-2 pr-3">Státusz</th>
                  <th className="py-2 pr-3">Frissítve</th>
                </tr>
              </thead>
              <tbody>
                {todayTasks.map((t) => {
                  const b = badge(t.status);
                  return (
                    <tr key={t.id} className="border-b border-white/5">
                      <td className="py-2 pr-3 font-semibold">{t.who?.name || t.to}</td>
                      <td className="py-2 pr-3 text-white/85">{t.title}</td>
                      <td className="py-2 pr-3"><span className={`badge ${b.cls}`}>{b.label}</span></td>
                      <td className="py-2 pr-3 whitespace-nowrap text-white/60">{whenStr(t.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
