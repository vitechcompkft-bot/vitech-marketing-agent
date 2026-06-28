import { NextRequest, NextResponse } from "next/server";
import { runKlariText } from "@/lib/klari";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function baseUrl(): string {
  // Stabil, publikus prod-URL (a VERCEL_URL deployment-specifikus lehet / védelem mögött).
  return process.env.PUBLIC_BASE_URL || "https://vitech-marketing-agent.vercel.app";
}

/**
 * Klári napi feladata — 1. (SZÖVEG) FÁZIS. A reggeli (7:00) Vercel cron hívja.
 * Jóváhagyott szöveg esetén ELINDÍTJA a 2. (KÉP) fázist egy KÜLÖN HTTP-invokációban
 * (/api/klari/render), így mindkét lépésnek saját 60s budget-je van (Vercel Hobby limit).
 * Védelem: Authorization: Bearer <CRON_SECRET>.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  try {
    const force = req.nextUrl.searchParams.get("force") === "1";
    const result = await runKlariText({ force });

    // Jóváhagyott szöveg → kép-fázis KÜLÖN invokációban. A render azonnal válaszol
    // ('accepted'), a tényleges renderelést waitUntil-lel a háttérben futtatja (saját 60s),
    // így ez a hívás gyorsan visszatér, és a render mégis biztosan lefut.
    let trigger = "skipped";
    if (result.status === "pending_image") {
      const url = `${baseUrl()}/api/klari/render`;
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(secret ? { authorization: `Bearer ${secret}` } : {}),
          },
          body: JSON.stringify({ postId: result.postId, renderData: result.renderData }),
          signal: AbortSignal.timeout(12000),
        });
        trigger = `http ${r.status}`;
      } catch (e: any) {
        trigger = "err: " + (e?.message || "?");
      }
    }

    return NextResponse.json({ ok: true, trigger, ...result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
