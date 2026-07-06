import Link from "next/link";
import { getWebshopData, syncWebshopOrders } from "@/lib/webshop";
import WebshopRefresh from "@/components/WebshopRefresh";
import WebshopOrderActions from "@/components/WebshopOrderActions";

export const dynamic = "force-dynamic";

const ft = (n: number) => new Intl.NumberFormat("hu-HU").format(Math.round(n || 0)) + " Ft";
const shortDate = (s: string) => (s || "").slice(0, 16); // "2026.07.04 18:07"
const shortDT = (s: string) => (s || "").slice(5, 16); // "07.04 18:07" (év nélkül)
const shortKey = (k: string) => (k || "").split("-").pop() || k; // "64089-100013" → "100013"
const shortStatus = (o: { status?: string; statusType?: string }) =>
  o.statusType === "close_ok" ? "lezárva" : (o.status || o.statusType || "—").replace(/^Megrendelés\s+/i, "");

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
            <table className="w-full table-fixed text-xs">
              <colgroup>
                <col className="w-[9%]" />
                <col className="w-[7%]" />
                <col className="w-[20%]" />
                <col className="w-[21%]" />
                <col className="w-[10%]" />
                <col className="w-[8%]" />
                <col className="w-[9%]" />
                <col className="w-[9%]" />
                <col className="w-[7%]" />
              </colgroup>
              <thead>
                <tr className="bg-white/5 text-left text-[10px] uppercase tracking-wide text-white/50">
                  <th className="p-1.5 font-medium">Dátum</th>
                  <th className="p-1.5 font-medium">Rend.</th>
                  <th className="p-1.5 font-medium">Vásárló</th>
                  <th className="p-1.5 font-medium">Termék</th>
                  <th className="p-1.5 text-right font-medium">Összeg</th>
                  <th className="p-1.5 font-medium">Státusz</th>
                  <th className="p-1.5 font-medium">Számla</th>
                  <th className="p-1.5 font-medium">Fizetve</th>
                  <th className="p-1.5 text-right font-medium"> </th>
                </tr>
              </thead>
              <tbody>
                {d.orders.slice(0, 200).map((o) => (
                  <tr
                    key={o.key}
                    className={`border-t border-white/10 ${o.invoiced ? "bg-green-500/10" : "bg-amber-500/[0.04]"}`}
                  >
                    <td className="whitespace-nowrap p-1.5 text-white/70" title={o.date}>{shortDT(o.date)}</td>
                    <td className="whitespace-nowrap p-1.5 font-mono text-white/85" title={o.key}>{shortKey(o.key)}</td>
                    <td className="overflow-hidden p-1.5">
                      <div className="truncate font-medium text-white/90" title={o.customerName || ""}>{o.customerName || "—"}</div>
                      <div className="truncate text-[11px] text-white/45" title={[o.city, o.email, o.phone].filter(Boolean).join(" · ")}>
                        {[o.city, o.email].filter(Boolean).join(" · ") || o.phone || ""}
                      </div>
                    </td>
                    <td className="overflow-hidden p-1.5 text-white/80">
                      <div className="truncate" title={o.firstItem || ""}>{o.firstItem || "—"}</div>
                      {o.itemCount > 1 && <div className="text-[11px] text-white/45">+{o.itemCount - 1} tétel</div>}
                    </td>
                    <td className="whitespace-nowrap p-1.5 text-right font-semibold">{ft(o.sumGross)}</td>
                    <td className="overflow-hidden p-1.5">
                      <span className="text-white/60" title={o.status || ""}>{shortStatus(o)}</span>
                    </td>
                    <td className="overflow-hidden p-1.5">
                      {o.invoiced ? (
                        o.invoiceUrl ? (
                          <a className="block truncate text-green-300 underline" href={o.invoiceUrl} target="_blank" rel="noreferrer" title={o.invoiceNumber || "számla"}>
                            🧾 {o.invoiceNumber || "számla"}
                          </a>
                        ) : (
                          <span className="block truncate text-green-300" title={o.invoiceNumber || "számlázva"}>🧾 {o.invoiceNumber || "kész"}</span>
                        )
                      ) : (
                        <span className="text-amber-200/80">nyitott</span>
                      )}
                    </td>
                    <td className="p-1.5">
                      {o.paid === true ? (
                        <span className="text-green-300" title={o.paymentStatus === "kézi" ? "kézi (készpénz)" : "fizetve"}>✓ fizetve</span>
                      ) : o.paid === false ? (
                        <span className="text-red-300">fizetetlen</span>
                      ) : (
                        <span className="text-white/30">—</span>
                      )}
                    </td>
                    <td className="p-1.5 text-right">
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
            <table className="w-full table-fixed text-xs">
              <colgroup>
                <col className="w-[22%]" />
                <col className="w-[34%]" />
                <col className="w-[16%]" />
                <col className="w-[8%]" />
                <col className="w-[12%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead>
                <tr className="bg-white/5 text-left text-[10px] uppercase tracking-wide text-white/50">
                  <th className="p-1.5 font-medium">Név</th>
                  <th className="p-1.5 font-medium">Elérhetoség</th>
                  <th className="p-1.5 font-medium">Város</th>
                  <th className="p-1.5 text-right font-medium">Rend.</th>
                  <th className="p-1.5 text-right font-medium">Költött</th>
                  <th className="p-1.5 font-medium">Utolsó</th>
                </tr>
              </thead>
              <tbody>
                {d.customers.slice(0, 100).map((c, i) => (
                  <tr key={i} className="border-t border-white/10">
                    <td className="overflow-hidden p-1.5"><div className="truncate font-medium text-white/90" title={c.name}>{c.name}</div></td>
                    <td className="overflow-hidden p-1.5 text-white/60"><div className="truncate" title={[c.email, c.phone].filter(Boolean).join(" · ")}>{[c.email, c.phone].filter(Boolean).join(" · ") || "—"}</div></td>
                    <td className="overflow-hidden p-1.5 text-white/70"><div className="truncate" title={c.city || ""}>{c.city || "—"}</div></td>
                    <td className="p-1.5 text-right">{c.orders}</td>
                    <td className="whitespace-nowrap p-1.5 text-right font-semibold">{ft(c.total)}</td>
                    <td className="whitespace-nowrap p-1.5 text-white/60" title={c.lastDate}>{shortDT(c.lastDate)}</td>
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
