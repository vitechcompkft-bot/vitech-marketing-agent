import { NextRequest, NextResponse } from "next/server";
import { runBlogPublish } from "@/lib/blog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Judit webshop-blog publikálása. A monitor cron hétfonként hívja (heti 1 cikk).
 * Védelem: Authorization: Bearer <CRON_SECRET>. Kézi teszt: ?force=1.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  try {
    const force = req.nextUrl.searchParams.get("force") === "1";
    const result = await runBlogPublish({ force });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
