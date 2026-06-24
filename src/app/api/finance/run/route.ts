import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { runMihalyDaily } from "@/lib/finance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * MIHÁLY napi pénzügyi jelentése — külön invokációban (saját 60s budget), hogy a napi
 * monitor ne fusson 60s-be. A monitor cron triggereli; ?sync=1 / GET → szinkron eredmény.
 * Védelem: Authorization: Bearer <CRON_SECRET>.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  const sync = req.method === "GET" || req.nextUrl.searchParams.get("sync") === "1";
  if (sync) {
    try {
      const result = await runMihalyDaily();
      return NextResponse.json({ ok: true, ...result });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
    }
  }
  waitUntil(runMihalyDaily().catch(() => {}));
  return NextResponse.json({ ok: true, accepted: true });
}

export const GET = handle;
export const POST = handle;
