import { supabaseAdmin } from "./supabase";
import { getCampaignMetrics, applyBudgetChange, setCampaignStatus } from "./googleAds";
import { analyzeMetrics } from "./claude";
import { enforceGuardrails } from "./guardrails";
import { sendTelegram } from "./telegram";
import type { AgentConfig, AgentDecision, CampaignMetric } from "./types";

export async function getConfig(): Promise<AgentConfig> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("agent_config").select("*").eq("id", 1).single();
  if (error || !data) throw new Error("Nem sikerült betölteni az agent_config-ot: " + error?.message);
  return data as AgentConfig;
}

function autoExecute(action: string, autonomy: AgentConfig["autonomy_level"]): boolean {
  // Script módban (valós figyelés, de még nincs valós írás) Luca CSAK javasol.
  if (process.env.DATA_SOURCE === "script") return false;
  if (autonomy === "suggest") return false;
  if (autonomy === "auto_small") return action === "pause_ad" || action === "budget_change";
  return true; // auto_guardrails: minden engedélyezettet végrehajt
}

async function recentTrend(sb: ReturnType<typeof supabaseAdmin>): Promise<string> {
  const { data } = await sb
    .from("metric_snapshots")
    .select("campaign_name, roas, cost_huf, clicks, captured_at")
    .order("captured_at", { ascending: false })
    .limit(6);
  if (!data || !data.length) return "Nincs korábbi adat (ez az első mérés).";
  return data
    .map((r) => `${new Date(r.captured_at).toLocaleString("hu-HU")}: ROAS ${r.roas}, költés ${r.cost_huf} Ft, ${r.clicks} katt.`)
    .join("\n");
}

