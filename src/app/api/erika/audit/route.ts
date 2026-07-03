import { NextRequest, NextResponse } from "next/server";
import { runErikaTick } from "@/lib/erika";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Erika egy ellenorzo köre (menetrend-tick). A HELYI health-agent hívja 2 percenként,
 * és a 19:00-ás monitor-cron is (felho-tartalék). Idempotens, gyors.
 * Védelem: Authorization: Bearer <CRON_SECRET>.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}` && req.nextUrl.searchParams.get("key") !== secret) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  try {
    const r = await runErikaTick();
    return NextResponse.json(r);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
