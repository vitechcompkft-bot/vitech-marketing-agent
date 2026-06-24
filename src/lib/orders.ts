import { unasLogin, unasGetOrders, type UnasOrder } from "./unas";
import { supabaseAdmin } from "./supabase";
import { sendTelegram } from "./telegram";

export interface OrderStats {
  ok: boolean;
  todayRevenue: number;
  todayCount: number;
  monthRevenue: number;
  monthCount: number;
  totalCount: number;
  totalRevenue: number;
  recent: { key: string; date: string; sumGross: number; status: string }[];
}

const EMPTY: OrderStats = {
  ok: false,
  todayRevenue: 0,
  todayCount: 0,
  monthRevenue: 0,
  monthCount: 0,
  totalCount: 0,
  totalRevenue: 0,
  recent: [],
};

/** "2026.06.04 18:07:59" -> "2026-06-04" */
function normDate(d: string): string {
  return d.slice(0, 10).replace(/\./g, "-");
}

/** Valós webshop-rendelések összesítése (minden státusz, a lezártakat is). */
export async function getOrderStats(): Promise<OrderStats> {
  if (!process.env.UNAS_API_KEY) return EMPTY;
  try {
    const token = await unasLogin();
    const orders: UnasOrder[] = await unasGetOrders(token, { limitNum: 1000 });

    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest" }).format(new Date()); // YYYY-MM-DD
    const month = today.slice(0, 7); // YYYY-MM

    let todayRevenue = 0,
      todayCount = 0,
      monthRevenue = 0,
      monthCount = 0,
      totalRevenue = 0;

    for (const o of orders) {
      const nd = normDate(o.date);
      totalRevenue += o.sumGross;
      if (nd === today) {
        todayRevenue += o.sumGross;
        todayCount++;
      }
      if (nd.startsWith(month)) {
        monthRevenue += o.sumGross;
        monthCount++;
      }
    }

    const recent = [...orders]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 6)
      .map((o) => ({ key: o.key, date: o.date, sumGross: o.sumGross, status: o.status }));

    return { ok: true, todayRevenue, todayCount, monthRevenue, monthCount, totalCount: orders.length, totalRevenue, recent };
  } catch {
    return EMPTY;
  }
}

const ftHuf = (n: number) => new Intl.NumberFormat("hu-HU").format(Math.round(n)) + " Ft";

/**
 * Új rendelések figyelése: az utolsó látott rendelés óta beérkezetteket Telegramon jelzi.
 * Az állapotot az app_state.last_order_key tárolja (eloso futáskor csak alapot állít, nem spammel).
 */
export async function watchNewOrders(): Promise<{ ok: boolean; newCount: number }> {
  const stats = await getOrderStats();
  if (!stats.ok || stats.recent.length === 0) return { ok: false, newCount: 0 };
  const newestKey = stats.recent[0].key;
  const sb = supabaseAdmin();

  const { data: stateRow } = await sb.from("app_state").select("value").eq("key", "last_order_key").maybeSingle();
  const lastKey = stateRow?.value || null;

  // Elso futás: csak rögzítjük az alapot, nem küldünk értesítést a régiekrol.
  if (!lastKey) {
    await sb.from("app_state").upsert({ key: "last_order_key", value: newestKey, updated_at: new Date().toISOString() });
    return { ok: true, newCount: 0 };
  }

  // recent: legújabb elöl → az utolsó látottig minden ÚJ.
  const fresh: typeof stats.recent = [];
  for (const o of stats.recent) {
    if (o.key === lastKey) break;
    fresh.push(o);
  }

  for (const o of [...fresh].reverse()) {
    await sendTelegram(`🛒 *Új rendelés!*\n💰 ${ftHuf(o.sumGross)} · ${o.status}\n#${o.key} · ${o.date}`).catch(() => {});
  }
  if (fresh.length) {
    await sb.from("app_state").upsert({ key: "last_order_key", value: newestKey, updated_at: new Date().toISOString() });
  }
  return { ok: true, newCount: fresh.length };
}
