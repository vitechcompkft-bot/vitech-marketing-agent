import { supabaseAdmin } from "./supabase";
import { getOrderStats } from "./orders";
import { mihalyAnalyze } from "./claude";
import { setAgentStatus } from "./team";
import { sendTelegram } from "./telegram";
import { getBillingoSummary, type BillingoSummary } from "./billingo";
import { getBankSnapshot, type BankSnapshot } from "./bank";

const ft = (n: number) => new Intl.NumberFormat("hu-HU").format(Math.round(n)) + " Ft";

export interface FinanceSnapshot {
  ok: boolean;
  todayRevenue: number;
  todayCount: number;
  monthRevenue: number;
  monthCount: number;
  todayAdSpend: number;
  billingo: BillingoSummary;
  bank: BankSnapshot;
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
    () => ({ ok: false, outCount: 0, outTotalHuf: 0, outExpired: 0, out: [], inCount: 0, inTotalHuf: 0, inExpired: 0, in: [] }) as BillingoSummary
  );
  const bank = await getBankSnapshot().catch(
    () => ({ ok: false, connected: false, balance: null, currency: "HUF", in30: 0, out30: 0, recent: [], outByParty: [], aiSpend: 0, aiByParty: [], asOf: null }) as BankSnapshot
  );
  return {
    ok: !!orders?.ok,
    todayRevenue: orders?.todayRevenue || 0,
    todayCount: orders?.todayCount || 0,
    monthRevenue: orders?.monthRevenue || 0,
    monthCount: orders?.monthCount || 0,
    todayAdSpend,
    billingo,
    bank,
  };
}

/** MIHÁLY napi pénzügyi jelentése: elemzés + javaslatok → Telegram + státusz. Visszaadja az összegzést Erikának. */
export async function runMihalyDaily(): Promise<{ summary: string; suggestions: string[]; snapshot: FinanceSnapshot }> {
  await setAgentStatus("mihaly", "working", "Napi bevétel/kiadás elemzése…");
  const f = await getFinanceSnapshot();
  const b = f.billingo;
  const bk = f.bank;
  const bankBal = bk.balance != null ? `~${ft(bk.balance)} ${bk.currency}` : "n/a (a K&H nem ad egyenleget az AIS-en)";
  const bankNote = bk.connected
    ? `K&H bankszámla — egyenleg: ${bankBal}; utolsó 30 nap: bevétel ~${ft(bk.in30)}, kiadás ~${ft(bk.out30)}.`
    : "A K&H banki hozzáférés még nincs összekötve.";
  const note =
    (b.ok
      ? `Kintlévoség (KIMENO fizetetlen): ${b.outCount} db (${b.outExpired} lejárt) ~${ft(b.outTotalHuf)}. Utalandó (BEJÖVO/szállítói fizetetlen): ${b.inCount} db (${b.inExpired} lejárt) ~${ft(b.inTotalHuf)}.`
      : "A számlák (Billingo) bekötése folyamatban.") +
    " " +
    bankNote;

  const analysis = await mihalyAnalyze({
    todayRevenue: f.todayRevenue,
    todayCount: f.todayCount,
    monthRevenue: f.monthRevenue,
    monthCount: f.monthCount,
    todayAdSpend: f.todayAdSpend,
    monthAdSpend: 0,
    receivableCount: b.ok ? b.outCount : undefined,
    receivableHuf: b.ok ? b.outTotalHuf : undefined,
    receivableExpired: b.ok ? b.outExpired : undefined,
    payableCount: b.ok ? b.inCount : undefined,
    payableHuf: b.ok ? b.inTotalHuf : undefined,
    payableExpired: b.ok ? b.inExpired : undefined,
    bankBalance: bk.connected ? bk.balance ?? undefined : undefined,
    bankIn30: bk.connected ? bk.in30 : undefined,
    bankOut30: bk.connected ? bk.out30 : undefined,
    spending: bk.connected && bk.outByParty?.length ? bk.outByParty : undefined,
    note,
  });

  // A teljes elemzést elmentjük a dashboardnak (gazdasági oldal megjeleníti).
  try {
    const sb = supabaseAdmin();
    await sb.from("app_state").upsert({
      key: "mihaly_report",
      value: JSON.stringify({
        summary: analysis.summary,
        suggestions: analysis.suggestions,
        spendingReview: analysis.spendingReview || [],
        outByParty: bk.connected ? bk.outByParty || [] : [],
        asOf: new Date().toISOString(),
      }),
      updated_at: new Date().toISOString(),
    });
  } catch {
    /* app_state mentés nem kritikus */
  }

  const sug = analysis.suggestions.length ? "\n\n💡 " + analysis.suggestions.map((s) => "• " + s).join("\n") : "";
  const topSpend =
    bk.connected && bk.outByParty?.length
      ? "\n\n🔎 *Mire ment el (30 nap, top 5):*\n" + bk.outByParty.slice(0, 5).map((s) => `• ${s.party}: ${ft(s.total)}`).join("\n")
      : "";
  const outLine = b.ok && b.outCount > 0 ? `\n🧾 Kintlévoség (kimeno): ${b.outCount} db (${b.outExpired} lejárt) ~${ft(b.outTotalHuf)}` : "";
  const inLine = b.ok && b.inCount > 0 ? `\n💸 Utalandó (bejövo): ${b.inCount} db (${b.inExpired} lejárt) ~${ft(b.inTotalHuf)}` : "";
  const bankLine = bk.connected
    ? `\n🏦 K&H (30 nap): bevétel +${ft(bk.in30)} / kiadás -${ft(bk.out30)}${bk.balance != null ? ` · egyenleg ~${ft(bk.balance)} ${bk.currency}` : ""}`
    : "";
  await sendTelegram(
    `📊 *Mihály — napi pénzügyi jelentés*\n\n💰 Mai bevétel: ${ft(f.todayRevenue)} (${f.todayCount} rendelés)\n📅 Havi bevétel: ${ft(f.monthRevenue)} (${f.monthCount} rendelés)\n📣 Mai hirdetési költés: ${ft(f.todayAdSpend)}${outLine}${inLine}${bankLine}${topSpend}\n\n${analysis.summary}${sug}`
  ).catch(() => {});

  await setAgentStatus(
    "mihaly",
    "done",
    `Bevétel ma ${ft(f.todayRevenue)} · Ads ${ft(f.todayAdSpend)}${bk.connected ? ` · K&H ~${ft(bk.balance || 0)}` : ""}`
  );
  return { ...analysis, snapshot: f };
}
