import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { runMonitorCycle } from "@/lib/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * VALÓS Google Ads adatok fogadása a Google Ads Scripttol.
 * A szkript óránként POST-ol ide: { metrics: CampaignMetric[] }.
 * Védelem: Authorization: Bearer <CRON_SECRET>.
 *
 * Tárolja a friss adatokat a live_metrics táblába, majd lefuttatja a figyelo
 * ciklust (elemzés + napi összegzo 19:00-kor), így minden a VALÓS adatból dolgozik.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
    }
  }

  const body = await req.json().catch(() => null);
  const metrics: any[] = Array.isArray(body?.metrics) ? body.metrics : [];
  if (!metrics.length) {
    return NextResponse.json({ ok: false, error: "Üres vagy hibás 'metrics' tömb." }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const nowIso = new Date().toISOString();

  const rows = metrics.map((m) => ({
    campaign_id: String(m.campaign_id),
    channel: "google",
    campaign_name: m.campaign_name ?? null,
    status: m.status ?? null,
    impressions: Math.round(Number(m.impressions ?? 0)),
    clicks: Math.round(Number(m.clicks ?? 0)),
    cost_huf: Number(m.cost_huf ?? 0),
    conversions: Number(m.conversions ?? 0),
    conv_value_huf: Number(m.conv_value_huf ?? 0),
    ctr: Number(m.ctr ?? 0),
    avg_cpc_huf: Number(m.avg_cpc_huf ?? 0),
    roas: Number(m.roas ?? 0),
    budget_huf: Number(m.budget_huf ?? 0),
    updated_at: nowIso,
  }));

  const { error: upErr } = await sb.from("live_metrics").upsert(rows, { onConflict: "campaign_id" });
  if (upErr) {
    return NextResponse.json({ ok: false, error: "Tárolási hiba: " + upErr.message }, { status: 500 });
  }

  // Friss adatból azonnal lefuttatjuk a figyelo ciklust.
  let cycle: any = null;
  try {
    cycle = await runMonitorCycle();
  } catch (e: any) {
    console.error("[ingest/google] ciklus hiba:", e?.message);
  }

  return NextResponse.json({ ok: true, stored: rows.length, cycle });
}
