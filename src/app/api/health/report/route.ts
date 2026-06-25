import { NextRequest, NextResponse } from "next/server";
import { reportSites } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A belso LAN-agent ide jelenti a 10.49.8.x oldalak állapotát (amiket a felho nem ér el).
 * POST /api/health/report  body: { results: [{ id, status: "up"|"down", http_code?, latency_ms?, note? }] }
 * Védelem: Bearer CRON_SECRET (vagy ?key=).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const key = req.nextUrl.searchParams.get("key");
  if (secret && key !== secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  let body: any = {};
  try {
    body = await req.json();
  } catch {}
  const results = Array.isArray(body?.results) ? body.results : [];
  const r = await reportSites(results);
  return NextResponse.json({ ok: true, ...r });
}
