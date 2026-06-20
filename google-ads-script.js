/**
 * ─────────────────────────────────────────────────────────────
 *  Vitech – "Luca" szkript  (Google Ads Scripts)
 * ─────────────────────────────────────────────────────────────
 *  1) Óránként elküldi a MAI kampány-adatokat Lucának (figyelés).
 *  2) Lekéri és VÉGREHAJTJA Luca jóváhagyott módosításait
 *     (napi keret, szüneteltetés/újraindítás, sitelink, kiemelő).
 *  NEM kell hozzá developer token, manager fiók vagy bankkártya.
 *
 *  Telepítés: 🔧 → TÖMEGES MŰVELETEK → Szkriptek → "+" → bemásol → Engedélyez → Óránként.
 * ─────────────────────────────────────────────────────────────
 */

var BASE     = "https://vitech-marketing-agent.vercel.app";
var SECRET   = "vitech-cron-7f3a91c8e2b64d05a1"; // = a Vercel CRON_SECRET-je
var SITE     = "https://vitechcompkft.hu";

function main() {
  sendMetrics();
  applyCommands();
}

/* ───────── 1) Mai adatok elküldése ───────── */
function sendMetrics() {
  var query =
    "SELECT campaign.id, campaign.name, campaign.status, " +
    "campaign_budget.amount_micros, " +
    "metrics.impressions, metrics.clicks, metrics.cost_micros, " +
    "metrics.conversions, metrics.conversions_value, " +
    "metrics.ctr, metrics.average_cpc " +
    "FROM campaign " +
    "WHERE segments.date DURING TODAY AND campaign.status != 'REMOVED'";

  var rows = AdsApp.search(query);
  var metrics = [];
  while (rows.hasNext()) {
    var r = rows.next();
    var m = r.metrics || {};
    var cost = Number(m.costMicros || 0) / 1000000;
    var convValue = Number(m.conversionsValue || 0);
    var clicks = Number(m.clicks || 0);
    metrics.push({
      campaign_id: String(r.campaign.id),
      campaign_name: r.campaign.name,
      status: r.campaign.status,
      impressions: Number(m.impressions || 0),
      clicks: clicks,
      cost_huf: Math.round(cost),
      conversions: Number(m.conversions || 0),
      conv_value_huf: Math.round(convValue),
      ctr: Number(m.ctr || 0) * 100,
      avg_cpc_huf: Math.round(Number(m.averageCpc || 0) / 1000000),
      roas: cost > 0 ? convValue / cost : 0,
      budget_huf: Math.round(Number((r.campaignBudget && r.campaignBudget.amountMicros) || 0) / 1000000)
    });
  }

  var res = UrlFetchApp.fetch(BASE + "/api/ingest/google", {
    method: "post",
    contentType: "application/json",
    headers: { "Authorization": "Bearer " + SECRET },
    payload: JSON.stringify({ metrics: metrics }),
    muteHttpExceptions: true
  });
  Logger.log("Adat elkuldve: " + metrics.length + " kampany. HTTP " + res.getResponseCode());
}

/* ───────── 2) Jóváhagyott parancsok végrehajtása ───────── */
function applyCommands() {
  var res = UrlFetchApp.fetch(BASE + "/api/commands/pending", {
    method: "get",
    headers: { "Authorization": "Bearer " + SECRET },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) { Logger.log("Parancs-lekeres HTTP " + res.getResponseCode()); return; }

  var cmds = (JSON.parse(res.getContentText()) || {}).commands || [];
  Logger.log("Vegrehajtando parancsok: " + cmds.length);

  for (var i = 0; i < cmds.length; i++) {
    var c = cmds[i];
    var out;
    try { out = applyOne(c); }
    catch (e) { out = { ok: false, message: String(e) }; }

    UrlFetchApp.fetch(BASE + "/api/commands/result", {
      method: "post",
      contentType: "application/json",
      headers: { "Authorization": "Bearer " + SECRET },
      payload: JSON.stringify({ id: c.id, ok: out.ok, message: out.message }),
      muteHttpExceptions: true
    });
    Logger.log("Parancs #" + c.id + " (" + c.type + "): " + (out.ok ? "OK" : "HIBA") + " - " + out.message);
  }
}

function findCampaign(id) {
  var it = AdsApp.performanceMaxCampaigns().withIds([id]).get();
  if (it.hasNext()) return it.next();
  var it2 = AdsApp.campaigns().withIds([id]).get();
  if (it2.hasNext()) return it2.next();
  return null;
}

function applyOne(c) {
  var p = c.params || {};

  if (c.type === "budget_change") {
    var cb = findCampaign(c.campaign_id);
    if (!cb) return { ok: false, message: "Kampany nem talalhato" };
    cb.getBudget().setAmount(Number(p.to));
    return { ok: true, message: "Napi keret -> " + p.to + " Ft" };
  }

  if (c.type === "pause_ad") {
    var cp = findCampaign(c.campaign_id);
    if (!cp) return { ok: false, message: "Kampany nem talalhato" };
    cp.pause();
    return { ok: true, message: "Szuneteltetve" };
  }

  if (c.type === "enable_ad") {
    var ce = findCampaign(c.campaign_id);
    if (!ce) return { ok: false, message: "Kampany nem talalhato" };
    ce.enable();
    return { ok: true, message: "Ujrainditva" };
  }

  if (c.type === "add_sitelinks") {
    var csl = findCampaign(c.campaign_id);
    if (!csl) return { ok: false, message: "Kampany nem talalhato" };
    var links = p.sitelinks || [], n = 0;
    for (var k = 0; k < links.length; k++) {
      var s = links[k];
      var sl = AdsApp.newSitelinkBuilder()
        .withLinkText(s.text)
        .withDescription1(s.description1 || "")
        .withDescription2(s.description2 || "")
        .withFinalUrl(s.url || SITE)
        .build().getResult();
      csl.addSitelink(sl);
      n++;
    }
    return { ok: true, message: n + " sitelink hozzaadva" };
  }

  if (c.type === "add_callouts") {
    var cco = findCampaign(c.campaign_id);
    if (!cco) return { ok: false, message: "Kampany nem talalhato" };
    var cos = p.callouts || [], mn = 0;
    for (var j = 0; j < cos.length; j++) {
      var co = AdsApp.newCalloutBuilder().withText(cos[j]).build().getResult();
      cco.addCallout(co);
      mn++;
    }
    return { ok: true, message: mn + " kiemelo hozzaadva" };
  }

  return { ok: false, message: "Ismeretlen parancs tipus: " + c.type };
}
