import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = supabaseAdmin();
    const { data } = await sb.from("creatives").select("*").order("created_at", { ascending: false }).limit(24);
    return NextResponse.json({ creatives: data || [] });
  } catch {
    return NextResponse.json({ creatives: [] });
  }
}
