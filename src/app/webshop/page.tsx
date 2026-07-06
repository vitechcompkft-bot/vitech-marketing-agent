import Link from "next/link";
import { getWebshopData, syncWebshopOrders } from "@/lib/webshop";
import WebshopRefresh from "@/components/WebshopRefresh";
import WebshopOrderActions from "@/components/WebshopOrderActions";

export const dynamic = "force-dynamic";

const ft = (n: number) => new Intl.NumberFormat("hu-HU").format(Math.round(n || 0)) + " Ft";
const shortDate = (s: string) => (s || "").slice(0, 16); // "2026.07.04 18:07"

function relTime(iso: string | null): string {
  if (!iso) return "még nem frissült";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "épp most";
  if (mins < 60) return `${mins} perce`;
  const h = Math.round(mins / 60);
  return `${h} órája`;
}

export default async function WebshopPage() {
  // Elso betöltéskor feltöltjük (a throttle miatt utána 30 percig csak a helyi agent frissít, gyors marad).
  await syncWebshopOrders(false).catch(() => {});
  const d = await getWebshopData();
  const k = d.kpis;

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">🛒 Webshop — megrendelések és vásárlók</h1>
        <div className="flex items-center gap-2">
          <WebshopRefresh />
          <Link className="btn btn-ghost" href="/">← Áttekintés</Link>
        </div>
      </div>

      <div className="text-xs text-white/45">
        Automatikus frissítés az Unasból 30 percenként · utolsó frissítés: {relTime(d.lastSyncAt)}
      </div>

      {/* KPI-k */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="card">
          <div className="text-xs text-white/50">Összes rendelés</div>
          <div className="text-2xl font-bold">{k.totalOrders}</div>
        </div>
        <div className="card">
          <div className="text-xs text-white/50">Havi rendelés</div>
          <div className="text-2xl font-bold">{k.monthOrders}</div>
          <div className="text-xs text-white/45">{ft(k.monthRevenue)}</div>
        </div>
        <div className="card">
          <div className="text-xs text-white/50">Számlázott / nyitott</div>
          <div className="text-2xl font-bold">
            <span className="text-green-300">{k.invoicedCount}</span>
            <span className="text-white/30"> / </span>
            <span className="text-amber-200">{k.notInvoicedCount}</span>
          </div>
        </div>
        <div className="card">
          <div className="text-xs text-white/50">Kifizetve / fizetetlen</div>
          <div className="text-2xl font-bold">
            <span className="text-green-300">{k.paidCount}</span>
            <span className="text-white/30"> / </span>
            <span className="text-red-300">{k.unpaidCount}</span>
          </div>
        </div>
        <div className="card">
          <div className="text-xs text-white/50">Vásárlók</div>
          <div className="text-2xl font-bold">{k.customerCount}</div>
        </div>
      </section>

      {/* Rendelések */}
      <section>
        <h2 className="section-title">📦 Megrendelések ({d.orders.length})</h2>
        <div className="mb-2 flex items-center gap-3 text-xs text-white/45">
          <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-green-500/30 ring-1 ring-green-400/40" /> számlázva</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-amber-500/20 ring-1 ring-amber-400/30" /> még nincs számlázva</span>
        </div>
        {d.orders.length ? (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[1060px] text-sm">
              <thead>
                <tr className="bg-white/5 text-left text-xs uppercase text-white/50">
                  <th className="p-2">Dátum</th>
                  <th className="p-2">Rendelés</th>
                  <th className="p-2">Vásárló</th>
                  <th className="p-2">Termék</th>
                  <th className="p-2 text-right">Összeg</th>
                  <th className="p-2">Státusz</th>
                  <th className="p-2">Számla</th>
                  <th className="p-2">Fizetve</th>
                  <th className="p-2 text-right">Muvelet</th>
                </tr>
              </thead>
              <tbody>
                {d.orders.slice(0, 200).map((o) => (
                  <tr
                    key={o.key}
                    className={`border-t border-white/10 ${o.invoiced ? "bg-green-500/10" : "bg-amber-500/[0.04]"}`}
                  >
                    <td className="whitespace-nowrap p-2 text-white/70">{shortDate(o.date)}</td>
                    <td className="whitespace-nowrap p-2 font-mono text-xs text-white/85">{o.key}</td>
                    <td className="p-2">
                      <div className="font-medium text-white/90">{o.customerName || "—"}</div>
                      <div className="text-xs text-white/45">
                        {[o.city, o.email].filter(Boolean).join(" · ")}
                        {o.phone ? ` · ${o.phone}` : ""}
                      </div>
                    </td>
                    <td className="p-2 text-white/80">
                      <div className="max-w-[260px] truncate" title={o.firstItem || ""}>{o.firstItem || "—"}</div>
                      {o.itemCount > 1 && <div className="text-xs text-white/45">+{o.itemCount - 1} tétel</div>}
                    </td>
                    <td className="whitespace-nowrap p-2 text-right font-semibold">{ft(o.sumGross)}</td>
                    <td className="p-2">
                      <span className="badge bg-white/10 text-white/70">{o.status || o.statusType || "—"}</span>
                    </td>
                    <td className="p-2">
                      {o.invoiced ? (
                        o.invoiceUrl ? (
                          <a className="badge bg-green-500/20 text-green-200" href={o.invoiceUrl} target="_blank" rel="noreferrer">
                            🧾 {o.invoiceNumber || "számla"}
                          </a>
                        ) : (
                          <span className="badge bg-green-500/20 text-green-200">🧾 {o.invoiceNumber || "számlázva"}</span>
                        )
                      ) : (
                        <span className="badge bg-amber-500/15 text-amber-200/80">nyitott</span>
                      )}
                    </td>
                    <td className="p-2">
                      {o.paid === true ? (
                        <span className="badge bg-green-500/20 text-green-200">✓ fizetve{o.paymentStatus === "kézi" ? " (kézi)" : ""}</span>
                      ) : o.paid === false ? (
                        <span className="badge bg-red-500/20 text-red-200">fizetetlen</span>
                      ) : (
                        <span className="text-white/30">—</span>
                      )}
                    </td>
                    <td className="p-2 text-right">
                      <WebshopOrderActions orderKey={o.key} paid={o.paid} paymentStatus={o.paymentStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card text-sm text-white/55">Még nincs betöltött rendelés. Kattints a „Frissítés most" gombra.</div>
        )}
        {d.orders.length > 200 && <div className="mt-2 text-xs text-white/40">A 200 legutóbbi rendelés látszik (összesen {d.orders.length}).</div>}
      </section>

      {/* Vásárlók */}
      <section>
        <h2 className="section-title">👤 Vásárlók ({d.customers.length})</h2>
        {d.customers.length ? (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="bg-white/5 text-left text-xs uppercase text-white/50">
                  <th className="p-2">Név</th>
                  <th className="p-2">Elérhetoség</th>
                  <th className="p-2">Város</th>
                  <th className="p-2 text-right">Rendelés</th>
                  <th className="p-2 text-right">Összesen költött</th>
                  <th className="p-2">Utolsó</th>
                </tr>
              </thead>
              <tbody>
                {d.customers.slice(0, 100).map((c, i) => (
                  <tr key={i} className="border-t border-white/10">
                    <td className="p-2 font-medium text-white/90">{c.name}</td>
                    <td className="p-2 text-xs text-white/60">{[c.email, c.phone].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="p-2 text-white/70">{c.city || "—"}</td>
                    <td className="p-2 text-right">{c.orders}</td>
                    <td className="p-2 text-right font-semibold">{ft(c.total)}</td>
                    <td className="whitespace-nowrap p-2 text-white/60">{shortDate(c.lastDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card text-sm text-white/55">Még nincs vásárlói adat.</div>
        )}
      </section>
    </main>
  );
}
