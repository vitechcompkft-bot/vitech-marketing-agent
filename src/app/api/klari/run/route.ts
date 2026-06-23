import { NextRequest, NextResponse } from "next/server";
import { runKlariText } from "@/lib/klari";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function baseUrl(): string {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "https://vitech-marketing-agent.vercel.app";
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
    const result = await runKlariText();

    // Jóváhagyott szöveg → kép-fázis külön invokációban (a választ NEM várjuk meg végig).
    if (result.status === "pending_image") {
      const url = `${baseUrl()}/api/klari/render`;
      await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(secret ? { authorization: `Bearer ${secret}` } : {}),
        },
        body: JSON.stringify({ postId: result.postId, renderData: result.renderData }),
        // 4s alatt a kérés beérkezik és a render-invokáció elindul; utána már nem várunk rá
        // (a Vercel function a kliens lecsatlakozása után is lefut a végéig).
        signal: AbortSignal.timeout(4000),
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
