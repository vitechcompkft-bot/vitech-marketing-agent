import Link from "next/link";
import { notFound } from "next/navigation";
import { loadDashboard } from "@/lib/dashboard";
import ProposedAction from "@/components/ProposedAction";

export const dynamic = "force-dynamic";

const ft = (n: number) => new Intl.NumberFormat("hu-HU").format(Math.round(n || 0)) + " Ft";
const num = (n: number) => new Intl.NumberFormat("hu-HU").format(n || 0);

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

const META: Record<string, { title: string; accent: string; emoji: string }> = {
  marketing: { title: "Marketing osztály", accent: "#1a73e8", emoji: "🎯" },
  informatika: { title: "Informatika", accent: "#22d3ee", emoji: "🛠️" },
  gazdasagi: { title: "Gazdasági osztály", accent: "#22c55e", emoji: "💼" },
};

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
function MemberRow({ name, role, note }: { name: string; role: string; note?: string | null }) {
  return (
    <div className="card">
      <div className="font-semibold">{name} <span className="text-xs font-normal text-white/45">· {role}</span></div>
      {note && <div className="mt-1 text-sm text-white/70">{note}</div>}
    </div>
  );
}

export default async function OsztalyPage({ params }: { params: { key: string } }) {
  const meta = META[params.key];
  if (!meta) notFound();

  const d = await loadDashboard();
  const st = (k: string) => d.statuses.find((s) => s.key === k);
  const note = (k: string) => st(k)?.status_note || st(k)?.daily_task || "—";

  const totalCost = d.metrics.reduce((s, m) => s + m.cost_huf, 0);
  const totalVal = d.metrics.reduce((s, m) => s + m.conv_value_huf, 0);
  const totalConv = d.metrics.reduce((s, m) => s + m.conversions, 0);
  const totalRoas = totalCost ? +(totalVal / totalCost).toFixed(2) : 0;
  const proposed = d.actions.filter((a) => a.status === "proposed");

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold" style={{ color: meta.accent }}>{meta.emoji} {meta.title}</h1>
        <Link className="btn btn-ghost" href="/">← Áttekintés</Link>
      </div>

      {/* ===== MARKETING ===== */}
      {params.key === "marketing" && (
        <>
          <section className="grid gap-3 md:grid-cols-2">
            <MemberRow name={d.config?.agent_name || "Luca"} role="osztályvezető · hirdetés + SEO + elérés" note={note("luca")} />
            <MemberRow name="Klári" role="napi ajánlat + plakát (Luca keze alá)" note={note("klari")} />
          </section>

          {(d.lucaReach || d.klariBrief) && (
            <section className="card" style={{ borderLeft: `4px solid ${meta.accent}` }}>
              <h2 className="section-title">🎯 Luca elérés-terve</h2>
              {d.lucaReach && <div className="text-sm text-white/80">{d.lucaReach}</div>}
              {d.klariBrief && <div className="mt-2 text-sm text-white/70"><span className="text-white/45">👉 Klárinak delegálva: </span>{d.klariBrief}</div>}
            </section>
          )}

          <section>
            <h2 className="section-title">📣 Google Ads</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Kpi title="Mai költés" value={ft(totalCost)} />
              <Kpi title="Hirdetésből bevétel" value={ft(totalVal)} />
              <Kpi title="ROAS" value={totalRoas ? `${totalRoas}×` : "—"} accent={totalRoas >= 3 ? "good" : totalRoas > 0 ? "warn" : undefined} />
              <Kpi title="Konverziók" value={num(totalConv)} />
            </div>
          </section>

          <section>
            <h2 className="section-title">Kampányok</h2>
            <div className="flex flex-col gap-3">
              {d.metrics.length === 0 && <div className="card text-white/60">Nincs kampány-adat.</div>}
              {d.metrics.map((m) => (
                <div key={m.campaign_id} className="card">
                  <div className="mb-2 font-semibold">{m.campaign_name}</div>
                  <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-6">
                    <Mini label="ROAS" value={m.roas ? `${m.roas}×` : "—"} />
                    <Mini label="Költés" value={ft(m.cost_huf)} />
                    <Mini label="Konv." value={num(m.conversions)} />
                    <Mini label="Katt." value={num(m.clicks)} />
                    <Mini label="CTR" value={`${m.ctr}%`} />
                    <Mini label="Impr." value={num(m.impressions)} />
                  </div>
                </div>
              ))}
            </div>
          </section>
          {proposed.length > 0 && (
            <section>
              <h2 className="section-title">Jóváhagyásra váró javaslatok</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {proposed.map((a) => (
                  <ProposedAction key={a.id} id={a.id!} label={humanize(a.type, a.params)} reasoning={a.reasoning} />
                ))}
              </div>
            </section>
          )}
          <Link className="btn btn-primary w-fit" href="/creatives">🖼️ Kreatívok / Klári plakátjai →</Link>
        </>
      )}

      {/* ===== INFORMATIKA ===== */}
      {params.key === "informatika" && (
        <>
          <MemberRow name={d.agents.find((a) => a.key === "gyula")?.name || "Gyula"} role="IT vezető · kapcsolatok + automatizálás" note={note("gyula")} />
          <section>
            <h2 className="section-title">🖥️ Felügyelt oldalak</h2>
            <div className="grid gap-2 md:grid-cols-2">
              {d.sites.map((s) => {
                const dot = s.status === "up" ? "🟢" : s.status === "down" ? "🔴" : "⚪";
                return (
                  <a key={s.id} href={s.url} target="_blank" rel="noreferrer" className="card card-hover flex items-center justify-between gap-2 py-2.5">
                    <span className="min-w-0">
                      <span className="text-sm font-medium">{dot} {s.name}</span>
                      <span className="block truncate text-xs text-white/45">{s.url}</span>
                    </span>
                    <span className="shrink-0 text-right text-xs text-white/50">
                      <span className="badge bg-white/10 text-white/60">{s.scope === "lan" ? "LAN" : "publikus"}</span>
                      {s.status === "down" && s.note ? <span className="block text-red-300">{s.note}</span> : null}
                    </span>
                  </a>
                );
              })}
            </div>
          </section>
        </>
      )}

      {/* ===== GAZDASÁGI ===== */}
      {params.key === "gazdasagi" && (
        <>
          <MemberRow name={d.agents.find((a) => a.key === "mihaly")?.name || "Mihály"} role="gazdasági vezető · bevétel + kiadás" note={note("mihaly")} />
          <section>
            <h2 className="section-title">Bevétel vs. hirdetési költés</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Kpi title="Mai bevétel" value={ft(d.orders.todayRevenue)} accent={d.orders.todayRevenue > 0 ? "good" : undefined} />
              <Kpi title="Havi bevétel" value={ft(d.orders.monthRevenue)} accent={d.orders.monthRevenue > 0 ? "good" : undefined} />
              <Kpi title="Mai hirdetési költés" value={ft(totalCost)} />
              <Kpi title="Mai eredmény" value={ft(d.orders.todayRevenue - totalCost)} accent={d.orders.todayRevenue - totalCost >= 0 ? "good" : "warn"} />
            </div>
          </section>

          {d.orders.ok && d.orders.recent.length > 0 && (
            <section>
              <h2 className="section-title">💰 Valós eladások (webshop · minden csatorna)</h2>
              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-white/50">
                    <tr><th className="py-1">Rendelés</th><th>Dátum</th><th>Állapot</th><th className="text-right">Végösszeg</th></tr>
                  </thead>
                  <tbody>
                    {d.orders.recent.map((o) => (
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
            </section>
          )}

          {d.billingo.ok && (
            <section className="grid gap-4 md:grid-cols-2">
              <div className="card">
                <div className="mb-2 flex items-center justify-between"><span className="text-sm font-semibold">💸 Utalandó (bejövő)</span><span className="badge bg-amber-500/20 text-amber-200">{d.billingo.inCount} db{d.billingo.inExpired ? ` · ${d.billingo.inExpired} lejárt` : ""}</span></div>
                {d.billingo.in.slice(0, 8).map((x) => (
                  <div key={x.number} className="flex justify-between gap-2 border-t border-white/5 py-1.5 text-sm">
                    <span className="min-w-0 truncate">{x.expired ? "⏰ " : ""}{x.partner} <span className="text-white/40">· {x.dueDate}</span></span>
                    <span className="shrink-0 font-semibold">{ft(x.gross)}</span>
                  </div>
                ))}
                {d.billingo.inCount === 0 && <div className="text-sm text-white/45">Nincs fizetetlen tétel.</div>}
              </div>
              <div className="card">
                <div className="mb-2 flex items-center justify-between"><span className="text-sm font-semibold">🧾 Kintlévőség (kimenő)</span><span className="badge bg-amber-500/20 text-amber-200">{d.billingo.outCount} db{d.billingo.outExpired ? ` · ${d.billingo.outExpired} lejárt` : ""}</span></div>
                {d.billingo.out.slice(0, 8).map((x) => (
                  <div key={x.number} className="flex justify-between gap-2 border-t border-white/5 py-1.5 text-sm">
                    <span className="min-w-0 truncate">{x.expired ? "⏰ " : ""}{x.partner} <span className="text-white/40">· {x.dueDate}</span></span>
                    <span className="shrink-0 font-semibold">{ft(x.gross)}</span>
                  </div>
                ))}
                {d.billingo.outCount === 0 && <div className="text-sm text-white/45">Nincs fizetetlen tétel.</div>}
              </div>
            </section>
          )}

          <section className="card">
            <div className="mb-2 flex items-center justify-between"><span className="text-sm font-semibold">🏦 K&H bankszámla</span>{d.bank.connected ? <span className="badge bg-green-500/20 text-green-300">összekötve</span> : <span className="badge bg-white/10 text-white/60">nincs összekötve</span>}</div>
            {d.bank.connected ? (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <Mini label="Egyenleg" value={d.bank.balance != null ? `${ft(d.bank.balance)} ${d.bank.currency}` : "—"} />
                  <Mini label="30 nap bevétel" value={`+${ft(d.bank.in30)}`} />
                  <Mini label="30 nap kiadás" value={`-${ft(d.bank.out30)}`} />
                </div>
                {d.bank.recent.slice(0, 8).map((t, i) => (
                  <div key={i} className="flex justify-between gap-2 border-t border-white/5 py-1.5 text-sm">
                    <span className="min-w-0 truncate">{t.dir === "in" ? "▲" : "▼"} {t.party} <span className="text-white/40">· {t.date}{t.info ? ` · ${t.info}` : ""}</span></span>
                    <span className={`shrink-0 font-semibold ${t.dir === "in" ? "text-green-300" : ""}`}>{t.dir === "in" ? "+" : "-"}{ft(t.amount)}</span>
                  </div>
                ))}
              </>
            ) : (
              <div className="text-sm text-white/55">{d.bank.note || "A K&H bankszámla összekötése szükséges."}</div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
