import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { runLucaReach } from "@/lib/luca";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * LUCA napi elérés-terve (több elérés) + kreatív brief delegálása Klárinak — külön invokáció.
 * A monitor cron triggereli; ?sync=1 / GET → szinkron eredmény. Védelem: Bearer CRON_SECRET.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  const sync = req.method === "GET" || req.nextUrl.searchParams.get("sync") === "1";
  if (sync) {
    try {
      const result = await runLucaReach();
      return NextResponse.json({ ok: true, ...result });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
    }
  }
  waitUntil(runLucaReach().catch(() => {}));
  return NextResponse.json({ ok: true, accepted: true });
}

export const GET = handle;
export const POST = handle;
