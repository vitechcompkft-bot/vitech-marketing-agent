import { NextRequest, NextResponse } from "next/server";
import { unasLogin, unasSetBlogPostPage } from "@/lib/unas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Egyszeri segéd: egy meglévő blog tartalmi elem hozzárendelése a Blog oldalhoz.
 * Pl. /api/blog/assign?id=3719861&page=367234  (Bearer CRON_SECRET).
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get("id");
  const page = req.nextUrl.searchParams.get("page") || "367234";
  if (!id) return NextResponse.json({ ok: false, error: "Hiányzó id paraméter." }, { status: 400 });
  try {
    const token = await unasLogin();
    const r = await unasSetBlogPostPage(token, id, page);
    return NextResponse.json(r);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
