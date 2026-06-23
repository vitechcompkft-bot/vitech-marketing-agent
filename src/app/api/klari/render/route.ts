import { NextRequest, NextResponse } from "next/server";
import { runKlariImage } from "@/lib/klari";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Klári napi feladata — 2. (KÉP) FÁZIS. A szöveg-fázis (/api/klari/run) indítja el
 * egy külön invokációban, body-ban a postId + renderData átadásával. Body nélkül a
 * legutóbbi 'pending_image' sort dolgozza fel (fallback, pl. ha a trigger elveszett).
 * Védelem: Authorization: Bearer <CRON_SECRET>.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* GET vagy üres body → legutóbbi pending_image */
  }
  try {
    const result = await runKlariImage({ postId: body?.postId, renderData: body?.renderData });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
