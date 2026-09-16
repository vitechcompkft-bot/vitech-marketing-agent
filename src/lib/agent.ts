import { supabaseAdmin } from "./supabase";
import { getCampaignMetrics, applyBudgetChange, setCampaignStatus } from "./googleAds";
import { analyzeMetrics } from "./claude";
import { enforceGuardrails } from "./guardrails";
import { sendTelegram } from "./telegram";
import { sendMail, ownerEmail } from "./mailer";
import { setAgentStatus, getAgentStatuses } from "./team";
import type { AgentConfig, AgentDecision, CampaignMetric } from "./types";

/** HTML-escape a dinamikus szövegekhez az e-mail-jelentésben. */
function esc(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function getConfig(): Promise<AgentConfig> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("agent_config").select("*").eq("id", 1).single();
  if (error || !data) throw new Error("Nem sikerült betölteni az agent_config-ot: " + error?.message);
  return data as AgentConfig;
}

function autoExecute(action: string, autonomy: AgentConfig["autonomy_level"]): boolean {
  // Sitelink/kiemelo PMax-kampányon a szkriptbol nem alkalmazható → CSAK javaslat (nem fut, nem hibázik).
  if (action === "add_sitelinks" || action === "add_callouts") return false;
  if (autonomy === "suggest") return false; // csak javaslat
  if (autonomy === "auto_small")
    return action === "pause_ad" || action === "budget_change";
  return true; // auto_guardrails: minden engedélyezettet magától végrehajt
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
export async function runMonitorCycle(opts?: { sendReport?: boolean }): Promise<{
  ran: boolean;
  summary: string;
  executed: number;
  queued: number;
  proposed: number;
  blocked: number;
}> {
  const sb = supabaseAdmin();
  const config = await getConfig();
  await setAgentStatus("luca", "working", "Hirdetések mérése és elemzése…");

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
    await setAgentStatus("luca", "waiting", "Vész-leállító bekapcsolva — csak mérek, nem avatkozom be.");
    return { ran: false, summary: "Az Agent ki van kapcsolva — csak mértem, nem avatkoztam be.", executed: 0, queued: 0, proposed: 0, blocked: 0 };
  }

  // 3) Elemzés (Claude)
  const trend = await recentTrend(sb);
  const { summary, decisions } = await analyzeMetrics(metrics, config, trend);

  let executed = 0,
    queued = 0,
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

    // Asset-javaslatokból (sitelink/kiemelo) hetente max egyszer — bármilyen állapot.
    if (d.action === "add_sitelinks" || d.action === "add_callouts") {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: dup } = await sb
        .from("actions")
        .select("id")
        .eq("type", d.action)
        .gte("created_at", weekAgo)
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

    // 4) Autonóm végrehajtás (a korlátokon belül)
    const scriptMode = process.env.DATA_SOURCE === "script";
    const scriptExecutable = ["budget_change", "pause_ad", "enable_ad", "add_sitelinks", "add_callouts"].includes(
      d.action
    );

    if (scriptMode && scriptExecutable) {
      // Luca autonóm döntése: sorba tesszük, a Google Ads szkript hajtja végre a következo futáskor.
      await sb.from("actions").insert({ ...base, autonomous: true, status: "approved" });
      queued++;
      tgLines.push(`🤖 <b>Autonóm döntés:</b> ${humanize(d.action, gr.params)} — végrehajtás folyamatban.`);
      continue;
    }

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

  // 5) Reggeli napi beszámoló E-MAIL — CSAK a dedikált reggeli cron kéri (sendReport).
  //    (Telegram helyett e-mail megy a tulajdonosnak; az óránkénti adatküldés NEM küld jelentést.)
  await setAgentStatus(
    "luca",
    "done",
    `Figyelem a hirdetéseket — ${executed} beavatkozás, ${queued} folyamatban, ${proposed} javaslat.`
  );

  if (opts?.sendReport) {
    await sendDailyReport(sb, config, summary);
  }

  return { ran: true, summary, executed, queued, proposed, blocked };
}

/** REGGELI E-MAIL az ELŐZŐ NAPI beszámolókkal (a Telegram helyett). A monitor cron reggel hívja.
 *  Tartalma: csapat-státuszok, marketing-összegzés, a beérkezett e-mailek triázsa, jóváhagyásra várók. */
