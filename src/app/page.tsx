import { loadDashboard } from "@/lib/dashboard";
import RunNowButton from "@/components/RunNowButton";
import ProposedAction from "@/components/ProposedAction";
import KlariDeal from "@/components/KlariDeal";

export const dynamic = "force-dynamic";

const ft = (n: number) => new Intl.NumberFormat("hu-HU").format(Math.round(n)) + " Ft";
const num = (n: number) => new Intl.NumberFormat("hu-HU").format(n);

function humanize(type: string, p: any): string {
  switch (type) {
    case "budget_change": return `Napi keret ${p?.from ?? "?"} → ${p?.to} Ft`;
    case "pause_ad": return "Kampány szüneteltetése";
    case "enable_ad": return "Kampány újraindítása";
    case "set_target_roas": return `ROAS-cél = ${p?.to}`;
    case "add_sitelinks": return `Sitelinkek hozzáadása`;
    case "add_callouts": return `Kiemelők hozzáadása`;
    case "seo_update": return `SEO frissítés: ${p?.product_name ?? "termék"}`;
    default: return type;
  }
}

export default async function Overview() {
  const { metrics, actions, alerts, config, klari, supabaseReady, mock } = await loadDashboard();
  const proposed = actions.filter((a) => a.status === "proposed");
  const log = actions.filter((a) => a.status !== "proposed").slice(0, 12);

  const totalCost = metrics.reduce((s, m) => s + m.cost_huf, 0);
  const totalVal = metrics.reduce((s, m) => s + m.conv_value_huf, 0);
  const totalConv = metrics.reduce((s, m) => s + m.conversions, 0);
  const totalRoas = totalCost ? +(totalVal / totalCost).toFixed(2) : 0;

  return (
    <main className="flex flex-col gap-6">
      {/* Setup figyelmeztetések */}
      {mock && (
        <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">
          🧪 <b>Mock mód</b> — a számok teszt-adatok. Éles Google Ads adatokhoz: állítsd <code>USE_MOCK_DATA=false</code> és töltsd ki a Google Ads kulcsokat.
        </div>
      )}
      {!supabaseReady && (
        <div className="rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
          ⚠️ <b>Supabase nincs beállítva</b> — a mentés/napló/beavatkozás nem működik, amíg nincs adatbázis. Kövesd a README-t (séma + .env.local).
        </div>
      )}

      {/* Agent státusz */}
      <div className="card flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-sm text-white/60">Agent állapota</div>
          <div className="text-lg font-bold">
            {config ? (config.agent_enabled ? "🟢 Bekapcsolva" : "⛔ Kikapcsolva") : "—"}
            {config && <span className="ml-2 text-sm font-normal text-white/60">({config.autonomy_level})</span>}
          </div>
        </div>
        <RunNowButton />
      </div>

      {/* Csapat */}
      <section>
        <h2 className="section-title">👥 Marketing csapat</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="card card-hover flex items-center gap-3">
            <div className="mono h-12 w-12 text-lg" style={{ background: "linear-gradient(135deg,#1A73E8,#0a2a5e)" }}>
              {(config?.agent_name ?? "L").charAt(0)}
            </div>
            <div>
              <div className="font-semibold">{config?.agent_name ?? "Luca"} <span className="badge ml-1 bg-brand/20 text-brand">főnök</span></div>
              <div className="text-xs text-white/60">Hirdetések + SEO · önállóan dönt a korlátokon belül</div>
            </div>
          </div>
          <div className="card card-hover flex items-center gap-3">
            <div className="mono h-12 w-12 text-lg" style={{ background: "linear-gradient(135deg,#e84393,#a02060)" }}>
              K
            </div>
            <div>
              <div className="font-semibold">Klári <span className="badge ml-1 bg-white/10 text-white/60">beosztott</span></div>
              <div className="text-xs text-white/60">Napi ajánlat-kutatás + plakát · Lucának jelent</div>
            </div>
          </div>
        </div>
      </section>

      {/* Klári napi ajánlata */}
      {klari.length > 0 && (
        <section>
          <h2 className="section-title">🖼️ Klári napi ajánlata</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {klari.slice(0, 2).map((k) => (
              <KlariDeal
                key={k.id}
                id={k.id}
                productName={k.product_name}
                productUrl={k.product_url}
                priceHuf={k.price_huf}
                marketNote={k.market_note}
                caption={k.caption}
                posterSvg={k.poster_svg}
                lucaVerdict={k.luca_verdict}
                status={k.status}
                createdAt={k.created_at}
              />
            ))}
          </div>
        </section>
      )}

      {/* Összesített KPI-k */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi title="Mai költés" value={ft(totalCost)} />
        <Kpi title="Árbevétel (konv. érték)" value={ft(totalVal)} />
        <Kpi title="ROAS" value={totalRoas ? `${totalRoas}×` : "—"} accent={totalRoas >= 3 ? "good" : totalRoas > 0 ? "warn" : undefined} />
        <Kpi title="Konverziók" value={num(totalConv)} />
      </div>

      {/* Kampányok */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">Kampányok</h2>
        <div className="flex flex-col gap-3">
          {metrics.length === 0 && <div className="card text-white/60">Nincs kampány-adat.</div>}
          {metrics.map((m) => (
            <div key={m.campaign_id} className="card">
              <div className="mb-2 flex items-center justify-between">
                <div className="font-semibold">{m.campaign_name}</div>
                <span className={`badge ${m.status === "ENABLED" ? "bg-green-500/20 text-green-300" : "bg-white/10 text-white/60"}`}>{m.status}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-6">
                <Mini label="ROAS" value={m.roas ? `${m.roas}×` : "—"} />
                <Mini label="Költés" value={ft(m.cost_huf)} />
                <Mini label="Konv." value={num(m.conversions)} />
                <Mini label="Katt." value={num(m.clicks)} />
                <Mini label="CTR" value={`${m.ctr}%`} />
                <Mini label="Napi keret" value={ft(m.budget_huf)} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Javaslatok (jóváhagyásra) */}
      {proposed.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">Jóváhagyásra váró javaslatok</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {proposed.map((a) => (
              <ProposedAction key={a.id} id={a.id!} label={humanize(a.type, a.params)} reasoning={a.reasoning} />
            ))}
          </div>
        </section>
      )}

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

      {/* Akciónapló */}
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

function Kpi({ title, value, accent }: { title: string; value: string; accent?: "good" | "warn" }) {
  return (
    <div className="card">
      <div className="text-xs text-white/50">{title}</div>
      <div className={`mt-1 text-2xl font-bold ${accent === "good" ? "text-green-300" : accent === "warn" ? "text-amber-200" : ""}`}>{value}</div>
    </div>
  );
}
function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-white/50">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
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
