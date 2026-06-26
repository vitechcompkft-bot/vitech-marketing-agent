import { supabaseAdmin } from "./supabase";
import type { OrderDetail } from "./unas";

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

async function bgPost(path: string, body: any): Promise<any> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "X-API-KEY": process.env.BILLINGO_API_KEY as string, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) throw new Error(`Billingo ${res.status}: ${(text || "").slice(0, 300)}`);
  return json;
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

// ============================================================================
// SZÁMLÁZÁS — webshop-rendelésbol Billingo-számla (elonézet → jóváhagyás → kiállítás)
// ============================================================================

export interface InvoicedRecord {
  invoiceId: number;
  invoiceNumber: string;
  createdAt: string;
  gross?: number;
  publicUrl?: string;
}

/** A már KISZÁMLÁZOTT rendelések (rendelésszám → számla). app_state.order_invoices JSON. */
export async function getInvoicedOrders(): Promise<Record<string, InvoicedRecord>> {
  try {
    const sb = supabaseAdmin();
    const { data } = await sb.from("app_state").select("value").eq("key", "order_invoices").maybeSingle();
    if (!data?.value) return {};
    return JSON.parse(data.value) as Record<string, InvoicedRecord>;
  } catch {
    return {};
  }
}

async function recordInvoicedOrder(orderKey: string, rec: InvoicedRecord): Promise<void> {
  const sb = supabaseAdmin();
  const map = await getInvoicedOrders();
  map[orderKey] = rec;
  await sb.from("app_state").upsert({ key: "order_invoices", value: JSON.stringify(map), updated_at: new Date().toISOString() });
}

/** Unas fizetési típus/név → Billingo payment_method. */
function mapPayment(type?: string, name?: string): string {
  const t = (type || "").toLowerCase();
  const n = (name || "").toLowerCase();
  if (t.includes("cod") || n.includes("utánvét") || n.includes("utanvet")) return "cash_on_delivery";
  if (t.includes("transfer") || n.includes("átutal") || n.includes("utalás") || n.includes("utalas")) return "wire_transfer";
  if (t.includes("card") || n.includes("kártya") || n.includes("bankkártya") || n.includes("simple") || n.includes("online")) return "bankcard";
  if (t.includes("cash") || n.includes("készpénz") || n.includes("keszpenz") || n.includes("személyes") || n.includes("szemelyes")) return "cash";
  return "wire_transfer";
}

/** A számlatömb (block) id-je — dinamikusan (típus=invoice), hogy ne legyen beégetve. */
async function invoiceBlockId(): Promise<number> {
  const j = await bgFetch(`/document-blocks`).catch(() => ({ data: [] }));
  const blocks: any[] = j.data || [];
  const inv = blocks.find((b) => b.type === "invoice") || blocks[0];
  if (!inv) throw new Error("Nincs Billingo számlatömb (document block).");
  return inv.id;
}

/** A vevo Billingo-partner: meglévot keres (adószám/név+irsz), különben létrehoz. Visszaadja a partner_id-t. */
async function findOrCreatePartner(o: OrderDetail): Promise<number> {
  const name = (o.invoice.name || o.customerName || "Vásárló").trim();
  const tax = (o.invoice.taxNumber || "").trim();
  const q = tax || name;
  if (q) {
    const found = await bgFetch(`/partners?query=${encodeURIComponent(q)}&per_page=25`).catch(() => ({ data: [] }));
    const list: any[] = found.data || [];
    const match = tax
      ? list.find((p) => (p.taxcode || "").replace(/\D/g, "") === tax.replace(/\D/g, "") && tax.replace(/\D/g, "").length >= 8)
      : list.find((p) => (p.name || "").trim().toLowerCase() === name.toLowerCase() && (p.address?.post_code || "") === (o.invoice.zip || ""));
    if (match) return match.id;
  }
  const created = await bgPost(`/partners`, {
    name,
    address: {
      country_code: (o.invoice.countryCode || "HU").toUpperCase().slice(0, 2),
      post_code: o.invoice.zip || "",
      city: o.invoice.city || "",
      address: o.invoice.street || "",
    },
    emails: o.email ? [o.email] : [],
    taxcode: tax,
    phone: o.phone || "",
    tax_type: tax ? "HAS_TAX_NUMBER" : "NO_TAX_NUMBER",
  });
  const id = created?.id ?? created?.data?.id;
  if (!id) throw new Error("A partner létrehozása nem sikerült a Billingóban.");
  return id;
}

