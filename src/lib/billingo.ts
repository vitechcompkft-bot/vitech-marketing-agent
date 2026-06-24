const BASE = "https://api.billingo.hu/v3";

export function billingoEnabled(): boolean {
  return !!process.env.BILLINGO_API_KEY;
}

async function bgFetch(path: string): Promise<any> {
  const res = await fetch(BASE + path, {
    headers: { "X-API-KEY": process.env.BILLINGO_API_KEY as string, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Billingo ${res.status}`);
  return res.json();
}

export interface BillingoInvoice {
  number: string;
  partner: string;
  gross: number;
  currency: string;
  dueDate: string;
  expired: boolean;
}

export interface BillingoSummary {
  ok: boolean;
  // KIMENO fizetetlen (kintlévoség — nekünk tartoznak)
  outCount: number;
  outTotalHuf: number;
  outExpired: number;
  out: BillingoInvoice[];
  // BEJÖVO/szállítói fizetetlen (utalandó — mi tartozunk)
  inCount: number;
  inTotalHuf: number;
  inExpired: number;
  in: BillingoInvoice[];
  note?: string;
}

const EMPTY: BillingoSummary = { ok: false, outCount: 0, outTotalHuf: 0, outExpired: 0, out: [], inCount: 0, inTotalHuf: 0, inExpired: 0, in: [] };
const todayStr = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest" }).format(new Date());

/** Deduplikálás számlaszám szerint (az outstanding+expired lekérés átfedhet). */
function dedupe(list: BillingoInvoice[]): BillingoInvoice[] {
  const seen = new Set<string>();
  return list.filter((x) => (seen.has(x.number) ? false : (seen.add(x.number), true)));
}

function summarize(list: BillingoInvoice[]) {
  const totalHuf = list.filter((u) => u.currency === "HUF").reduce((s, u) => s + u.gross, 0);
  const expired = list.filter((u) => u.expired).length;
  return { totalHuf, expired };
}

/** KIMENO (kintlévoség) + BEJÖVO/szállítói (utalandó) fizetetlen számlák a Billingóból. */
export async function getBillingoSummary(): Promise<BillingoSummary> {
  if (!billingoEnabled()) return { ...EMPTY, note: "Nincs BILLINGO_API_KEY" };
  const today = todayStr();
  try {
    // 1) KIMENO fizetetlen (outstanding + expired)
    const outItems: any[] = [];
    for (const ps of ["outstanding", "expired"]) {
      const j = await bgFetch(`/documents?type=invoice&payment_status=${ps}&per_page=50`).catch(() => ({ data: [] }));
      for (const d of j.data || []) outItems.push(d);
    }
    const out: BillingoInvoice[] = dedupe(
      outItems.map((d) => ({
        number: d.invoice_number || String(d.id),
        partner: d.partner?.name || "—",
        gross: Number(d.gross_total || 0),
        currency: d.currency || "HUF",
        dueDate: (d.due_date || "").slice(0, 10),
        expired: d.payment_status === "expired",
      }))
    ).sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));

    // 2) BEJÖVO/szállítói (spendings) — fizetetlen = paid_at üres. (Nincs szerveroldali szuro → kliensoldalon.)
    const spJson = await bgFetch(`/spendings?per_page=100`).catch(() => ({ data: [] }));
    const inAll: any[] = spJson.data || [];
    const inUnpaid: BillingoInvoice[] = dedupe(
      inAll
        .filter((s) => !s.paid_at)
        .map((s) => {
          const due = (s.due_date || "").slice(0, 10);
          return {
            number: s.invoice_number || String(s.id),
            partner: s.partner?.name || "—",
            gross: Number(s.total_gross || 0),
            currency: s.currency?.value || s.currency || "HUF",
            dueDate: due,
            expired: !!due && due < today,
          };
        })
    ).sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));

    const o = summarize(out);
    const i = summarize(inUnpaid);
    return {
      ok: true,
      outCount: out.length,
      outTotalHuf: o.totalHuf,
      outExpired: o.expired,
      out: out.slice(0, 25),
      inCount: inUnpaid.length,
      inTotalHuf: i.totalHuf,
      inExpired: i.expired,
      in: inUnpaid.slice(0, 25),
    };
  } catch (e: any) {
    return { ...EMPTY, note: "Billingo hiba: " + (e?.message || "?") };
  }
}
