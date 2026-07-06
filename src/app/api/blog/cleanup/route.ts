import { NextRequest, NextResponse } from "next/server";
import { unasLogin, unasGetBlogContentsFull, unasUpdateBlogText } from "@/lib/unas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Blog-takarító: kiszedi a kint lévo cikkekbol a bennragadt ===...=== jelölot (pl. ===VÉGE===) és a végi,
 * HTML-en KÍVÜLI sima-szöveges „sign-off"-ot (pl. a hibás zárómondatot).
 * Alap: DRY (csak megmutatja mit venne ki). apply=1 → tényleg frissíti Unason. Védelem: Bearer <CRON_SECRET>.
 */
function cleanBlogBody(text: string): string {
  let t = text;
  // 1) A legelso bennragadt ===...=== markertol a végéig minden szemét levágása.
  t = t.replace(/\s*={2,}[^\n]*?={2,}[\s\S]*$/, "");
  // 2) A legutolsó HTML-tag (>) UTÁNI rövid, sima-szöveges maradék (leaked sign-off) levágása.
  let lastGt = t.lastIndexOf(">");
  if (lastGt !== -1) {
    const tail = t.slice(lastGt + 1).trim();
    if (tail && tail.length < 200 && !/[<>]/.test(tail)) t = t.slice(0, lastGt + 1);
  }
  // 3) Végi „Nem csak … hanem …" típusú zárószlogen levágása — CSAK a cikk legvégén (blokk-tagba csomagolva vagy sima szövegként).
  t = t.replace(/<(p|div|h[1-6])[^>]*>\s*(?:<[^>]+>\s*)*Nem csak [\s\S]{0,160}?<\/\1>\s*$/i, "").trim();
  t = t.replace(/\s*Nem csak [^\n<]{0,160}?\.\s*$/i, "").trim();
  // ismételt üres-tag / szóköz takarítás a végén
  lastGt = t.lastIndexOf(">");
  if (lastGt !== -1) {
    const tail2 = t.slice(lastGt + 1).trim();
    if (tail2 && tail2.length < 200 && !/[<>]/.test(tail2)) t = t.slice(0, lastGt + 1);
  }
  return t.trim();
}

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  const apply = req.nextUrl.searchParams.get("apply") === "1";
  try {
    const token = await unasLogin();
    const blogs = await unasGetBlogContentsFull(token);
    const results: any[] = [];
    for (const b of blogs) {
      const original = (b.text || "").trim();
      const cleaned = cleanBlogBody(b.text || "");
      const changed = cleaned !== original;
      let updated = false;
      let msg = "";
      if (changed && apply) {
        const r = await unasUpdateBlogText(token, b.id, cleaned);
        updated = r.ok;
        msg = r.message;
      }
      results.push({
        id: b.id,
        title: b.title,
        changed,
        updated,
        msg,
        removed: changed ? original.slice(cleaned.length).trim().slice(0, 240) : "",
      });
    }
    return NextResponse.json({ ok: true, apply, count: blogs.length, changed: results.filter((r) => r.changed).length, results });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
