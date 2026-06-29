import { NextRequest, NextResponse } from "next/server";
import { runBlogWrite } from "@/lib/blog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function baseUrl(): string {
  return process.env.PUBLIC_BASE_URL || "https://vitech-marketing-agent.vercel.app";
}

/**
 * Judit webshop-blog — 1. (ÍRÁS) FÁZIS. A monitor cron hétfonként hívja (heti 1 cikk). Kézi teszt: ?force=1.
 * Sikeres írás után KÜLÖN invokációban indítja a 2. (publikálás) fázist (saját 60s budget).
 * Védelem: Authorization: Bearer <CRON_SECRET>.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  try {
    const force = req.nextUrl.searchParams.get("force") === "1";
    const result = await runBlogWrite({ force });
    let trigger = "skipped";
    if (result.draftReady) {
      try {
        const r = await fetch(`${baseUrl()}/api/blog/publish`, {
          method: "POST",
          headers: { "content-type": "application/json", ...(secret ? { authorization: `Bearer ${secret}` } : {}) },
          signal: AbortSignal.timeout(5000),
        });
        trigger = `http ${r.status}`;
      } catch (e: any) {
        trigger = "err: " + (e?.message || "?");
      }
    }
    return NextResponse.json({ ...result, trigger });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
