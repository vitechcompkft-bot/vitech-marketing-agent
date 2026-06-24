import { supabaseAdmin } from "./supabase";
import { getOrderStats } from "./orders";
import { mihalyAnalyze } from "./claude";
import { setAgentStatus } from "./team";
import { sendTelegram } from "./telegram";

const ft = (n: number) => new Intl.NumberFormat("hu-HU").format(Math.round(n)) + " Ft";

export interface FinanceSnapshot {
  ok: boolean;
  todayRevenue: number;
  todayCount: number;
  monthRevenue: number;
  monthCount: number;
  todayAdSpend: number;
}

/** Pénzügyi pillanatkép: bevétel (Unas rendelések) + mai hirdetési költés (live_metrics). */
export async function getFinanceSnapshot(): Promise<FinanceSnapshot> {
  const orders = await getOrderStats().catch(() => null);
  let todayAdSpend = 0;
  try {
    const sb = supabaseAdmin();
    const { data } = await sb.from("live_metrics").select("cost_huf");
    todayAdSpend = (data || []).reduce((s: number, r: any) => s + Number(r.cost_huf || 0), 0);
  } catch {
    /* nincs ads adat */
  }
  return {
    ok: !!orders?.ok,
    todayRevenue: orders?.todayRevenue || 0,
    todayCount: orders?.todayCount || 0,
    monthRevenue: orders?.monthRevenue || 0,
    monthCount: orders?.monthCount || 0,
    todayAdSpend,
  };
}

/** MIHÁLY napi pénzügyi jelentése: elemzés + javaslatok → Telegram + státusz. Visszaadja az összegzést Erikának. */
export async function runMihalyDaily(): Promise<{ summary: string; suggestions: string[]; snapshot: FinanceSnapshot }> {
  await setAgentStatus("mihaly", "working", "Napi bevétel/kiadás elemzése…");
  const f = await getFinanceSnapshot();
  const analysis = await mihalyAnalyze({
    todayRevenue: f.todayRevenue,
    todayCount: f.todayCount,
    monthRevenue: f.monthRevenue,
    monthCount: f.monthCount,
    todayAdSpend: f.todayAdSpend,
    monthAdSpend: 0,
    note: "A havi hirdetési költés, valamint a bejövo/kimeno (nem teljesített) számlák és a banki tételek bekötése folyamatban (Billingo + open-banking). Egyelore a mai hirdetési költés és a webshop-bevétel ismert.",
  });

  const sug = analysis.suggestions.length ? "\n\n💡 " + analysis.suggestions.map((s) => "• " + s).join("\n") : "";
  await sendTelegram(
    `📊 *Mihály — napi pénzügyi jelentés*\n\n💰 Mai bevétel: ${ft(f.todayRevenue)} (${f.todayCount} rendelés)\n📅 Havi bevétel: ${ft(f.monthRevenue)} (${f.monthCount} rendelés)\n📣 Mai hirdetési költés: ${ft(f.todayAdSpend)}\n\n${analysis.summary}${sug}`
  ).catch(() => {});

  await setAgentStatus("mihaly", "done", `Mai bevétel ${ft(f.todayRevenue)} · Ads ${ft(f.todayAdSpend)}`);
  return { ...analysis, snapshot: f };
}
