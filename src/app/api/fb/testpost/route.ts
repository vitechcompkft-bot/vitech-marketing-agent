import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { postPhotoToFacebook } from "@/lib/facebook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 40;

/**
 * IDEIGLENES TESZT: egy MEGLÉVO plakátot (lifestyle_last) kitesz az ÚJ (feed + csatolt kép) módszerrel,
 * hogy ellenorizzük, rendes idovonal-poszt lesz-e. Védelem: Bearer <CRON_SECRET>.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  try {
    const { data } = await supabaseAdmin().from("app_state").select("value").eq("key", "lifestyle_last").maybeSingle();
    if (!data?.value) return NextResponse.json({ ok: false, error: "nincs lifestyle_last poszter" });
    const j = JSON.parse(data.value);
    const poster = j.poster;
    if (!poster) return NextResponse.json({ ok: false, error: "nincs poster URL" });
    const caption = `🔧 TESZT — új poszt-formátum ellenorzése. ${j.headline || ""}\n\n👉 https://vitechcompkft.hu`;
    const r = await postPhotoToFacebook(caption, poster);
    return NextResponse.json({ ok: r.ok, id: r.id, url: r.url, error: r.error, poster });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
