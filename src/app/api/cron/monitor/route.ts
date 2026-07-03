import { NextRequest, NextResponse } from "next/server";
import { runMonitorCycle } from "@/lib/agent";
import { gyulaDailyCheck } from "@/lib/team";
import { runMetaWatch } from "@/lib/meta";
import { runTeamSync } from "@/lib/teamComms";

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
    await runMetaWatch().catch(() => {}); // Luca: Meta retargeting-kampány indíthatóságának figyelése
    await runTeamSync().catch(() => {}); // AI-csapat belso kommunikáció: magvetés + inboxok feldolgozása
    await fireBg(secret, "/api/tasks/run"); // függoben lévo tulajdonosi feladatok pótló feldolgozása
    // 1b) SEO-átvilágítás + Mihály pénzügyi jelentése — KÜLÖN invokációkban (saját 60s budget),
    //     hogy a fo ciklus + Erika jelentés biztosan beférjen 60s-be.
    await fireBg(secret, "/api/seo/audit");
    await fireBg(secret, "/api/bank/sync");
    // A napi ügynök-feladatokat (Klári, Judit, Mihály, Luca, Gyula) mostantól ERIKA MENETRENDJE indítja
    // a saját idopontjukban (a helyi 2 perces figyelo vezérli) → itt már NEM tüzeljük oket külön.
    // Judit heti webshop-blogcikke — hétfonként (Europe/Budapest).
    const weekdayBp = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Budapest", weekday: "short" }).format(new Date());
    if (weekdayBp === "Mon") await fireBg(secret, "/api/blog/run");
    // Mihály havi könyveloi-emailje — minden hónap 4-én (Europe/Budapest).
    const dayBp = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest", day: "2-digit" }).format(new Date());
    if (dayBp === "04") await fireBg(secret, "/api/accounting/send");
    // ERIKA menetrend-tick (FELHO-TARTALÉK): ha a gép ki volt kapcsolva egész nap, ez indítja el a
    //   még hiányzó feladatokat + lezárja a napot + elküldi az esti összegzést.
    await fireBg(secret, "/api/erika/audit");
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
