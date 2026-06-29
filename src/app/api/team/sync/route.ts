import { NextRequest, NextResponse } from "next/server";
import { runTeamSync } from "@/lib/teamComms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * AI-csapat belso kommunikáció szinkron. A monitor cron hívja naponta.
 * Kézi/teszt: ?demo=1 (induló üzenetek magvetése). Védelem: Bearer CRON_SECRET.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  try {
    const demo = req.nextUrl.searchParams.get("demo") === "1";
    const result = await runTeamSync({ demo });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
