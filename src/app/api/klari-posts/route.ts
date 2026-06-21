import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Egy Klári-poszt törlése. DELETE /api/klari-posts?id=123 */
export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ ok: false, error: "Hiányzó id." }, { status: 400 });
  try {
    const sb = supabaseAdmin();
    const { error } = await sb.from("klari_posts").delete().eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}

/** Klári napi ajánlat-posztjai (a Kreatívok oldalhoz). */
export async function GET() {
  try {
    const sb = supabaseAdmin();
    const { data } = await sb
      .from("klari_posts")
      .select("id, created_at, product_name, product_url, price_huf, market_note, headline, caption, poster_svg, luca_verdict, status")
      .order("created_at", { ascending: false })
      .limit(20);
    return NextResponse.json({ posts: data || [] });
  } catch {
    return NextResponse.json({ posts: [] });
  }
}
