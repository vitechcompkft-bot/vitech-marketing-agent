import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
