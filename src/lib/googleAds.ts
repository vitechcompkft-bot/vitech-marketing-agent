import type { CampaignMetric } from "./types";

const USE_MOCK = process.env.USE_MOCK_DATA !== "false";

/**
 * Google Ads adatforrás.
 *  - USE_MOCK_DATA=true  → reális mock adatok (token nélkül is fut, fejlesztéshez)
 *  - USE_MOCK_DATA=false → valódi Google Ads API (google-ads-api csomag)
 *
 * A valódi rész csak akkor töltődik be, ha tényleg kell — így a mock mód
 * a fejlesztői token megléte nélkül is hibátlanul fut.
 */

// ─────────────────────────── MOCK ───────────────────────────
function jitter(base: number, pct = 0.18) {
  const d = base * pct;
  return base + (Math.random() * 2 - 1) * d;
}

function buildMock(): CampaignMetric[] {
  const cost = Math.max(0, jitter(4200));
  const clicks = Math.round(jitter(140));
  const impressions = Math.round(jitter(9800));
  const conversions = Math.max(0, Math.round(jitter(4)));
  const convValue = conversions * jitter(95000, 0.25); // átlag ~95e Ft/laptop
  return [
    {
      channel: "google",
      campaign_id: "mock-pmax-1",
      campaign_name: "Vitech – Felújított laptopok (PMax)",
      status: "ENABLED",
      impressions,
      clicks,
      cost_huf: Math.round(cost),
      conversions,
      conv_value_huf: Math.round(convValue),
      ctr: impressions ? +((clicks / impressions) * 100).toFixed(2) : 0,
      avg_cpc_huf: clicks ? Math.round(cost / clicks) : 0,
      roas: cost ? +(convValue / cost).toFixed(2) : 0,
      budget_huf: 5000,
    },
  ];
}

// ────────────────────── VALÓDI API (lazy) ───────────────────
async function realClient() {
  // dinamikus import, hogy mock módban ne is kelljen a csomag konfigja
  const { GoogleAdsApi } = await import("google-ads-api");
  const client = new GoogleAdsApi({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
    developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
  });
  const customer = client.Customer({
    customer_id: process.env.GOOGLE_ADS_CUSTOMER_ID!,
    login_customer_id: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || undefined,
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
  });
  return customer;
}

// ─────────────────────────── API ────────────────────────────
export async function getCampaignMetrics(): Promise<CampaignMetric[]> {
  if (USE_MOCK) return buildMock();

  const customer = await realClient();
  // Mai napi összesítés kampányonként (GAQL)
  const rows = await customer.query(`
    SELECT
      campaign.id, campaign.name, campaign.status,
      campaign_budget.amount_micros,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions, metrics.conversions_value,
      metrics.ctr, metrics.average_cpc
    FROM campaign
    WHERE segments.date DURING TODAY
      AND campaign.status != 'REMOVED'
  `);

  return rows.map((r: any): CampaignMetric => {
    const cost = (r.metrics?.cost_micros ?? 0) / 1_000_000;
    const convValue = r.metrics?.conversions_value ?? 0;
    return {
      channel: "google",
      campaign_id: String(r.campaign?.id),
      campaign_name: r.campaign?.name ?? "",
      status: r.campaign?.status ?? "",
      impressions: Number(r.metrics?.impressions ?? 0),
      clicks: Number(r.metrics?.clicks ?? 0),
      cost_huf: Math.round(cost),
      conversions: Number(r.metrics?.conversions ?? 0),
      conv_value_huf: Math.round(convValue),
      ctr: +((r.metrics?.ctr ?? 0) * 100).toFixed(2),
      avg_cpc_huf: Math.round((r.metrics?.average_cpc ?? 0) / 1_000_000),
      roas: cost ? +(convValue / cost).toFixed(2) : 0,
      budget_huf: Math.round((r.campaign_budget?.amount_micros ?? 0) / 1_000_000),
    };
  });
}

/** Napi keret módosítása (Ft). Mock módban csak visszaigazol. */
export async function applyBudgetChange(
  campaignId: string,
  newBudgetHuf: number
): Promise<{ ok: boolean; message: string }> {
  if (USE_MOCK) {
    return { ok: true, message: `[MOCK] ${campaignId} napi kerete -> ${newBudgetHuf} Ft` };
  }
  try {
    const customer = await realClient();
    // megkeressük a kampány budget erőforrását
    const [row] = await customer.query(`
      SELECT campaign.id, campaign_budget.resource_name
      FROM campaign WHERE campaign.id = ${campaignId} LIMIT 1
    `);
    const budgetResource = (row as any)?.campaign_budget?.resource_name;
    if (!budgetResource) return { ok: false, message: "Nem találom a kampány keret-erőforrását." };
    await customer.campaignBudgets.update([
      { resource_name: budgetResource, amount_micros: Math.round(newBudgetHuf * 1_000_000) },
    ]);
    return { ok: true, message: `Napi keret módosítva: ${newBudgetHuf} Ft` };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Ismeretlen hiba a keret módosításakor." };
  }
}

/** Kampány állapotának váltása (PAUSED/ENABLED). Kampányt SOSEM törlünk. */
export async function setCampaignStatus(
  campaignId: string,
  status: "PAUSED" | "ENABLED"
): Promise<{ ok: boolean; message: string }> {
  if (USE_MOCK) {
    return { ok: true, message: `[MOCK] ${campaignId} -> ${status}` };
  }
  try {
    const customer = await realClient();
    await customer.campaigns.update([
      { resource_name: `customers/${process.env.GOOGLE_ADS_CUSTOMER_ID}/campaigns/${campaignId}`, status },
    ]);
    return { ok: true, message: `Kampány állapota: ${status}` };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Hiba az állapot váltásakor." };
  }
}

export const isMock = USE_MOCK;
