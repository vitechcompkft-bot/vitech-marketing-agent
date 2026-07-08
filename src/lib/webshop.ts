import { supabaseAdmin } from "./supabase";
import { unasLogin, unasGetOrdersFull, type UnasOrderSummary } from "./unas";
import { getInvoicedOrders, getAllBillingoInvoices, type BillingoInvoiceLite } from "./billingo";

/** Névtokenek: kisbetu, ékezet nélkül, rendezve (a szórend/ékezet ne számítson: „Robert Shell" ↔ „Shell Róbert"). */
function nameTokens(s?: string): string[] {
  const ascii = (s || "")
    .toLowerCase()
    .replace(/[áàâä]/g, "a")
    .replace(/[éèêë]/g, "e")
    .replace(/[íìîï]/g, "i")
    .replace(/[óòôöőõ]/g, "o")
    .replace(/[úùûüűũ]/g, "u")
    .replace(/[^a-z0-9 ]/g, " ");
  return ascii
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .sort();
}
/** a minden tokene benne van-e b-ben (részhalmaz)? */
function subset(a: string[], b: string[]): boolean {
  if (!a.length) return false;
  const setB = new Set(b);
  return a.every((t) => setB.has(t));
}
/** Tulajdonos saját/teszt rendelése (Vida László / László Vida, v. a tulaj e-mailjei) — alapból „számlázott”
 *  (vagy teszt volt, vagy más névre szól a számla; a user kérésére nem számít nyitottnak). */
function isOwnerOrder(o: UnasOrderSummary): boolean {
  const set = new Set(nameTokens(o.customerName || o.invoiceName));
  if (set.has("vida") && set.has("laszlo")) return true;
  const email = (o.email || "").toLowerCase().trim();
  return email === "vitechcompkft@gmail.com" || email === "v.laszlo@hunorcoop.hu";
}

/** Egy rendeléshez tartozó Billingo-számla: bruttó egyezik (±5 Ft, kerekítés) ÉS a név illik (szórend/ékezet nélkül). */
function matchInvoice(order: UnasOrderSummary, invoices: BillingoInvoiceLite[]): BillingoInvoiceLite | null {
  const otoks = nameTokens(order.customerName || order.invoiceName);
  if (!otoks.length) return null;
  for (const inv of invoices) {
    if (inv.cancelled) continue;
    if (Math.abs(inv.gross - (order.sumGross || 0)) > 5) continue;
    const itoks = nameTokens(inv.partner);
    if (subset(otoks, itoks) || subset(itoks, otoks)) return inv;
  }
  return null;
}

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
  paid: boolean | null; // true=kifizetve, false=fizetetlen (számla nyitott/lejárt), null=nincs adat (nincs számla)
  paymentStatus?: string; // Billingo payment_status (paid/outstanding/expired/…)
  notPickedUp: boolean; // „nem vette át a terméket" (pirossal jelölve)
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
    paidCount: number;
    unpaidCount: number;
    customerCount: number;
  };
}

// ── Kézi felülírások: elrejtett (törölt) rendelések + kézzel „fizetettnek” jelöltek (pl. készpénz) ──
const OVERRIDES_KEY = "webshop_overrides";
interface Overrides {
  hidden: string[]; // dashboardról elrejtett (pl. próba) rendelések kulcsai
  paid: string[]; // kézzel fizetettre állított rendelések kulcsai (készpénz stb.)
  notPickedUp: string[]; // „nem vette át a terméket" — pirossal jelöljük
}
async function loadOverrides(): Promise<Overrides> {
  try {
    const { data } = await supabaseAdmin().from("app_state").select("value").eq("key", OVERRIDES_KEY).maybeSingle();
    if (data?.value) {
      const j = JSON.parse(data.value);
      return {
        hidden: Array.isArray(j.hidden) ? j.hidden : [],
        paid: Array.isArray(j.paid) ? j.paid : [],
        notPickedUp: Array.isArray(j.notPickedUp) ? j.notPickedUp : [],
      };
    }
  } catch {
    /* nincs még felülírás */
  }
  return { hidden: [], paid: [], notPickedUp: [] };
}
async function saveOverrides(o: Overrides) {
  await supabaseAdmin().from("app_state").upsert({ key: OVERRIDES_KEY, value: JSON.stringify(o), updated_at: new Date().toISOString() });
}