/** Egy teljes figyelési ciklus: mérés → elemzés → (korlátozott) cselekvés → értesítés. */
export async function runMonitorCycle(): Promise<{
  ran: boolean;
  summary: string;
  executed: number;
  proposed: number;
  blocked: number;
}> {
  const sb = supabaseAdmin();
  const config = await getConfig();

  // 1) Mérés
  const metrics = await getCampaignMetrics();

  // 2) Pillanatkép mentése
  if (metrics.length) {
    const { error: snapErr } = await sb.from("metric_snapshots").insert(
      metrics.map((m) => ({
        channel: m.channel,
        campaign_id: m.campaign_id,
        campaign_name: m.campaign_name,
        status: m.status,
        impressions: m.impressions,
        clicks: m.clicks,
        cost_huf: m.cost_huf,
        conversions: m.conversions,
        conv_value_huf: m.conv_value_huf,
        ctr: m.ctr,
        avg_cpc_huf: m.avg_cpc_huf,
        roas: m.roas,
        budget_huf: m.budget_huf,
      }))
    );
    if (snapErr) console.error("[agent] snapshot insert HIBA:", snapErr.message);
  }

  // Vész-leállító: csak mérünk, nem nyúlunk semmihez
  if (!config.agent_enabled) {
    return { ran: false, summary: "Az Agent ki van kapcsolva — csak mértem, nem avatkoztam be.", executed: 0, proposed: 0, blocked: 0 };
  }

  // 3) Elemzés (Claude)
  const trend = await recentTrend(sb);
  const { summary, decisions } = await analyzeMetrics(metrics, config, trend);

  let executed = 0,
    proposed = 0,
    blocked = 0;
  const tgLines: string[] = [`🤖 <b>AI Marketinges — óránkénti jelentés</b>`, summary, ""];

  for (const d of decisions as AgentDecision[]) {
    const metric = metrics.find((m) => m.campaign_id === d.campaign_id) || metrics[0];

    // info riasztás minden "note"-ból
    if (d.action === "note") {
      await sb.from("alerts").insert({
        severity: d.severity || "info",
        title: "Megfigyelés",
        message: d.reasoning,
        channel: "google",
        campaign_id: d.campaign_id,
      });
      continue;
    }

    // Asset-javaslatokból (sitelink/kiemelo) ne halmozzunk fel duplikátumot.
    if (d.action === "add_sitelinks" || d.action === "add_callouts") {
      const { data: dup } = await sb
        .from("actions")
        .select("id")
        .eq("type", d.action)
        .in("status", ["proposed", "approved", "executing"])
        .limit(1);
      if (dup && dup.length) continue;
    }

    const gr = enforceGuardrails(d, metric, config);

    // alap akció-rekord
    const base = {
      type: d.action,
      channel: "google" as const,
      campaign_id: d.campaign_id,
      campaign_name: d.campaign_name ?? metric?.campaign_name ?? null,
      params: gr.params,
      reasoning: `${d.reasoning}${gr.note ? ` | korlát: ${gr.note}` : ""}`,
    };

    if (!gr.permitted) {
      await sb.from("actions").insert({ ...base, autonomous: true, status: "blocked", result: gr.note });
      blocked++;
      continue;
    }

    if (!autoExecute(d.action, config.autonomy_level)) {
      // csak javaslat (jóváhagyásra vár)
      const { data } = await sb.from("actions").insert({ ...base, autonomous: false, status: "proposed" }).select().single();
      proposed++;
      tgLines.push(`💡 <b>Javaslat:</b> ${humanize(d.action, gr.params)} — ${d.reasoning}\n   Jóváhagyás: /approve_${data?.id}`);
      continue;
    }

    // 4) Végrehajtás (autonóm, korlátokon belül)
    const res = await execute(d.action, base.campaign_id, gr.params, config);
    await sb.from("actions").insert({
      ...base,
      autonomous: true,
      status: res.ok ? "executed" : "failed",
      result: res.message,
      executed_at: new Date().toISOString(),
    });
    if (res.ok) {
      executed++;
      tgLines.push(`✅ <b>Beavatkozás:</b> ${humanize(d.action, gr.params)} — ${res.message}`);
    } else {
      blocked++;
      tgLines.push(`⚠️ Sikertelen: ${humanize(d.action, gr.params)} — ${res.message}`);
    }
  }

  // 5) Telegram értesítés — NEM óránként! Csak napi 1×, a napi összegzo órában
  //    (alap: 19:00, Europe/Budapest; DAILY_REPORT_HOUR env-vel állítható).
  //    A többi órában Luca csak figyel + (korlátokon belül) cselekszik, csendben — minden a naplóban.
  const reportHour = Number(process.env.DAILY_REPORT_HOUR ?? "19");
  if (budapestHour() === reportHour) {
    await sendDailyReport(sb, config, summary);
  }

  return { ran: true, summary, executed, proposed, blocked };
}

/** Aktuális óra (0–23) magyar ido szerint, nyári/téli idoszámítást is kezelve. */
function budapestHour(): number {
  const h = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Budapest",
    hour: "2-digit",
    hour12: false,
  }).format(new Date());
  return Number(h);
}

/** Napi összegzo Telegram-üzenet: az elmúlt 24 óra eseményei + aktuális helyzet. */
async function sendDailyReport(
  sb: ReturnType<typeof supabaseAdmin>,
  config: AgentConfig,
  analysisSummary: string
): Promise<void> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: acts } = await sb
    .from("actions")
    .select("id, type, status, params")
    .gte("created_at", since)
    .order("id", { ascending: false });

  const all = acts || [];
  const executed = all.filter((a) => a.status === "executed");
  const proposed = all.filter((a) => a.status === "proposed");
  const blocked = all.filter((a) => a.status === "blocked");

  const lines: string[] = [
    "📊 <b>Luca — napi összegzés</b>",
    "",
    analysisSummary,
    "",
    `Elmúlt 24 óra: ✅ ${executed.length} beavatkozás · 💡 ${proposed.length} javaslat · 🚫 ${blocked.length} korlátozva.`,
  ];

  if (executed.length) {
    lines.push("", "<b>Beavatkozások:</b>");
    for (const a of executed.slice(0, 10)) lines.push(`• ${humanize(a.type, a.params || {})}`);
  }
  if (proposed.length) {
    lines.push("", "<b>Jóváhagyásra vár:</b>");
    for (const a of proposed.slice(0, 10)) lines.push(`• ${humanize(a.type, a.params || {})} — /approve_${a.id}`);
  }
  lines.push("", "Részletek a dashboardon. Bármit kérdezhetsz tolem itt is! 💬");

  await sendTelegram(lines.join("\n"), config.telegram_chat_id || undefined);
}

