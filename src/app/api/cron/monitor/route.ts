import { NextRequest, NextResponse } from "next/server";
import { runMonitorCycle } from "@/lib/agent";
import { runSeoAudit } from "@/lib/seo";
import { gyulaDailyCheck } from "@/lib/team";
import { runMihalyDaily } from "@/lib/finance";

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
    // 1) SEO-átvilágítás egy adag termékre (a jelentés ELOTT, hogy bekerüljön).
    const seo = await runSeoAudit({ limit: 5 }).catch((e) => ({ ran: false, reason: e?.message }));
    // 1b) Gyula napi rendszer-ellenorzése (a státusza bekerüljön Erika jelentésébe).
    await gyulaDailyCheck().catch(() => {});
    // 1c) Mihály napi pénzügyi jelentése (bevétel/kiadás + javaslatok → Telegram + státusz).
    const finance = await runMihalyDaily().catch((e) => ({ summary: "Mihály jelentése nem futott le: " + (e?.message || "?"), suggestions: [] }));
    // 2) Google Ads ciklus + Erika napi jelentés (csapat-státuszokkal).
    const result = await runMonitorCycle({ sendReport: true });
    return NextResponse.json({ ok: true, seo, finance, ...result });
  } catch (e: any) {
    console.error("[cron/monitor] hiba:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
