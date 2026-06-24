import { supabaseAdmin } from "./supabase";
import { getOrderStats } from "./orders";
import { mihalyAnalyze } from "./claude";
import { setAgentStatus } from "./team";
import { sendTelegram } from "./telegram";
import { getBillingoSummary, type BillingoSummary } from "./billingo";

const ft = (n: number) => new Intl.NumberFormat("hu-HU").format(Math.round(n)) + " Ft";

export interface FinanceSnapshot {
  ok: boolean;
  todayRevenue: number;
  todayCount: number;
  monthRevenue: number;
  monthCount: number;
  todayAdSpend: number;
  billingo: BillingoSummary;
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
  const billingo = await getBillingoSummary().catch(
    () => ({ ok: false, unpaidCount: 0, unpaidTotalHuf: 0, expiredCount: 0, unpaid: [] }) as BillingoSummary
  );
  return {
    ok: !!orders?.ok,
    todayRevenue: orders?.todayRevenue || 0,
    todayCount: orders?.todayCount || 0,
    monthRevenue: orders?.monthRevenue || 0,
    monthCount: orders?.monthCount || 0,
    todayAdSpend,
    billingo,
  };
}

/** MIHÁLY napi pénzügyi jelentése: elemzés + javaslatok → Telegram + státusz. Visszaadja az összegzést Erikának. */
export async function runMihalyDaily(): Promise<{ summary: string; suggestions: string[]; snapshot: FinanceSnapshot }> {
  await setAgentStatus("mihaly", "working", "Napi bevétel/kiadás elemzése…");
  const f = await getFinanceSnapshot();
  const b = f.billingo;
  const note = b.ok
    ? `Kintlévoség (kifizetetlen KIMENO számlák): ${b.unpaidCount} db, ebbol ${b.expiredCount} LEJÁRT; HUF-összeg ~${ft(b.unpaidTotalHuf)}. (A Billingo API bejövo/szállítói számlát nem ad — az utalandó számlák külön forrásból jönnek majd.) A havi hirdetési költés és a banki tételek bekötése még folyamatban.`
    : "A számlák (Billingo) és a banki tételek bekötése még folyamatban — egyelore a webshop-bevétel és a mai hirdetési költés ismert.";

  const analysis = await mihalyAnalyze({
    todayRevenue: f.todayRevenue,
    todayCount: f.todayCount,
    monthRevenue: f.monthRevenue,
    monthCount: f.monthCount,
    todayAdSpend: f.todayAdSpend,
    monthAdSpend: 0,
    unpaidCount: b.ok ? b.unpaidCount : undefined,
    unpaidTotalHuf: b.ok ? b.unpaidTotalHuf : undefined,
    expiredCount: b.ok ? b.expiredCount : undefined,
    note,
  });

  const sug = analysis.suggestions.length ? "\n\n💡 " + analysis.suggestions.map((s) => "• " + s).join("\n") : "";
  const unpaidLine = b.ok && b.unpaidCount > 0 ? `\n🧾 Kifizetetlen kimeno számla: ${b.unpaidCount} db (${b.expiredCount} lejárt) ~${ft(b.unpaidTotalHuf)}` : "";
  await sendTelegram(
    `📊 *Mihály — napi pénzügyi jelentés*\n\n💰 Mai bevétel: ${ft(f.todayRevenue)} (${f.todayCount} rendelés)\n📅 Havi bevétel: ${ft(f.monthRevenue)} (${f.monthCount} rendelés)\n📣 Mai hirdetési költés: ${ft(f.todayAdSpend)}${unpaidLine}\n\n${analysis.summary}${sug}`
  ).catch(() => {});

  await setAgentStatus(
    "mihaly",
    "done",
    `Bevétel ma ${ft(f.todayRevenue)} · Ads ${ft(f.todayAdSpend)}${b.ok && b.unpaidCount ? ` · kintlévoség ${b.unpaidCount} db` : ""}`
  );
  return { ...analysis, snapshot: f };
}
