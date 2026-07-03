import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { runLifestyleDaily } from "@/lib/lifestyle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Napi LIFESTYLE-plakát (nyári / foci hangulat) — 17:00-kor Erika menetrendje hívja.
 * Rotálódó stílus + valódi Vitech-termék + fotorealisztikus jelenet → tiszta plakát → Facebook-poszt
 * (a caption tartalmazza a képen látható termék vitechcompkft.hu linkjét).
 * Védelem: Authorization: Bearer <CRON_SECRET>. sync=1 → megvárja az eredményt (kézi teszthez).
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }

  // Kézi/szinkron futtatás: megvárjuk az eredményt.
  if (req.nextUrl.searchParams.get("sync") === "1") {
    try {
      const result = await runLifestyleDaily();
      return NextResponse.json(result);
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
    }
  }

  // Alapból: azonnal válaszolunk, a teljes pipeline waitUntil-lel a háttérben fut (saját 60s budget).
  waitUntil(runLifestyleDaily().catch(() => {}));
  return NextResponse.json({ ok: true, status: "accepted" });
}

export const GET = handle;
export const POST = handle;
