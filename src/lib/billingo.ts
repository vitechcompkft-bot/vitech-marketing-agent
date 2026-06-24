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
  status: string; // outstanding | expired
}

export interface BillingoSummary {
  ok: boolean;
  unpaidCount: number;
  unpaidTotalHuf: number; // csak a HUF-os tételek összege
  expiredCount: number; // ebbol lejárt (sürgos)
  unpaid: BillingoInvoice[];
  note?: string;
}

/**
 * KIMENO (kiállított) fizetetlen számlák a Billingóból (kintlévoség).
 * FONTOS: a Billingo v3 API NEM ad BEJÖVO/szállítói számlát — csak a kiállítottakat.
 */
export async function getBillingoSummary(): Promise<BillingoSummary> {
  if (!billingoEnabled()) {
    return { ok: false, unpaidCount: 0, unpaidTotalHuf: 0, expiredCount: 0, unpaid: [], note: "Nincs BILLINGO_API_KEY" };
  }
  try {
    const items: any[] = [];
    for (const ps of ["outstanding", "expired"]) {
      const j = await bgFetch(`/documents?type=invoice&payment_status=${ps}&per_page=50`);
      for (const d of j.data || []) items.push(d);
    }
    const unpaid: BillingoInvoice[] = items
      .map((d) => ({
        number: d.invoice_number || String(d.id),
        partner: d.partner?.name || "—",
        gross: Number(d.gross_total || 0),
        currency: d.currency || "HUF",
        dueDate: d.due_date || "",
        status: d.payment_status || "",
      }))
      .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));

    const unpaidTotalHuf = unpaid.filter((u) => u.currency === "HUF").reduce((s, u) => s + u.gross, 0);
    const expiredCount = unpaid.filter((u) => u.status === "expired").length;
    return { ok: true, unpaidCount: unpaid.length, unpaidTotalHuf, expiredCount, unpaid: unpaid.slice(0, 25) };
  } catch (e: any) {
    return { ok: false, unpaidCount: 0, unpaidTotalHuf: 0, expiredCount: 0, unpaid: [], note: "Billingo hiba: " + (e?.message || "?") };
  }
}
