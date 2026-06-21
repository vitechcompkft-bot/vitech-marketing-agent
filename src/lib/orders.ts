import { unasLogin, unasGetOrders, type UnasOrder } from "./unas";

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
