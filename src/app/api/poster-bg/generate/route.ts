import { NextRequest, NextResponse } from "next/server";
import { generateScenes } from "@/lib/sceneBg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * AI iroda-jelenet hátterek készletének feltöltése (OpenAI).
 * GET /api/poster-bg/generate?n=5  (Bearer CRON_SECRET)
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  const n = Math.min(Number(req.nextUrl.searchParams.get("n") || 5), 5);
  const result = await generateScenes(n);
  return NextResponse.json(result);
}
