import { NextRequest, NextResponse } from "next/server";
import { higgsfieldRawTest, higgsfieldEnabled } from "@/lib/higgsfield";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * DIAGNOSZTIKA: a Higgsfield image-to-image hívás pontos alakjának feltérképezése élesben (kulccsal).
 * Védelem: ?key=CRON_SECRET. Felülbírálók query-bol: model, field, statusPath, wrap(=1), aspect, img, prompt.
 * Pl.: /api/higgsfield/test?key=...&model=flux-pro/kontext/max&field=input_image&img=https://...jpg
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.nextUrl.searchParams.get("key") !== secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  if (!higgsfieldEnabled()) {
    return NextResponse.json({ ok: false, error: "Nincs HIGGSFIELD_KEY_ID / HIGGSFIELD_KEY_SECRET a Vercel env-ben." }, { status: 400 });
  }
  const q = req.nextUrl.searchParams;
  const result = await higgsfieldRawTest({
    prompt: q.get("prompt") || "Premium ad scene for this refurbished business laptop on a modern office desk, navy and blue accents, space for headline and price.",
    imageUrl: q.get("img") || "https://vitechcompkft.hu/shop_ordered/64089/shop_pic/BI00382.jpg",
    model: q.get("model") || undefined,
    imageField: q.get("field") ?? undefined,
    statusPath: q.get("statusPath") || undefined,
    wrapInput: q.get("wrap") === "1" ? true : q.get("wrap") === "0" ? false : undefined,
    aspectRatio: q.get("aspect") || undefined,
  });
  return NextResponse.json({ ok: true, result });
}

export const GET = handle;
export const POST = handle;
