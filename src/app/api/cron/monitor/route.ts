import { NextRequest, NextResponse } from "next/server";
import { runMonitorCycle } from "@/lib/agent";
import { gyulaDailyCheck } from "@/lib/team";

function baseUrl(): string {
  return process.env.PUBLIC_BASE_URL || "https://vitech-marketing-agent.vercel.app";
}

/** Háttér-invokáció indítása (saját 60s budget), a fo ciklus nem várja meg a végét. */
async function fireBg(secret: string | undefined, path: string) {
  await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
    signal: AbortSignal.timeout(10000),
  }).catch(() => {});
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A figyelő ciklus. Vercel cron óránként hívja (lásd vercel.json).
 * Védelem: ha be van állítva CRON_SECRET, az Authorization fejlécnek egyeznie kell.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Jogosulatlan" }, { status: 401 });
    }
  }
  try {
    // 1) Gyula napi rendszer-/kapcsolat-ellenorzése (a státusza bekerüljön Erika jelentésébe).
    await gyulaDailyCheck().catch(() => {});
    // 1b) SEO-átvilágítás + Mihály pénzügyi jelentése — KÜLÖN invokációkban (saját 60s budget),
    //     hogy a fo ciklus + Erika jelentés biztosan beférjen 60s-be.
    await fireBg(secret, "/api/seo/audit");
    await fireBg(secret, "/api/bank/sync");
    await fireBg(secret, "/api/finance/run");
    await fireBg(secret, "/api/luca/reach");
    await fireBg(secret, "/api/judit/run"); // Judit napi LinkedIn-posztja
    await fireBg(secret, "/api/klari/run"); // plakát-pótló: ha a reggeli cron kimaradt, este pótolja (napi-egy or véd)
    // 2) Google Ads ciklus + Erika napi jelentés (csapat-státuszokkal).
    const result = await runMonitorCycle({ sendReport: true });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    console.error("[cron/monitor] hiba:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
