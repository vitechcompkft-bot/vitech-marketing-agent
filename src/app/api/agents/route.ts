import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A munkatársak (Erika, Gyula, …) listája — szervezeti ábrához + szerkesztéshez. */
export async function GET() {
  const sb = supabaseAdmin();
  const { data } = await sb.from("agents").select("*").eq("active", true).order("sort", { ascending: true });
  return NextResponse.json(data || []);
}

/** Egy munkatárs arcképének / személyiségének frissítése. */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const key = String(body?.key || "");
  if (!key) return NextResponse.json({ error: "Hiányzó key." }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const f of ["name", "avatar", "persona"]) if (f in body) patch[f] = body[f];
  const sb = supabaseAdmin();
  const { error } = await sb.from("agents").update(patch).eq("key", key);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
