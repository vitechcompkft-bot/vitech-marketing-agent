import type { ReactNode } from "react";
import { loadDashboard } from "@/lib/dashboard";
import RunNowButton from "@/components/RunNowButton";
import ProposedAction from "@/components/ProposedAction";
import TasksPanel from "@/components/TasksPanel";

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
  const { metrics, actions, config, agents, statuses, orders, billingo, bank, lucaReach, klariBrief, sites, supabaseReady, mock } = await loadDashboard();
  const erika = agents.find((a) => a.key === "erika");
  const gyula = agents.find((a) => a.key === "gyula");
  const mihaly = agents.find((a) => a.key === "mihaly");
  const st = (k: string) => statuses.find((s) => s.key === k);
  const proposed = actions.filter((a) => a.status === "proposed");

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
      <Panel accent="#1a73e8">
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
            <Member avatar={mihaly?.avatar} name={mihaly?.name ?? "Mihály"} role={mihaly?.role ?? "Gazdasági vezető · bevétel + kiadás"} lead status={st("mihaly")} />
          </Dept>
        </div>

        {(lucaReach || klariBrief) && (
          <div className="mt-3 rounded-xl border border-white/10 bg-[#1a73e8]/5 p-3 text-sm">
            <div className="mb-1 font-semibold text-[#5ca0ff]">🎯 Luca elérés-terve</div>
            {lucaReach && <div className="text-white/80">{lucaReach}</div>}
            {klariBrief && (
              <div className="mt-2 text-white/70">
                <span className="text-white/45">👉 Klárinak delegálva (mai plakát iránya): </span>
                {klariBrief}
              </div>
            )}
          </div>
        )}
      </Panel>

      {/* Feladatok — Gyula (Informatika) + Erika (Egyéb), pipálható */}
      <Panel accent="#a855f7">
        <TasksPanel />
      </Panel>

      {/* Felügyelt oldalak — Gyula (uptime) */}
      <Panel accent="#22d3ee">
        <h2 className="section-title">🖥️ Felügyelt oldalak — Gyula</h2>
        <div className="grid gap-2 md:grid-cols-2">
          {sites.map((s) => {
            const dot = s.status === "up" ? "🟢" : s.status === "down" ? "🔴" : "⚪";
            return (
              <a
                key={s.id}
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="card card-hover flex items-center justify-between gap-2 py-2.5"
              >
                <span className="min-w-0">
                  <span className="text-sm font-medium">{dot} {s.name}</span>
                  <span className="block truncate text-xs text-white/45">{s.url}</span>
                </span>
                <span className="shrink-0 text-right text-xs text-white/50">
                  <span className="badge bg-white/10 text-white/60">{s.scope === "lan" ? "LAN" : "publikus"}</span>
                  {s.status === "down" && s.note ? <span className="block text-red-300">{s.note}</span> : null}
                  {s.latency_ms != null && s.status === "up" ? <span className="block">{s.latency_ms} ms</span> : null}
                </span>
              </a>
            );
          })}
        </div>
        <div className="mt-2 text-xs text-white/40">
          A publikus oldalakat Gyula a felhőből figyeli (30 percenként). A LAN-os (10.49.8.x) oldalakat egy belső agent jelenti — leeséskor Telegram.
        </div>
      </Panel>

      {/* Valós eladások (webshop, minden csatorna) */}
      {orders.ok && (
        <Panel accent="#16a34a">
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
        </Panel>
      )}

      {/* Gazdasági — Mihály (bevétel vs. hirdetési költés) */}
      <Panel accent="#14b8a6">
        <h2 className="section-title">💼 Gazdasági — Mihály</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi title="Mai bevétel" value={ft(orders.todayRevenue)} accent={orders.todayRevenue > 0 ? "good" : undefined} />
          <Kpi title="Havi bevétel" value={ft(orders.monthRevenue)} accent={orders.monthRevenue > 0 ? "good" : undefined} />
          <Kpi title="Mai hirdetési költés" value={ft(totalCost)} />
          <Kpi title="Mai eredmény (bev. − Ads)" value={ft(orders.todayRevenue - totalCost)} accent={orders.todayRevenue - totalCost >= 0 ? "good" : "warn"} />
        </div>
        {billingo.ok && (billingo.inCount > 0 || billingo.outCount > 0) && (
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <InvoiceList
              title="💸 Utalandó (bejövő) számlák"
              count={billingo.inCount}
              expired={billingo.inExpired}
              total={billingo.inTotalHuf}
              items={billingo.in}
            />
            <InvoiceList
              title="🧾 Kintlévőség (kimenő) számlák"
              count={billingo.outCount}
              expired={billingo.outExpired}
              total={billingo.outTotalHuf}
              items={billingo.out}
            />
          </div>
        )}
        {/* K&H bank (Enable Banking) */}
        <div className="card mt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">🏦 K&H bankszámla</span>
            {bank.connected ? (
              <span className="badge bg-green-500/20 text-green-300">összekötve</span>
            ) : (
              <span className="badge bg-white/10 text-white/60">nincs összekötve</span>
            )}
          </div>
          {bank.connected ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Mini label="Egyenleg" value={bank.balance != null ? `${ft(bank.balance)} ${bank.currency}` : "—"} />
                <Mini label="30 nap bevétel" value={`+${ft(bank.in30)}`} />
                <Mini label="30 nap kiadás" value={`-${ft(bank.out30)}`} />
              </div>
              {bank.recent.length > 0 && (
                <div className="mt-3 flex flex-col divide-y divide-white/5">
                  {bank.recent.slice(0, 6).map((t, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                      <span className="min-w-0 truncate">
                        <span className={t.dir === "in" ? "text-green-300" : "text-white/80"}>{t.dir === "in" ? "▲" : "▼"} {t.party}</span>
                        <span className="text-white/40"> · {t.date}{t.info ? ` · ${t.info}` : ""}</span>
                      </span>
                      <span className={`shrink-0 font-semibold ${t.dir === "in" ? "text-green-300" : ""}`}>{t.dir === "in" ? "+" : "-"}{ft(t.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-white/55">{bank.note || "A K&H bankszámla összekötése (Enable Banking) szükséges a banki tételek elemzéséhez."}</div>
          )}
        </div>
        <div className="mt-2 text-xs text-white/40">
          {st("mihaly")?.status_note || "Mihály minden nap elemzi a bevételt/kiadást és Telegramon jelent."}
          {!billingo.ok && billingo.note ? ` · ${billingo.note}` : ""}
        </div>
      </Panel>

      {/* Google Ads összesített KPI-k */}
      <Panel accent="#3b82f6">
        <h2 className="section-title">📣 Google Ads (csak a hirdetésből)</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi title="Mai költés" value={ft(totalCost)} />
          <Kpi title="Hirdetésből bevétel" value={ft(totalVal)} />
          <Kpi title="ROAS" value={totalRoas ? `${totalRoas}×` : "—"} accent={totalRoas >= 3 ? "good" : totalRoas > 0 ? "warn" : undefined} />
          <Kpi title="Konverziók" value={num(totalConv)} />
        </div>
      </Panel>

      {/* Kampányok */}
      <Panel accent="#6366f1">
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
      </Panel>

      {/* Javaslatok (jóváhagyásra) */}
      {proposed.length > 0 && (
        <Panel accent="#f59e0b">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">Jóváhagyásra váró javaslatok</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {proposed.map((a) => (
              <ProposedAction key={a.id} id={a.id!} label={humanize(a.type, a.params)} reasoning={a.reasoning} />
            ))}
          </div>
        </Panel>
      )}

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

function Panel({ accent, children }: { accent: string; children: ReactNode }) {
  return (
    <section
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5"
      style={{ borderLeftColor: accent, borderLeftWidth: 4 }}
    >
      {children}
    </section>
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
function InvoiceList({
  title,
  count,
  expired,
  total,
  items,
}: {
  title: string;
  count: number;
  expired: number;
  total: number;
  items: { number: string; partner: string; gross: number; currency: string; dueDate: string; expired: boolean }[];
}) {
  return (
    <div className="card">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{title}</span>
        <span className="badge bg-amber-500/20 text-amber-200">{count} db{expired ? ` · ${expired} lejárt` : ""}</span>
      </div>
      {count === 0 ? (
        <div className="text-sm text-white/45">Nincs fizetetlen tétel. ✔</div>
      ) : (
        <>
          <div className="flex flex-col divide-y divide-white/5">
            {items.slice(0, 8).map((inv) => (
              <div key={inv.number} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                <span className="min-w-0 truncate">
                  <span className={inv.expired ? "text-red-300" : "text-white/80"}>{inv.expired ? "⏰ " : ""}{inv.partner}</span>
                  <span className="text-white/40"> · {inv.number} · hat.: {inv.dueDate || "—"}</span>
                </span>
                <span className="shrink-0 font-semibold">{ft(inv.gross)}{inv.currency !== "HUF" ? ` ${inv.currency}` : ""}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 text-right text-xs text-white/50">Összesen (HUF): <b className="text-white/80">{ft(total)}</b></div>
        </>
      )}
    </div>
  );
}
