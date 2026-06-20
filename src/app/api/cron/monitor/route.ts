import { NextRequest, NextResponse } from "next/server";
import { runMonitorCycle } from "@/lib/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A figyelő ciklus. Vercel cron óránként hívja (lásd vercel.json).
 * Védelem: ha be van állítva CRON_SECRET, az Authorization fejlécnek egyeznie kell.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Jogosulatlan" }, { status: 401 });
    }
  }
  try {
    // A dedikált napi cron ezt hívja → kérje a napi Telegram-összegzot is.
    const result = await runMonitorCycle({ sendReport: true });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    console.error("[cron/monitor] hiba:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