function addDays(yyyymmdd: string, days: number): string {
  const d = new Date(yyyymmdd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface InvoiceCreateResult {
  ok: boolean;
  alreadyInvoiced?: boolean;
  invoiceId?: number;
  invoiceNumber?: string;
  publicUrl?: string;
  error?: string;
}

/**
 * Számla kiállítása egy webshop-rendelésbol. DUPLIKÁCIÓ-VÉDETT: ha a rendelésre már készült
 * számla (app_state.order_invoices), nem állít ki újat.
 */
export async function createInvoiceForOrder(o: OrderDetail): Promise<InvoiceCreateResult> {
  if (!billingoEnabled()) return { ok: false, error: "Nincs BILLINGO_API_KEY." };

  // 1) Duplikáció-védelem
  const invoiced = await getInvoicedOrders();
  if (invoiced[o.key]) {
    const r = invoiced[o.key];
    return { ok: true, alreadyInvoiced: true, invoiceId: r.invoiceId, invoiceNumber: r.invoiceNumber, publicUrl: r.publicUrl };
  }
  if (!o.items.length) return { ok: false, error: "A rendelésnek nincs tétele." };

  // 2) Partner + számla összeállítása
  const partnerId = await findOrCreatePartner(o);
  const blockId = await invoiceBlockId();
  const today = todayStr();
  const pm = mapPayment(o.payment.type, o.payment.name);
  const dueDate = pm === "wire_transfer" ? addDays(today, 8) : today;

  const payload = {
    partner_id: partnerId,
    block_id: blockId,
    type: "invoice",
    fulfillment_date: today,
    due_date: dueDate,
    payment_method: pm,
    currency: "HUF",
    language: "hu",
    electronic: false,
    paid: false,
    items: o.items.map((it) => ({
      name: it.name,
      // BRUTTÓ egységárral állítjuk ki → a számla végösszege pontosan a fizetett bruttóval egyezik
      unit_price: it.unitGross,
      unit_price_type: "gross" as const,
      quantity: it.quantity,
      unit: "db",
      vat: it.vat || "27%",
    })),
    settings: { order_number: o.key, should_send_email: false },
    comment: `Webshop rendelés: ${o.key}`,
  };

  // 3) Kiállítás
  const doc = await bgPost(`/documents`, payload);
  const invoiceId: number = doc?.id;
  const invoiceNumber: string = doc?.invoice_number || String(invoiceId);
  if (!invoiceId) return { ok: false, error: "A számla kiállítása nem adott vissza azonosítót." };

  // 4) Publikus URL (PDF megosztáshoz) — ha nem megy, nem baj
  let publicUrl: string | undefined;
  try {
    const pj = await bgPost(`/documents/${invoiceId}/online`, {});
    publicUrl = pj?.public_url || pj?.url;
  } catch {
    /* a publikus URL nem kritikus */
  }

  // 5) Nyilvántartásba vesszük (duplikáció-védelem)
  await recordInvoicedOrder(o.key, {
    invoiceId,
    invoiceNumber,
    createdAt: new Date().toISOString(),
    gross: Number(doc?.gross_total || o.sumGross || 0),
    publicUrl,
  });

  return { ok: true, invoiceId, invoiceNumber, publicUrl };
}

/** Elonézet a rendelésbol (a kiállítás ELOTT) — a UI ezt mutatja jóváhagyásra. */
export interface InvoicePreview {
  ok: boolean;
  orderKey: string;
  alreadyInvoiced: boolean;
  existing?: InvoicedRecord;
  buyer: { name: string; address: string; taxNumber?: string; email?: string };
  paymentMethod: string;
  items: { name: string; quantity: number; unitNet: number; unitGross: number; vat: string; lineGross: number }[];
  sumGross: number;
  error?: string;
}

export async function buildInvoicePreview(o: OrderDetail): Promise<InvoicePreview> {
  const invoiced = await getInvoicedOrders();
  const existing = invoiced[o.key];
  const addr = [o.invoice.zip, o.invoice.city, o.invoice.street].filter(Boolean).join(" ");
  return {
    ok: true,
    orderKey: o.key,
    alreadyInvoiced: !!existing,
    existing,
    buyer: {
      name: o.invoice.name || o.customerName || "Vásárló",
      address: [o.invoice.country, addr].filter(Boolean).join(", "),
      taxNumber: o.invoice.taxNumber || undefined,
      email: o.email || undefined,
    },
    paymentMethod: mapPayment(o.payment.type, o.payment.name),
    items: o.items.map((it) => ({
      name: it.name,
      quantity: it.quantity,
      unitNet: it.unitNet,
      unitGross: it.unitGross,
      vat: it.vat,
      lineGross: Math.round(it.unitGross * it.quantity),
    })),
    sumGross: o.sumGross,
  };
}
