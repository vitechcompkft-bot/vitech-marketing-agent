import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Egy feladat (e-mail) "kész" jelölése / visszavonása.
 * POST /api/emails/handle  body: { id: number, handled: boolean }
 * (Basic Auth védi a middleware-en keresztül.)
 */
export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {}
  const id = Number(body?.id);
  if (!id) return NextResponse.json({ ok: false, error: "Hiányzó id." }, { status: 400 });
  try {
    const sb = supabaseAdmin();
    const { error } = await sb.from("emails").update({ handled: body?.handled !== false }).eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}
