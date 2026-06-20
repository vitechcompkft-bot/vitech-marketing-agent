/**
 * ─────────────────────────────────────────────────────────────
 *  Vitech – "Luca" adatküldő szkript  (Google Ads Scripts)
 * ─────────────────────────────────────────────────────────────
 *  Mit csinál: óránként kiolvassa a MAI kampány-adatokat, és elküldi
 *  Lucának. NEM kell hozzá developer token, manager fiók vagy bankkártya.
 *
 *  Telepítés a Google Ads-ben:
 *   1) Eszközök és beállítások (🔧) → TÖMEGES MŰVELETEK → Szkriptek
 *   2) "+" → új szkript → töröld a mintát → másold be EZT a teljes fájlt
 *   3) Engedélyezés (Authorize) → Előnézet/Futtatás → nézd a Naplót (Logs)
 *   4) Ütemezés (Schedule/Frequency): ÓRÁNKÉNT (Hourly)
 * ─────────────────────────────────────────────────────────────
 */

var ENDPOINT = "https://vitech-marketing-agent.vercel.app/api/ingest/google";
var SECRET   = "vitech-cron-7f3a91c8e2b64d05a1"; // = a Vercel CRON_SECRET-je

function main() {
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
    var impressions = Number(m.impressions || 0);
    var budget = Number((r.campaignBudget && r.campaignBudget.amountMicros) || 0) / 1000000;

    metrics.push({
      campaign_id: String(r.campaign.id),
      campaign_name: r.campaign.name,
      status: r.campaign.status,
      impressions: impressions,
      clicks: clicks,
      cost_huf: Math.round(cost),
      conversions: Number(m.conversions || 0),
      conv_value_huf: Math.round(convValue),
      ctr: Number(m.ctr || 0) * 100,
      avg_cpc_huf: Math.round(Number(m.averageCpc || 0) / 1000000),
      roas: cost > 0 ? convValue / cost : 0,
      budget_huf: Math.round(budget)
    });
  }

  var response = UrlFetchApp.fetch(ENDPOINT, {
    method: "post",
    contentType: "application/json",
    headers: { "Authorization": "Bearer " + SECRET },
    payload: JSON.stringify({ metrics: metrics }),
    muteHttpExceptions: true
  });

  Logger.log("Elkuldve " + metrics.length + " kampany. HTTP " + response.getResponseCode());
  Logger.log(response.getContentText());
}
