import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { runJuditDaily } from "@/lib/judit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * JUDIT napi LinkedIn-posztja — külön invokációban (saját 60s budget). A napi cron triggereli.
 * ?sync=1 / GET → szinkron eredmény. Védelem: Bearer/?key=CRON_SECRET.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}` && req.nextUrl.searchParams.get("key") !== secret) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  const sync = req.method === "GET" || req.nextUrl.searchParams.get("sync") === "1";
  if (sync) {
    try {
      const result = await runJuditDaily();
      return NextResponse.json(result);
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
    }
  }
  waitUntil(runJuditDaily().catch(() => {}));
  return NextResponse.json({ ok: true, accepted: true });
}

export const GET = handle;
export const POST = handle;
