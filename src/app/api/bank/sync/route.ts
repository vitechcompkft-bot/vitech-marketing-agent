import { NextRequest, NextResponse } from "next/server";
import { runBankSync } from "@/lib/bank";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Napi banki szinkron (egyenleg + 30 nap tranzakció → snapshot). Bearer CRON_SECRET. A monitor cron hívja. */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}` && req.nextUrl.searchParams.get("key") !== secret) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  try {
    const snap = await runBankSync();
    return NextResponse.json(snap);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
