import { NextRequest, NextResponse } from "next/server";
import { unasLogin, unasLinkBlogsToPage } from "@/lib/unas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Az ÖSSZES blog tartalmi elemet a Blog oldalhoz kapcsolja (setPage) → így LÁTSZÓDNAK a blogcikkek.
 * A publikálás automatikusan meghívja; kézzel is: /api/blog/assign?key=<CRON_SECRET> (page opcionális, alap 367234).
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}` && req.nextUrl.searchParams.get("key") !== secret) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  const page = req.nextUrl.searchParams.get("page") || "367234";
  try {
    const token = await unasLogin();
    const r = await unasLinkBlogsToPage(token, page);
    return NextResponse.json(r);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
