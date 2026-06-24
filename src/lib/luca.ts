import { supabaseAdmin } from "./supabase";
import { getCampaignMetrics } from "./googleAds";
import { lucaReachPlan } from "./claude";
import { setAgentStatus } from "./team";
import { sendTelegram } from "./telegram";
import type { AgentConfig } from "./types";

const DEFAULT_CFG = { max_daily_budget_huf: 5000, max_budget_change_pct: 20 } as AgentConfig;

/**
 * LUCA napi ELÉRÉS-terve: a hirdetési adatokból több elérést tervez, és egy kreatív briefet
 * DELEGÁL Klárinak (a delegated_tasks táblába). A reach-összefoglalót app_state-be menti
 * (dashboard), és Telegramon is jelzi.
 */
export async function runLucaReach(): Promise<{ reachSummary: string; reachActions: string[]; klariBrief: string }> {
  const sb = supabaseAdmin();
  await setAgentStatus("luca", "working", "Elérés-terv készítése (több elérés)…");

  const { data: cfg } = await sb.from("agent_config").select("*").eq("id", 1).single();
  const metrics = await getCampaignMetrics().catch(() => []);
  const plan = await lucaReachPlan(metrics, (cfg as AgentConfig) || DEFAULT_CFG);

  // Reach-összefoglaló mentése a dashboardhoz (app_state kv).
  await sb
    .from("app_state")
    .upsert({ key: "luca_reach_summary", value: plan.reachSummary, updated_at: new Date().toISOString() })
    .then(() => {});

  // Delegálás Klárinak: a korábbi nyitott briefet lezárjuk, az újat beillesztjük (egy aktív brief).
  if (plan.klariBrief) {
    await sb.from("delegated_tasks").update({ status: "done" }).eq("to_key", "klari").eq("status", "open");
    await sb.from("delegated_tasks").insert({ from_key: "luca", to_key: "klari", title: "Elérés-növelo kreatív", brief: plan.klariBrief, status: "open" });
  }

  const acts = plan.reachActions.length ? "\n\n📈 " + plan.reachActions.map((a) => "• " + a).join("\n") : "";
  const briefLine = plan.klariBrief ? `\n\n👉 *Klárinak delegálva:* ${plan.klariBrief}` : "";
  await sendTelegram(`🎯 *Luca — elérés-terv*\n\n${plan.reachSummary}${acts}${briefLine}`).catch(() => {});

  await setAgentStatus("luca", "done", `Elérés-terv kész${plan.klariBrief ? " · brief Klárinak delegálva" : ""}`);
  return plan;
}
