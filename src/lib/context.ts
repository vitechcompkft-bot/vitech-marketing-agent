import { supabaseAdmin } from "./supabase";

/** Friss kontextus összeállítása a chathez (számok + akciók + riasztások). */
export async function buildContext(): Promise<string> {
  const sb = supabaseAdmin();
  const [{ data: snaps }, { data: actions }, { data: alerts }, { data: cfg }] = await Promise.all([
    sb.from("metric_snapshots").select("*").order("captured_at", { ascending: false }).limit(3),
    sb.from("actions").select("*").order("created_at", { ascending: false }).limit(5),
    sb.from("alerts").select("*").eq("acknowledged", false).order("created_at", { ascending: false }).limit(5),
    sb.from("agent_config").select("*").eq("id", 1).single(),
  ]);
  return [
    `Beállítások: agent ${cfg?.agent_enabled ? "BE" : "KI"}, autonómia=${cfg?.autonomy_level}, ROAS-cél=${cfg?.target_roas}, max napi keret=${cfg?.max_daily_budget_huf} Ft.`,
    `Legfrissebb mérések:\n${(snaps || []).map((s) => `- ${s.campaign_name}: ROAS ${s.roas}, költés ${s.cost_huf} Ft, ${s.clicks} katt, ${s.conversions} konv., keret ${s.budget_huf} Ft (${new Date(s.captured_at).toLocaleString("hu-HU")})`).join("\n") || "nincs"}`,
    `Legutóbbi akciók:\n${(actions || []).map((a) => `- [${a.status}] ${a.type} ${JSON.stringify(a.params)} — ${a.reasoning}`).join("\n") || "nincs"}`,
    `Nyitott riasztások:\n${(alerts || []).map((a) => `- (${a.severity}) ${a.title}: ${a.message}`).join("\n") || "nincs"}`,
  ].join("\n\n");
}
