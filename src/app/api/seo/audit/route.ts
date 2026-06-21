import { NextRequest, NextResponse } from "next/server";
import { runSeoAudit } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * SEO-átvilágítás kézi indítása (nagyobb söpréshez).
 * GET /api/seo/audit?limit=10   (Bearer CRON_SECRET)
 * Önálló módban (auto_guardrails) Luca egybol alkalmazza is a javításokat.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  const limit = Number(req.nextUrl.searchParams.get("limit") || 5);
  try {
    const result = await runSeoAudit({ limit });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}
