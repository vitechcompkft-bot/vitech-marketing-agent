import { NextRequest, NextResponse } from "next/server";
import { checkPublicSites } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** A PUBLIKUS felügyelt oldalak pingelése (Gyula). Bearer CRON_SECRET. A 30 perces pinger hívja. */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const key = req.nextUrl.searchParams.get("key");
  if (secret && key !== secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  const r = await checkPublicSites();
  return NextResponse.json({ ok: true, ...r });
}

export const GET = handle;
export const POST = handle;
