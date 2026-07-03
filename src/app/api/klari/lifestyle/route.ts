import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { runLifestyleDaily, loadLifestylePreview, publishLifestyleDraft } from "@/lib/lifestyle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Napi LIFESTYLE-plakát (nyári / foci hangulat, CSAK LAPTOP) — 17:00-kor Erika menetrendje hívja.
 * Rotálódó stílus + valódi Vitech-laptop + fotorealisztikus jelenet → POSZTOLÁS ELOTTI QC → Facebook-poszt
 * (a caption tartalmazza a képen látható termék vitechcompkft.hu linkjét). Csak hibátlan anyag megy ki.
 *
 * Módok (query):
 *  - (alap)            → éles futás QC-kapuval, kiposztol, ha minden rendben.
 *  - ?sync=1           → megvárja az eredményt (kézi éles teszthez).
 *  - ?dry=1            → csak ELOKÉSZÍT + QC, NEM posztol; visszaadja az elonézetet (kézi jóváhagyáshoz).
 *  - ?publish_preview=1→ a legutóbb elokészített (jóváhagyott) elonézetet POSZTOLJA ki.
 * Védelem: Authorization: Bearer <CRON_SECRET>.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams;

  // Elonézet PUBLIKÁLÁSA (a kézzel jóváhagyott darab kiposztolása).
  if (q.get("publish_preview") === "1") {
    try {
      const draft = await loadLifestylePreview();
      if (!draft) return NextResponse.json({ ok: false, error: "nincs elokészített elonézet" }, { status: 404 });
      const fb = await publishLifestyleDraft(draft);
      return NextResponse.json({ ok: fb.ok, fbUrl: fb.url, error: fb.error, product: draft.product, headline: draft.headline });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
    }
  }

  // ELONÉZET (nem posztol) — kézi jóváhagyáshoz.
  if (q.get("dry") === "1") {
    try {
      const result = await runLifestyleDaily({ dryRun: true });
      return NextResponse.json(result);
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
    }
  }

  // Kézi/szinkron ÉLES futtatás: megvárjuk az eredményt.
  if (q.get("sync") === "1") {
    try {
      const result = await runLifestyleDaily();
      return NextResponse.json(result);
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
    }
  }

  // Alap (cron): azonnal válaszolunk, a teljes pipeline waitUntil-lel a háttérben fut (saját 60s budget).
  waitUntil(runLifestyleDaily().catch(() => {}));
  return NextResponse.json({ ok: true, status: "accepted" });
}

export const GET = handle;
export const POST = handle;