/** Rendelés elrejtése/visszaállítása a dashboardon (a valódi Unas-rendelést NEM törli). */
export async function setOrderHidden(key: string, hidden: boolean): Promise<{ ok: boolean }> {
  if (!key) return { ok: false };
  const o = await loadOverrides();
  const set = new Set(o.hidden);
  hidden ? set.add(key) : set.delete(key);
  o.hidden = [...set];
  await saveOverrides(o);
  return { ok: true };
}
/** Rendelés kézi fizetettre állítása/visszavonása (pl. készpénzes fizetés, ami nincs a Billingóban). */
export async function setOrderPaid(key: string, paid: boolean): Promise<{ ok: boolean }> {
  if (!key) return { ok: false };
  const o = await loadOverrides();
  const set = new Set(o.paid);
  paid ? set.add(key) : set.delete(key);
  o.paid = [...set];
  await saveOverrides(o);
  return { ok: true };
}
/** „Nem vette át a terméket" jelölés be/ki (pirossal jelöljük a sort). */
export async function setOrderNotPickedUp(key: string, value: boolean): Promise<{ ok: boolean }> {
  if (!key) return { ok: false };
  const o = await loadOverrides();
  const set = new Set(o.notPickedUp);
  value ? set.add(key) : set.delete(key);
  o.notPickedUp = [...set];
  await saveOverrides(o);
  return { ok: true };
}

const bpMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest", year: "numeric", month: "2-digit" }).format(new Date()); // "2026-07"

/** A Webshop-oldal adatai: rendelések (számlázott jelöléssel), vásárlók, KPI-k. */
export async function getWebshopData(): Promise<WebshopData> {
  const [stored, invoiced, invoices, overrides] = await Promise.all([load(), getInvoicedOrders(), getAllBillingoInvoices(200), loadOverrides()]);
  const hiddenSet = new Set(overrides.hidden);
  const paidSet = new Set(overrides.paid);
  const notPickedUpSet = new Set(overrides.notPickedUp);

  // Számlaszám → fizetettség (Billingo payment_status): a fizetve-állapot forrása.
  const invByNumber = new Map(invoices.map((i) => [i.number, i]));
  const payOf = (num?: string): { paid: boolean | null; paymentStatus?: string } => {
    if (!num) return { paid: null };
    const inv = invByNumber.get(num);
    if (!inv) return { paid: null };
    return { paid: inv.paymentStatus === "paid", paymentStatus: inv.paymentStatus };
  };

  const orders: WebshopOrderRow[] = stored.orders
    .filter((o) => !hiddenSet.has(o.key)) // elrejtett (törölt) rendelések kihagyása
    .map((o) => {
      // 1) amit EZ az app állított ki (pontos rendelésszám-kötés), 2) tulaj saját/teszt, 3) Billingo-egyezés (név+összeg).
      const appInv = invoiced[o.key];
      const np = notPickedUpSet.has(o.key);
      let row: WebshopOrderRow;
      if (appInv) {
        const num = appInv.invoiceNumber || undefined;
        row = { ...o, invoiced: true, invoiceNumber: num, invoiceUrl: appInv.publicUrl || undefined, notPickedUp: np, ...payOf(num) };
      } else if (isOwnerOrder(o)) {
        row = { ...o, invoiced: true, invoiceNumber: "saját", paid: null, notPickedUp: np };
      } else {
        const m = matchInvoice(o, invoices);
        row = m
          ? { ...o, invoiced: true, invoiceNumber: m.number, invoiceUrl: undefined, paid: m.paymentStatus === "paid", paymentStatus: m.paymentStatus, notPickedUp: np }
          : { ...o, invoiced: false, paid: null, notPickedUp: np };
      }
      // Kézi fizetettre állítás (pl. készpénz) — felülírja a Billingo-állapotot.
      if (paidSet.has(o.key)) {
        row.paid = true;
        row.paymentStatus = "kézi";
      }
      return row;
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
      paidCount: orders.filter((o) => o.paid === true).length,
      unpaidCount: orders.filter((o) => o.paid === false).length,
      customerCount: customers.length,
    },
  };
}
