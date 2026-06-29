import { NextRequest, NextResponse } from "next/server";
import { runBlogPublishDraft } from "@/lib/blog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Judit webshop-blog — 2. (PUBLIKÁLÁS) FÁZIS. A run fázis indítja külön invokációban.
 * Luca párhuzamos korrektúrája + Unas setPageContent (blog) élesben.
 * Védelem: Authorization: Bearer <CRON_SECRET>.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  try {
    const result = await runBlogPublishDraft();
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
