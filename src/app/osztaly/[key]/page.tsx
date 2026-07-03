import Link from "next/link";
import { notFound } from "next/navigation";
import { loadDashboard } from "@/lib/dashboard";
import { getLiveSiteHealth } from "@/lib/health";
import ProposedAction from "@/components/ProposedAction";
import InvoiceButton from "@/components/InvoiceButton";
import CopyButton from "@/components/CopyButton";

export const dynamic = "force-dynamic";

const ft = (n: number) => new Intl.NumberFormat("hu-HU").format(Math.round(n || 0)) + " Ft";
const num = (n: number) => new Intl.NumberFormat("hu-HU").format(n || 0);

const dayHu = (d: Date) => new Intl.DateTimeFormat("hu-HU", { timeZone: "Europe/Budapest", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const timeHu = (d: Date) => new Intl.DateTimeFormat("hu-HU", { timeZone: "Europe/Budapest", hour: "2-digit", minute: "2-digit" }).format(d);
function isTodayBp(iso?: string | null): boolean {
  if (!iso) return false;
  try { return dayHu(new Date(iso)) === dayHu(new Date()); } catch { return false; }
}
function checkedLabel(iso?: string | null): string {
  if (!iso) return "nincs adat";
  try { const d = new Date(iso); return isTodayBp(iso) ? `ma ${timeHu(d)}` : dayHu(d); } catch { return "—"; }
}

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
  // Gyula panelje MINDIG aznapi: a publikus oldalakat élesben pingeljük most.
  const sites = params.key === "informatika" ? await getLiveSiteHealth().catch(() => d.sites) : d.sites;
  const st = (k: string) => d.statuses.find((s) => s.key === k);
  const note = (k: string) => st(k)?.status_note || st(k)?.daily_task || "—";

  const totalCost = d.metrics.reduce((s, m) => s + m.cost_huf, 0);
  const totalVal = d.metrics.reduce((s, m) => s + m.conv_value_huf, 0);
  const totalConv = d.metrics.reduce((s, m) => s + m.conversions, 0);
  const totalRoas = totalCost ? +(totalVal / totalCost).toFixed(2) : 0;
  const proposed = d.actions.filter((a) => a.status === "proposed");

  // VALÓS (webshop) mutatók: a tényleges eladásokból + a K&H-ból kiolvasott Google Ads-költésbol.
  const adSpendMonth = (d.bank.outByParty || []).filter((s) => /google\s*ads/i.test(s.party)).reduce((a, s) => a + s.total, 0);
  const realRoasMonth = adSpendMonth ? +(d.orders.monthRevenue / adSpendMonth).toFixed(2) : 0;
  // Árukereső-költés a K&H-ból (a partnernév-egyezés alapján) — Klári/marketing figyeli.
  const arukeresoSpend = (d.bank.outByParty || [])
    .filter((s) => /áruk?eres|arukeres|comparison shop|heureka/i.test(s.party))
    .reduce((a, s) => a + s.total, 0);
  // Havi kép Mihálynak: hirdetés (Google Ads + Árukereső + Meta) és AI-előfizetés a K&H tételeibol.
  const metaSpend = (d.bank.outByParty || [])
    .filter((s) => /facebook|meta\s|meta\*|meta platform|instagram/i.test(s.party))
    .reduce((a, s) => a + s.total, 0);
  const totalAdSpend = adSpendMonth + arukeresoSpend + metaSpend;
  const aiSpend = (d.bank.outByParty || [])
    .filter((s) => /anthropic|claude|openai|chatgpt|higgsfield|vercel|supabase|cursor|midjourney|elevenlabs|runway|replicate|fal\.?ai|openrouter/i.test(s.party))
    .reduce((a, s) => a + s.total, 0);
  const monthResult = d.orders.monthRevenue - (d.bank.out30 || 0);

  const labelOf = (k: string) =>
    (({ erika: "Erika", luca: "Luca", klari: "Klári", judit: "Judit", gyula: "Gyula", mihaly: "Mihály" } as Record<string, string>)[k] || k);

  const _now = new Date();
  const thisMonth = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}`;
  const _pm = new Date(_now.getFullYear(), _now.getMonth() - 1, 1);
  const prevMonth = `${_pm.getFullYear()}-${String(_pm.getMonth() + 1).padStart(2, "0")}`;

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold" style={{ color: meta.accent }}>{meta.emoji} {meta.title}</h1>
        <Link className="btn btn-ghost" href="/">← Áttekintés</Link>
      </div>

      {params.key === "gazdasagi" && d.bank?.connected && (
        <section>
          <h2 className="section-title">💰 Banki kivonat / számlatörténet</h2>
          <div className="card flex flex-col gap-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-28 text-white/55">Aktuális hónap</span>
              <a className="btn btn-ghost" href={`/api/export/statement?format=pdf&month=${thisMonth}`}>📄 Kivonat (PDF)</a>
              <a className="btn btn-ghost" href={`/api/export/statement?format=xlsx&month=${thisMonth}`}>📊 Számlatörténet (Excel)</a>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-28 text-white/55">Előző hónap</span>
              <a className="btn btn-ghost" href={`/api/export/statement?format=pdf&month=${prevMonth}`}>📄 Kivonat (PDF)</a>
              <a className="btn btn-ghost" href={`/api/export/statement?format=xlsx&month=${prevMonth}`}>📊 Számlatörténet (Excel)</a>
            </div>
            <div className="text-xs text-white/45">A K&H banki tételeiből (open banking, ~90 nap érhető el). A letöltés a tételes mozgásokat tartalmazza, összesítéssel.</div>
          </div>
        </section>
      )}

      {/* ===== MARKETING ===== */}
      {params.key === "marketing" && (
        <>
          <section className="grid gap-3 md:grid-cols-3">
            <MemberRow name={d.config?.agent_name || "Luca"} role="osztályvezető · hirdetés + SEO + elérés" note={note("luca")} />
            <MemberRow name="Klári" role="napi ajánlat + plakát (Luca keze alá)" note={note("klari")} />
            <MemberRow name="Judit" role="LinkedIn tartalom + blog (Luca keze alá)" note={note("judit")} />
          </section>

          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="section-title" style={{ margin: 0 }}>📝 Judit — napi LinkedIn-posztok</h2>
              <span className="text-xs">
                {!d.linkedin.configured ? (
                  <span className="text-white/45">LinkedIn: nincs beállítva (API-kulcs hiányzik)</span>
                ) : d.linkedin.connected && !d.linkedin.expired ? (
                  <span className="badge bg-green-500/20 text-green-300">🔗 LinkedIn összekötve{d.linkedin.name ? ` · ${d.linkedin.name}` : ""} — auto-poszt BE</span>
                ) : d.linkedin.connected && d.linkedin.expired ? (
                  <a href="/api/linkedin/connect" className="badge bg-amber-500/20 text-amber-200">⚠️ LinkedIn token lejárt — kösd újra</a>
                ) : (
                  <a href="/api/linkedin/connect" className="badge bg-sky-500/20 text-sky-200">🔗 LinkedIn összekötése (auto-poszt)</a>
                )}
              </span>
            </div>
            {d.juditPosts?.length > 0 && (
              <div className="grid gap-3 md:grid-cols-2">
                {d.juditPosts.slice(0, 6).map((p, i) => (
                  <div key={i} className="card flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{p.topic}</span>
                      <span className="text-xs text-white/40">{p.date}</span>
                    </div>
                    {p.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image} alt={p.topic} className="w-full rounded-lg" />
                    )}
                    <div className="max-h-60 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-white/90">{p.body}</div>
                    {p.hashtags?.length > 0 && <div className="text-xs text-sky-300">{p.hashtags.join(" ")}</div>}
                    <div>
                      <CopyButton text={`${p.body}${p.hashtags?.length ? "\n\n" + p.hashtags.join(" ") : ""}`} label="Poszt másolása" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 text-xs text-white/45">Judit minden nap új, projekt-alapú LinkedIn-posztot ír; ha a LinkedIn össze van kötve, automatikusan ki is posztolja (egyébként a „Poszt másolása" gombbal viheted fel).</div>
          </section>

          {d.blogPosts?.length > 0 && (
            <section>
              <h2 className="section-title">📰 Webshop blog (Judit)</h2>
              <div className="flex flex-col gap-2">
                {d.blogPosts.slice(0, 8).map((b, i) => (
                  <div key={i} className="card flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{b.title}</div>
                      <a href={b.url} target="_blank" rel="noreferrer" className="block truncate text-xs text-sky-300">{b.url}</a>
                    </div>
                    <span className="shrink-0 text-xs text-white/40">{b.date}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-xs text-white/45">Judit hetente (hétfőn) ír egy SEO blogcikket; Luca ékezet-ellenőrzése után automatikusan kikerül a webshop blogjára.</div>
            </section>
          )}

          {(d.lucaReach || d.klariBrief) && (
            <section className="card" style={{ borderLeft: `4px solid ${meta.accent}` }}>
              <h2 className="section-title">🎯 Luca elérés-terve</h2>
              {d.lucaReach && <div className="text-sm text-white/80">{d.lucaReach}</div>}
              {d.klariBrief && <div className="mt-2 text-sm text-white/70"><span className="text-white/45">👉 Klárinak delegálva: </span>{d.klariBrief}</div>}
            </section>
          )}

          <section>
            <h2 className="section-title">🛒 Valós eladások (webshop)</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Kpi title="Eladás ma" value={`${num(d.orders.todayCount)} db`} accent={d.orders.todayCount > 0 ? "good" : undefined} />
              <Kpi title="Eladás (hó)" value={`${num(d.orders.monthCount)} db`} accent={d.orders.monthCount > 0 ? "good" : undefined} />
              <Kpi title="Havi bevétel" value={ft(d.orders.monthRevenue)} accent={d.orders.monthRevenue > 0 ? "good" : undefined} />
              <Kpi title="Valós ROAS (30 nap)" value={realRoasMonth ? `${realRoasMonth}×` : "—"} accent={realRoasMonth >= 3 ? "good" : realRoasMonth > 0 ? "warn" : undefined} />
            </div>
            <div className="mt-2 text-xs text-white/45">
              Valós ROAS = webshop havi bevétel ({ft(d.orders.monthRevenue)}) ÷ Google Ads-költés (~{ft(adSpendMonth)}, K&H utolsó 30 nap). Ez a tényleges eladásokat tükrözi, függetlenül a Google Ads méréstol.
            </div>
          </section>

          <section>
            <h2 className="section-title">📣 Google Ads (a platform saját mérése)</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Kpi title="Mai költés" value={ft(totalCost)} />
              <Kpi title="Hirdetésből bevétel" value={ft(totalVal)} />
              <Kpi title="ROAS" value={totalRoas ? `${totalRoas}×` : "—"} accent={totalRoas >= 3 ? "good" : totalRoas > 0 ? "warn" : undefined} />
              <Kpi title="Konverziók" value={num(totalConv)} />
            </div>
            <div className="mt-2 text-xs text-white/45">
              A Konverzió/ROAS itt a Google Ads <b>konverziókövetésébol</b> jön — csak akkor mutat értéket, ha a webshopon be van állítva a konverziómérés ÉS a vásárló hirdetésre kattintva érkezett. A valós eladásokat fent látod.
            </div>
          </section>

          <section>
            <h2 className="section-title">🛍️ Árukereső</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <Kpi title="Árukereső költés (30 nap)" value={ft(arukeresoSpend)} />
              <Kpi title="Csomag" value="STANDARD" />
              <Kpi title="Mérés" value="kattintás → admin" />
            </div>
            <div className="mt-2 text-xs text-white/45">
              A költést a K&H-ból olvassuk (a befizetés után jelenik meg). Az Árukeresonek <b>nincs nyílt API-ja</b>, ezért a kattintás/megjelenés statisztika a partner-admin „Statisztikák" alatt érheto el. Az Árukeresorol jövo eladások méréséhez az <b>Árukereso konverziókövetést</b> kell beállítani (mint a Google Adsnél).
            </div>
          </section>

          <section>
            <h2 className="section-title">📊 Meta (Facebook / Instagram)</h2>
            <div className="card text-sm">
              <div>Pixel: <span className="text-green-300 font-medium">aktív</span> — a webshop méri a megtekintést, kosárba tételt és a vásárlást.</div>
              {d.meta ? (
                d.meta.ready ? (
                  <div className="mt-1 text-emerald-300">🚀 A <b>retargeting-kampány indulhat</b> — Luca jelezte. Szólj, és összerakjuk.</div>
                ) : (
                  <div className="mt-1 text-white/70">⏳ A retargeting-közönség épül — Luca kb. <b>{d.meta.daysLeft} nap</b> múlva szól, hogy indulhat a kampány.</div>
                )
              ) : (
                <div className="mt-1 text-white/55">Luca figyeli a Metát, és szól, amikor a kampány indulhat.</div>
              )}
              <div className="mt-2 border-t border-white/10 pt-2">
                {!d.facebook.configured ? (
                  <span className="text-white/45">📘 FB-oldal auto-poszt: nincs beállítva (FB_PAGE_ID / FB_PAGE_TOKEN hiányzik).</span>
                ) : d.facebook.connected ? (
                  <span className="text-green-300">📘 FB-oldal összekötve{d.facebook.pageName ? ` · ${d.facebook.pageName}` : ""} — Klári napi plakátja automatikusan kimegy ide is.</span>
                ) : (
                  <span className="text-amber-200">⚠️ FB-oldal token hiba — ellenorizd a FB_PAGE_TOKEN-t{d.facebook.error ? ` (${d.facebook.error})` : ""}.</span>
                )}
              </div>
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
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="section-title" style={{ margin: 0 }}>🖥️ Felügyelt oldalak</h2>
              <span className="text-xs text-white/45">Publikus: élő ellenőrzés most · {dayHu(new Date())}</span>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {sites.map((s) => {
                const fresh = isTodayBp(s.checked_at);
                // A publikus oldalt épp most pingeltük. A LAN-nál, ha a jelentés NEM mai → elavult jelzés.
                const stale = s.scope === "lan" && !fresh;
                const dot = stale ? "⚪" : s.status === "up" ? "🟢" : s.status === "down" ? "🔴" : "⚪";
                return (
                  <a key={s.id} href={s.url} target="_blank" rel="noreferrer" className="card card-hover flex items-center justify-between gap-2 py-2.5">
                    <span className="min-w-0">
                      <span className="text-sm font-medium">{dot} {s.name}</span>
                      <span className="block truncate text-xs text-white/45">{s.url}</span>
                    </span>
                    <span className="shrink-0 text-right text-xs text-white/50">
                      <span className="badge bg-white/10 text-white/60">{s.scope === "lan" ? "LAN" : "publikus"}</span>
                      <span className={`block ${stale ? "text-amber-300" : "text-white/40"}`}>{stale ? "⚠ régi: " : "🕑 "}{checkedLabel(s.checked_at)}</span>
                      {s.status === "down" && s.note ? <span className="block text-red-300">{s.note}</span> : null}
                    </span>
                  </a>
                );
              })}
            </div>
            <div className="mt-2 text-xs text-white/40">A LAN-oldalakat a helyi agent jelenti (amíg a gép be van kapcsolva); „⚠ régi" = a jelentés nem mai.</div>
          </section>
        </>
      )}

      {/* ===== GAZDASÁGI ===== */}
      {params.key === "gazdasagi" && (
        <>
          <MemberRow name={d.agents.find((a) => a.key === "mihaly")?.name || "Mihály"} role="gazdasági vezető · bevétel + kiadás" note={note("mihaly")} />

          {d.mihalyReport?.summary && (
            <section className="card" style={{ borderLeft: `4px solid ${meta.accent}` }}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <h2 className="section-title" style={{ margin: 0 }}>🧮 Mihály elemzése</h2>
                {d.mihalyReport.asOf && <span className="text-xs text-white/40">frissítve: {dayHu(new Date(d.mihalyReport.asOf))} {timeHu(new Date(d.mihalyReport.asOf))}</span>}
              </div>
              <div className="text-sm text-white/85">{d.mihalyReport.summary}</div>
              {d.mihalyReport.suggestions?.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-sm text-white/75">
                  {d.mihalyReport.suggestions.map((s, i) => <li key={i}>💡 {s}</li>)}
                </ul>
              )}
            </section>
          )}

          <section>
            <h2 className="section-title">📊 Havi pénzügyi kép (utolsó 30 nap)</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Kpi title="Rendszeres havi bevétel" value={ft(d.orders.monthRevenue)} accent={d.orders.monthRevenue > 0 ? "good" : undefined} />
              <Kpi title="Hirdetésekre" value={ft(totalAdSpend)} accent="warn" />
              <Kpi title="AI-előfizetésekre" value={aiSpend ? ft(aiSpend) : "—"} accent="warn" />
              <Kpi title="Eredmény (bevétel − kiadás)" value={ft(monthResult)} accent={monthResult >= 0 ? "good" : "warn"} />
            </div>
            <div className="mt-2 text-xs text-white/45">
              Hirdetés = Google Ads (~{ft(adSpendMonth)}) + Árukereső (~{ft(arukeresoSpend)}) + Meta (~{ft(metaSpend)}). AI-előfizetés = a rendszer szolgáltatásai (Claude, Higgsfield, Vercel, Supabase) a K&H tételeiből. Eredmény = havi bevétel − összes kiadás ({ft(d.bank.out30 || 0)}, K&H utolsó 30 nap).
            </div>
          </section>

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
                    <tr><th className="py-1">Rendelés</th><th>Dátum</th><th>Állapot</th><th className="text-right">Végösszeg</th><th className="text-right">Számla</th></tr>
                  </thead>
                  <tbody>
                    {d.orders.recent.map((o) => {
                      const inv = d.invoicedOrders[o.key];
                      return (
                        <tr key={o.key} className={`border-t border-white/5 ${inv ? "bg-green-500/20" : ""}`}>
                          <td className="py-2 pr-3 text-white/70">{o.key}</td>
                          <td className="pr-3 text-white/60">{o.date}</td>
                          <td className="pr-3"><span className="badge bg-green-500/20 text-green-300">{o.status}</span></td>
                          <td className="text-right font-semibold">{ft(o.sumGross)}</td>
                          <td className="py-2 text-right">
                            <InvoiceButton orderKey={o.key} invoiced={!!inv} invoiceNumber={inv?.invoiceNumber} publicUrl={inv?.publicUrl} />
                          </td>
                        </tr>
                      );
                    })}
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
                <div className="mb-2 text-xs text-white/45">
                  {d.bank.asOf ? `Frissítve: ${dayHu(new Date(d.bank.asOf))} ${timeHu(new Date(d.bank.asOf))}` : "Még nincs szinkron"} · automatikus lekérdezés naponta ~19:00
                </div>
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