/** Egy konkrét akció tényleges végrehajtása a Google Ads-ben (vagy mockban). */
export async function execute(
  action: string,
  campaignId: string | null,
  params: Record<string, unknown>,
  config: AgentConfig
): Promise<{ ok: boolean; message: string }> {
  switch (action) {
    case "budget_change":
      if (!campaignId) return { ok: false, message: "Hiányzó kampány-id." };
      return applyBudgetChange(campaignId, Number(params.to));
    case "pause_ad":
      if (!campaignId) return { ok: false, message: "Hiányzó kampány-id." };
      return setCampaignStatus(campaignId, "PAUSED");
    case "enable_ad":
      if (!campaignId) return { ok: false, message: "Hiányzó kampány-id." };
      return setCampaignStatus(campaignId, "ENABLED");
    case "set_target_roas": {
      const sb = supabaseAdmin();
      await sb.from("agent_config").update({ target_roas: Number(params.to), updated_at: new Date().toISOString() }).eq("id", 1);
      return { ok: true, message: `ROAS-cél beállítva: ${params.to}` };
    }
    default:
      return { ok: false, message: "Ismeretlen akció." };
  }
}

function humanize(action: string, p: Record<string, unknown>): string {
  switch (action) {
    case "budget_change":
      return `Napi keret ${p.from ?? "?"} → ${p.to} Ft`;
    case "pause_ad":
      return "Kampány szüneteltetése";
    case "enable_ad":
      return "Kampány újraindítása";
    case "set_target_roas":
      return `ROAS-cél = ${p.to}`;
    case "add_sitelinks": {
      const n = Array.isArray(p.sitelinks) ? (p.sitelinks as any[]).length : 0;
      const names = Array.isArray(p.sitelinks)
        ? (p.sitelinks as any[]).map((s) => s?.text).filter(Boolean).join(", ")
        : "";
      return `${n} sitelink hozzáadása${names ? ` (${names})` : ""}`;
    }
    case "add_callouts": {
      const list = Array.isArray(p.callouts) ? (p.callouts as any[]).join(", ") : "";
      return `Kiemelők hozzáadása${list ? ` (${list})` : ""}`;
    }
    default:
      return action;
  }
}

/**
 * Egy javaslat jóváhagyása (Telegram /approve_ vagy dashboard gomb).
 * Script módban a tényleges végrehajtást a Google Ads szkript végzi → "approved" sorba tesszük.
 * (A set_target_roas belso beállítás, azt azonnal elvégezzük.)
 */
export async function approveAction(
  id: number
): Promise<{ ok: boolean; status: string; message: string }> {
  const sb = supabaseAdmin();
  const { data: action } = await sb.from("actions").select("*").eq("id", id).single();
  if (!action) return { ok: false, status: "missing", message: "Nem találom ezt a javaslatot." };
  if (action.status !== "proposed")
    return { ok: false, status: action.status, message: `Ez a javaslat már „${action.status}" állapotú.` };

  const viaScript = process.env.DATA_SOURCE === "script" && action.type !== "set_target_roas";
  if (viaScript) {
    await sb.from("actions").update({ status: "approved" }).eq("id", id);
    return { ok: true, status: "approved", message: "Jóváhagyva — a Google Ads szkript hamarosan végrehajtja." };
  }

  const config = await getConfig();
  const res = await execute(action.type, action.campaign_id, action.params, config);
  await sb
    .from("actions")
    .update({ status: res.ok ? "executed" : "failed", result: res.message, executed_at: new Date().toISOString() })
    .eq("id", id);
  return { ok: res.ok, status: res.ok ? "executed" : "failed", message: res.message };
}