async function sendDailyReport(
  sb: ReturnType<typeof supabaseAdmin>,
  _config: AgentConfig,
  analysisSummary: string
): Promise<void> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: acts } = await sb
    .from("actions")
    .select("id, type, status, params")
    .gte("created_at", since)
    .order("id", { ascending: false });

  const all = acts || [];
  const done = all.filter((a) => ["executed", "approved", "executing"].includes(a.status));
  const proposed = all.filter((a) => a.status === "proposed");
  const blocked = all.filter((a) => a.status === "blocked");

  // Csapat napi státuszai.
  const statuses = await getAgentStatuses();
  const NAMES: Record<string, string> = { luca: "Luca", klari: "Klári", judit: "Judit", gyula: "Gyula", mihaly: "Mihály", erika: "Erika" };
  const ICON: Record<string, string> = { working: "⏳", done: "✅", waiting: "⏸️", error: "⚠️", idle: "⚪" };
  const order = ["luca", "klari", "judit", "gyula", "mihaly"];
  const teamSel = order.map((k) => statuses.find((s) => s.key === k)).filter(Boolean) as NonNullable<(typeof statuses)[number]>[];
  const teamRows = teamSel
    .map((s) => `<tr><td style="padding:7px 12px;border-bottom:1px solid #eef1f4;white-space:nowrap;">${ICON[s.status] || "•"} <b>${esc(NAMES[s.key] || s.key)}</b></td><td style="padding:7px 12px;border-bottom:1px solid #eef1f4;color:#3a4a5a;">${esc(s.status_note || s.daily_task || "—")}</td></tr>`)
    .join("");

  // Beérkezett e-mailek (Erika postaláda-triázsa) az elmúlt 24 órában.
  const { data: em } = await sb.from("emails").select("*").gte("created_at", since).order("created_at", { ascending: false });
  const emails = (em || []) as any[];
  const emailCount = emails.length;
  const urgent = emails.filter((e) => e.urgency === "magas");
  const urgentRows = urgent
    .slice(0, 10)
    .map((e) => {
      const subj = String(e.subject || e.targy || e.title || "(nincs tárgy)");
      const from = e.sender || e.from_email || e.felado || e.from || "";
      return `<li style="margin:4px 0;color:#233;">${esc(subj)}${from ? ` — <span style="color:#889;">${esc(String(from))}</span>` : ""}</li>`;
    })
    .join("");

  const dateStr = new Intl.DateTimeFormat("hu-HU", { timeZone: "Europe/Budapest", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const dash = process.env.PUBLIC_BASE_URL || "https://vitech-marketing-agent.vercel.app";
  const BRAND = "#1a6dc4";
  const propRows = proposed.slice(0, 10).map((a) => `<li style="margin:5px 0;color:#233;">${esc(humanize(a.type, a.params || {}))}</li>`).join("");

  const html = `<!doctype html><html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:22px 12px;"><tr><td align="center">
    <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(20,40,80,.06);">
      <tr><td style="background:${BRAND};padding:20px 26px;">
        <div style="color:#fff;font-size:20px;font-weight:bold;">🗂️ Vitech Marketing — napi beszámoló</div>
        <div style="color:#dbe9fb;font-size:14px;margin-top:2px;">Előző napi összegzés · ${dateStr}</div>
      </td></tr>
      <tr><td style="padding:22px 26px 6px;">
        <div style="font-size:15px;font-weight:bold;color:#16324f;margin-bottom:6px;">Csapat</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eef1f4;border-radius:10px;overflow:hidden;font-size:14px;">${teamRows || '<tr><td style="padding:8px 12px;color:#889;">Nincs státusz.</td></tr>'}</table>
      </td></tr>
      <tr><td style="padding:14px 26px 0;">
        <div style="font-size:15px;font-weight:bold;color:#16324f;margin-bottom:6px;">Marketing (Luca)</div>
        <div style="font-size:14px;color:#3a4a5a;line-height:1.55;background:#f7f9fb;border:1px solid #eef1f4;border-radius:10px;padding:12px 14px;">${esc(analysisSummary)}</div>
        <div style="font-size:14px;color:#3a4a5a;margin-top:8px;">Elmúlt 24 óra: 🤖 <b>${done.length}</b> autonóm lépés · 💡 <b>${proposed.length}</b> jóváhagyásra vár · 🚫 <b>${blocked.length}</b> korlátozva.</div>
      </td></tr>
      <tr><td style="padding:14px 26px 0;">
        <div style="font-size:15px;font-weight:bold;color:#16324f;margin-bottom:6px;">Beérkezett e-mailek</div>
        <div style="font-size:14px;color:#3a4a5a;">📨 <b>${emailCount}</b> új levél rendezve${urgent.length ? ` · ebből <b style="color:#c0392b;">${urgent.length} sürgős</b>` : ""}.</div>
        ${urgentRows ? `<ul style="margin:8px 0 0;padding-left:20px;font-size:14px;">${urgentRows}</ul>` : ""}
      </td></tr>
      ${propRows ? `<tr><td style="padding:14px 26px 0;">
        <div style="font-size:15px;font-weight:bold;color:#16324f;margin-bottom:6px;">Vezetői döntést kér (jóváhagyás)</div>
        <ul style="margin:0;padding-left:20px;font-size:14px;">${propRows}</ul>
        <div style="margin-top:8px;"><a href="${dash}" style="color:${BRAND};font-weight:bold;text-decoration:none;">Jóváhagyás a dashboardon →</a></div>
      </td></tr>` : ""}
      <tr><td style="padding:20px 26px 24px;">
        <div style="border-top:1px solid #eef1f4;padding-top:14px;font-size:13px;color:#9aa7b3;">Részletek: <a href="${dash}" style="color:${BRAND};text-decoration:none;">${esc(dash.replace(/^https?:\/\//, ""))}</a><br>Vitech Marketing csapat (Erika – Titkárság)</div>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  const text = [
    `Vitech Marketing — napi beszámoló (${dateStr})`,
    ``,
    `CSAPAT:`,
    ...teamSel.map((s) => `- ${NAMES[s.key] || s.key}: ${s.status_note || s.daily_task || "—"}`),
    ``,
    `MARKETING (Luca): ${analysisSummary}`,
    `Elmúlt 24 óra: ${done.length} autonóm lépés, ${proposed.length} jóváhagyásra vár, ${blocked.length} korlátozva.`,
    ``,
    `BEÉRKEZETT E-MAILEK: ${emailCount} rendezve${urgent.length ? `, ebből ${urgent.length} sürgős` : ""}.`,
    ...(proposed.length ? [``, `JÓVÁHAGYÁSRA VÁR:`, ...proposed.slice(0, 10).map((a) => `- ${humanize(a.type, a.params || {})}`)] : []),
    ``,
    `Részletek: ${dash}`,
  ].join("\n");

  const r = await sendMail({
    to: ownerEmail(),
    fromName: "Vitech Marketing – Erika",
    subject: `🗂️ Vitech Marketing — napi beszámoló (${dateStr})`,
    text,
    html,
  });
  await setAgentStatus(
    "erika",
    r.ok ? "done" : "error",
    r.ok ? `Reggeli beszámoló e-mail elküldve · ${done.length} lépés, ${proposed.length} jóváhagyásra vár` : `Beszámoló e-mail hiba: ${r.error}`
  );
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
    case "seo_update": {
      // Szerveroldali végrehajtás az Unas API-n (NEM a Google Ads szkript).
      const { unasLogin, unasSetProductSeo } = await import("./unas");
      const pid = String(params.product_id ?? "");
      if (!pid) return { ok: false, message: "Hiányzó termék-id a SEO-frissítéshez." };
      const token = await unasLogin();
      return unasSetProductSeo(token, pid, {
        title: params.title as string | undefined,
        description: params.description as string | undefined,
        keywords: params.keywords as string | undefined,
      });
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
    case "seo_update":
      return `SEO frissítés: ${p.product_name ?? p.product_id ?? "termék"}`;
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

  // A szerveroldali akciókat (belso ROAS-cél, Unas SEO) mindig azonnal végrehajtjuk,
  // a Google Ads-eseket script módban a szkriptnek adjuk át.
  const serverSide = action.type === "set_target_roas" || action.type === "seo_update";
  const viaScript = process.env.DATA_SOURCE === "script" && !serverSide;
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
