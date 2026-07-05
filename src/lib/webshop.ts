import { supabaseAdmin } from "./supabase";
import { unasLogin, unasGetOrdersFull, type UnasOrderSummary } from "./unas";
import { getInvoicedOrders } from "./billingo";

const STATE_KEY = "webshop_orders";
const SYNC_MIN = 30; // 30 percenként frissítünk az Unasból
const MAX_STORE = 1000; // ennyi legutóbbi rendelést tartunk

interface Stored {
  orders: UnasOrderSummary[];
  lastSyncAt: string | null;
}

async function load(): Promise<Stored> {
  try {
    const { data } = await supabaseAdmin().from("app_state").select("value").eq("key", STATE_KEY).maybeSingle();
    if (data?.value) {
      const j = JSON.parse(data.value);
      return { orders: Array.isArray(j.orders) ? j.orders : [], lastSyncAt: j.lastSyncAt || null };
    }
  } catch {
    /* elso futás */
  }
  return { orders: [], lastSyncAt: null };
}

async function save(s: Stored) {
  await supabaseAdmin()
    .from("app_state")
    .upsert({ key: STATE_KEY, value: JSON.stringify(s), updated_at: new Date().toISOString() });
}

/**
 * Rendelések frissítése az Unasból. Alapból 30 PERCENKÉNT tényleges (force=true megkerüli a throttle-t).
 * A helyi health-agent 2 percenként hívja → a throttle miatt 30 percenként fut le ténylegesen.
 * Az ÚJ rendeléseket beemeli a tárolt listába (kulcs szerint), a többit frissíti.
 */
export async function syncWebshopOrders(force = false): Promise<{ synced: boolean; added: number; total: number; skipped?: string }> {
  const stored = await load();
  if (!force && stored.lastSyncAt) {
    const mins = (Date.now() - new Date(stored.lastSyncAt).getTime()) / 60000;
    if (mins < SYNC_MIN) return { synced: false, added: 0, total: stored.orders.length, skipped: `még ${Math.max(1, Math.round(SYNC_MIN - mins))} perc` };
  }
  const token = await unasLogin();
  const fetched = await unasGetOrdersFull(token, { limitNum: 500 });
  const map = new Map(stored.orders.map((o) => [o.key, o]));
  let added = 0;
  for (const o of fetched) {
    if (!map.has(o.key)) added++;
    map.set(o.key, o); // frissítjük a meglévot is (státusz változhat)
  }
  const orders = [...map.values()].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, MAX_STORE);
  await save({ orders, lastSyncAt: new Date().toISOString() });
  return { synced: true, added, total: orders.length };
}

export interface WebshopOrderRow extends UnasOrderSummary {
  invoiced: boolean;
  invoiceNumber?: string;
  invoiceUrl?: string;
}

export interface WebshopCustomer {
  name: string;
  email?: string;
  phone?: string;
  city?: string;
  orders: number;
  total: number;
  lastDate: string;
}

export interface WebshopData {
  ok: boolean;
  lastSyncAt: string | null;
  orders: WebshopOrderRow[];
  customers: WebshopCustomer[];
  kpis: {
    totalOrders: number;
    totalRevenue: number;
    monthOrders: number;
    monthRevenue: number;
    invoicedCount: number;
    notInvoicedCount: number;
    customerCount: number;
  };
}

const bpMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest", year: "numeric", month: "2-digit" }).format(new Date()); // "2026-07"

/** A Webshop-oldal adatai: rendelések (számlázott jelöléssel), vásárlók, KPI-k. */
export async function getWebshopData(): Promise<WebshopData> {
  const stored = await load();
  const invoiced = await getInvoicedOrders();

  const orders: WebshopOrderRow[] = stored.orders.map((o) => {
    const inv = invoiced[o.key];
    return { ...o, invoiced: !!inv, invoiceNumber: inv?.invoiceNumber || undefined, invoiceUrl: inv?.publicUrl || undefined };
  });

  // Az Unas dátumformátuma "2026.07.04 18:07:59" → a hónap-prefix "2026.07".
  const monthPrefix = bpMonth().replace("-", ".");
  const monthOrders = orders.filter((o) => (o.date || "").startsWith(monthPrefix));

  // Vásárlók összesítése (email, vagy ha nincs, név alapján).
  const cmap = new Map<string, WebshopCustomer>();
  for (const o of orders) {
    const name = (o.customerName || o.invoiceName || "Ismeretlen vásárló").trim();
    const id = (o.email || name).toLowerCase();
    const c = cmap.get(id) || { name, email: o.email, phone: o.phone, city: o.city, orders: 0, total: 0, lastDate: "" };
    c.orders += 1;
    c.total += o.sumGross || 0;
    if ((o.date || "") > c.lastDate) c.lastDate = o.date || "";
    if (!c.email && o.email) c.email = o.email;
    if (!c.phone && o.phone) c.phone = o.phone;
    if (!c.city && o.city) c.city = o.city;
    cmap.set(id, c);
  }
  const customers = [...cmap.values()].sort((a, b) => b.total - a.total);

  const invoicedCount = orders.filter((o) => o.invoiced).length;
  return {
    ok: true,
    lastSyncAt: stored.lastSyncAt,
    orders,
    customers,
    kpis: {
      totalOrders: orders.length,
      totalRevenue: orders.reduce((s, o) => s + (o.sumGross || 0), 0),
      monthOrders: monthOrders.length,
      monthRevenue: monthOrders.reduce((s, o) => s + (o.sumGross || 0), 0),
      invoicedCount,
      notInvoicedCount: orders.length - invoicedCount,
      customerCount: customers.length,
    },
  };
}
