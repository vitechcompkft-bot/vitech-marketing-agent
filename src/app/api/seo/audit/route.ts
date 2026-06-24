import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { runSeoAudit } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * SEO-átvilágítás. GET / ?sync=1 → szinkron (kézi indítás, visszaadja az eredményt).
 * POST (sync nélkül) → háttérben fut (waitUntil, saját 60s budget) — a napi monitor ezt
 * triggereli, hogy a fo ciklus ne fusson 60s-be. Védelem: Bearer CRON_SECRET.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  const limit = Number(req.nextUrl.searchParams.get("limit") || 3);
  const sync = req.method === "GET" || req.nextUrl.searchParams.get("sync") === "1";
  if (sync) {
    try {
      const result = await runSeoAudit({ limit });
      return NextResponse.json({ ok: true, ...result });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
    }
  }
  waitUntil(runSeoAudit({ limit }).catch(() => {}));
  return NextResponse.json({ ok: true, accepted: true });
}

export const GET = handle;
export const POST = handle;
