import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { runKlariImage } from "@/lib/klari";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Klári napi feladata — 2. (KÉP) FÁZIS. A szöveg-fázis (/api/klari/run) indítja el
 * egy külön invokációban, body-ban a postId + renderData átadásával.
 *
 * Alapból AZONNAL válaszol ('accepted'), a renderelést pedig waitUntil-lel a háttérben
 * futtatja (saját 60s budget) — így a hívó (szöveg-fázis) nem blokkol, és a Vercel nem
 * szakítja meg a munkát a kliens lecsatlakozásakor.
 *
 * ?sync=1 vagy GET → szinkron lefuttatja és visszaadja a teljes eredményt (kézi/fallback).
 * Body nélkül a legutóbbi 'pending_image' sort dolgozza fel.
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
  const args = { postId: body?.postId, renderData: body?.renderData };
  const sync = req.method === "GET" || req.nextUrl.searchParams.get("sync") === "1";

  if (sync) {
    try {
      const result = await runKlariImage(args);
      return NextResponse.json({ ok: true, ...result });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
    }
  }

  // Háttérben dolgozunk, azonnal válaszolunk.
  waitUntil(runKlariImage(args).catch(() => {}));
  return NextResponse.json({ ok: true, accepted: true });
}

export const GET = handle;
export const POST = handle;
