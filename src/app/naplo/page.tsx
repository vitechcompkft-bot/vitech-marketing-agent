import { loadDashboard } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

function humanize(type: string, p: any): string {
  switch (type) {
    case "budget_change": return `Napi keret ${p?.from ?? "?"} → ${p?.to} Ft`;
    case "pause_ad": return "Kampány szüneteltetése";
    case "enable_ad": return "Kampány újraindítása";
    case "set_target_roas": return `ROAS-cél = ${p?.to}`;
    case "add_sitelinks": return "Sitelinkek hozzáadása";
    case "add_callouts": return "Kiemelők hozzáadása";
    case "seo_update": return `SEO frissítés: ${p?.product_name ?? "termék"}`;
    default: return type;
  }
}
function StatusBadge({ s }: { s: string }) {
  const map: Record<string, string> = {
    executed: "bg-green-500/20 text-green-300",
    proposed: "bg-blue-500/20 text-blue-300",
    blocked: "bg-white/10 text-white/60",
    rejected: "bg-white/10 text-white/50",
    failed: "bg-red-500/20 text-red-300",
  };
  return <span className={`badge ${map[s] || "bg-white/10 text-white/60"}`}>{s}</span>;
}

export default async function NaploPage() {
  const { alerts, emails, actions } = await loadDashboard();
  const log = actions.filter((a) => a.status !== "proposed").slice(0, 30);

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-lg font-bold">Napló & Postaláda</h1>

      {/* Postaláda — Erika triázsa */}
      <section>
        <h2 className="section-title">📨 Postaláda — Erika rendezte</h2>
        {emails.length === 0 ? (
          <div className="card text-sm text-white/55">Nincs beérkezett e-mail.</div>
        ) : (
          <div className="card flex flex-col divide-y divide-white/5">
            {emails.map((e) => (
              <div key={e.id} className="flex items-start gap-3 py-2.5">
                <span className={`badge mt-0.5 shrink-0 ${e.urgency === "magas" ? "bg-red-500/20 text-red-300" : e.urgency === "kozepes" ? "bg-amber-500/20 text-amber-200" : "bg-white/10 text-white/60"}`}>
                  {e.urgency === "magas" ? "sürgős" : e.urgency === "kozepes" ? "közepes" : "alacsony"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{e.subject}</span>
                    {e.department && <span className="badge bg-brand/15 text-brand">{e.department}</span>}
                  </div>
                  <div className="text-xs text-white/55">{e.from_addr}{e.mailbox ? ` → ${e.mailbox}` : ""}{e.date ? ` · ${new Date(e.date).toLocaleString("hu-HU")}` : ""}</div>
                  {e.summary && <div className="mt-0.5 text-sm text-white/75">{e.summary}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Riasztások */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">Riasztások</h2>
        <div className="flex flex-col gap-2">
          {alerts.length === 0 && <div className="card text-white/60">Nincs riasztás.</div>}
          {alerts.map((a) => (
            <div key={a.id} className="card flex items-start gap-3 py-3">
              <span className={`badge ${a.severity === "critical" ? "bg-red-500/20 text-red-300" : a.severity === "warning" ? "bg-amber-500/20 text-amber-200" : "bg-white/10 text-white/60"}`}>{a.severity}</span>
              <div>
                <div className="text-sm font-medium">{a.title}</div>
                <div className="text-sm text-white/60">{a.message}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Beavatkozás-napló */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">Beavatkozás-napló</h2>
        <div className="card overflow-x-auto">
          {log.length === 0 ? (
            <div className="text-white/60">Még nincs naplózott beavatkozás.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-white/50">
                <tr><th className="py-1">Idő</th><th>Típus</th><th>Állapot</th><th>Indok</th></tr>
              </thead>
              <tbody>
                {log.map((a) => (
                  <tr key={a.id} className="border-t border-white/5">
                    <td className="py-2 pr-3 text-white/60">{a.created_at ? new Date(a.created_at).toLocaleString("hu-HU") : ""}</td>
                    <td className="pr-3">{humanize(a.type, a.params)}</td>
                    <td className="pr-3"><StatusBadge s={a.status} /></td>
                    <td className="text-white/70">{a.reasoning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </main>
  );
}
