import type { ReactNode } from "react";
import { loadDashboard } from "@/lib/dashboard";
import RunNowButton from "@/components/RunNowButton";
import ProposedAction from "@/components/ProposedAction";

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
  const { metrics, actions, alerts, config, agents, statuses, orders, supabaseReady, mock } = await loadDashboard();
  const erika = agents.find((a) => a.key === "erika");
  const gyula = agents.find((a) => a.key === "gyula");
  const st = (k: string) => statuses.find((s) => s.key === k);
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

      {/* Szervezet */}
      <section>
        <h2 className="section-title">🏢 A Vitech AI-csapat</h2>

        {/* Titkárság — Erika (a kapcsolattartó) */}
        <a href="/iroda" className="card card-hover mb-3 flex items-center gap-3 bg-brand/10">
          <Person avatar={erika?.avatar} name="Erika" fallback="Erika" />
          <div className="flex-1">
            <div className="font-semibold">{erika?.name ?? "Erika"} <span className="badge ml-1 bg-brand/20 text-brand">Titkárság</span></div>
            <StatusLine s={st("erika")} fallback="Üzenetek rendezése + napi összegzés" />
            <div className="mt-0.5 text-xs text-brand">Hozzád minden rajta keresztül → Írj neki ➜</div>
          </div>
        </a>

        {/* Osztályok */}
        <div className="grid gap-3 md:grid-cols-3">
          <Dept title="Marketing" accent="#1a73e8">
            <Member avatar={config?.agent_avatar || "/avatars/luca-1.svg"} name={config?.agent_name ?? "Luca"} role="osztályvezető · hirdetés + SEO" lead status={st("luca")} />
            <Member avatar={config?.klari_avatar} name="Klári" role="napi ajánlat + plakát" status={st("klari")} />
          </Dept>
          <Dept title="Informatika" accent="#22d3ee">
            <Member avatar={gyula?.avatar} name={gyula?.name ?? "Gyula"} role={gyula?.role ?? "IT vezető · automatizálás"} lead status={st("gyula")} />
          </Dept>
          <Dept title="Gazdasági" accent="#22c55e">
            <div className="text-xs text-white/45">Vezető hamarosan…</div>
          </Dept>
        </div>
      </section>

      {/* Valós eladások (webshop, minden csatorna) */}
      {orders.ok && (
        <section>
          <h2 className="section-title">💰 Valós eladások (webshop · minden csatorna)</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Kpi title="Mai bevétel" value={ft(orders.todayRevenue)} accent={orders.todayRevenue > 0 ? "good" : undefined} />
            <Kpi title="Mai rendelés" value={num(orders.todayCount)} />
            <Kpi title="Havi bevétel" value={ft(orders.monthRevenue)} accent={orders.monthRevenue > 0 ? "good" : undefined} />
            <Kpi title="Havi rendelés" value={num(orders.monthCount)} />
          </div>
          {orders.recent.length > 0 && (
            <div className="card mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-white/50">
                  <tr><th className="py-1">Rendelés</th><th>Dátum</th><th>Állapot</th><th className="text-right">Végösszeg</th></tr>
                </thead>
                <tbody>
                  {orders.recent.map((o) => (
                    <tr key={o.key} className="border-t border-white/5">
                      <td className="py-2 pr-3 text-white/70">{o.key}</td>
                      <td className="pr-3 text-white/60">{o.date}</td>
                      <td className="pr-3"><span className="badge bg-green-500/20 text-green-300">{o.status}</span></td>
                      <td className="text-right font-semibold">{ft(o.sumGross)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-2 text-xs text-white/40">A „Valós eladások" minden csatornát tartalmaz. A lenti Google Ads blokk csak a hirdetésből származó részt mutatja.</div>
        </section>
      )}

      {/* Google Ads összesített KPI-k */}
      <div>
        <h2 className="section-title">📣 Google Ads (csak a hirdetésből)</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi title="Mai költés" value={ft(totalCost)} />
          <Kpi title="Hirdetésből bevétel" value={ft(totalVal)} />
          <Kpi title="ROAS" value={totalRoas ? `${totalRoas}×` : "—"} accent={totalRoas >= 3 ? "good" : totalRoas > 0 ? "warn" : undefined} />
          <Kpi title="Konverziók" value={num(totalConv)} />
        </div>
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

const FALLBACK_AVATAR = (seed: string) => `https://api.dicebear.com/9.x/lorelei/svg?seed=${seed}&backgroundColor=11243f`;

function Person({ avatar, name, fallback }: { avatar?: string | null; name: string; fallback: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={avatar || FALLBACK_AVATAR(fallback)} alt={name} className="h-12 w-12 rounded-full border border-white/20 bg-white/10 object-cover" />;
}
function Dept({ title, accent, children }: { title: string; accent: string; children: ReactNode }) {
  return (
    <div
      className="flex flex-col gap-3 rounded-2xl border p-5"
      style={{
        background: `linear-gradient(180deg, ${accent}26, rgba(255,255,255,0.03))`,
        borderColor: `${accent}66`,
        boxShadow: `0 10px 30px -18px ${accent}88`,
      }}
    >
      <div className="text-xs font-bold uppercase tracking-wider" style={{ color: accent }}>
        {title}
      </div>
      {children}
    </div>
  );
}
type Status = { status: string; status_note?: string | null; daily_task?: string | null } | undefined;
const STATUS_META: Record<string, { dot: string; label: string }> = {
  working: { dot: "bg-amber-400", label: "dolgozik" },
  done: { dot: "bg-green-400", label: "kész" },
  waiting: { dot: "bg-blue-400", label: "vár" },
  error: { dot: "bg-red-400", label: "hiba" },
  idle: { dot: "bg-white/40", label: "tétlen" },
};
function StatusLine({ s, fallback }: { s: Status; fallback?: string }) {
  const meta = STATUS_META[s?.status || "idle"] || STATUS_META.idle;
  return (
    <div className="mt-0.5 flex items-start gap-1.5 text-xs text-white/60">
      <span className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
      <span>{s?.status_note || fallback || s?.daily_task || "—"}</span>
    </div>
  );
}
function Member({ avatar, name, role, lead, status }: { avatar?: string | null; name: string; role: string; lead?: boolean; status?: Status }) {
  return (
    <div className="flex items-start gap-3">
      <Person avatar={avatar} name={name} fallback={name} />
      <div className="min-w-0">
        <div className="text-sm font-semibold">
          {name} {lead && <span className="badge ml-1 bg-brand/20 text-brand">vezető</span>}
        </div>
        <div className="text-xs text-white/45">{role}</div>
        {status && <StatusLine s={status} fallback={status.daily_task || undefined} />}
      </div>
    </div>
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
