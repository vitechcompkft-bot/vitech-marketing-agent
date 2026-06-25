import { NextRequest, NextResponse } from "next/server";
import { finishBankAuth } from "@/lib/bank";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** A K&H SCA utáni visszairányítás: code → session + számlák tárolása. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const base = process.env.PUBLIC_BASE_URL || "https://vitech-marketing-agent.vercel.app";

  if (!code) {
    return NextResponse.redirect(`${base}/?bank=error`);
  }
  // state-ellenorzés (CSRF)
  try {
    const sb = supabaseAdmin();
    const { data } = await sb.from("app_state").select("value").eq("key", "bank_auth_state").maybeSingle();
    if (data?.value && state && data.value !== state) {
      return NextResponse.redirect(`${base}/?bank=badstate`);
    }
    await finishBankAuth(code);
    return NextResponse.redirect(`${base}/?bank=connected`);
  } catch {
    return NextResponse.redirect(`${base}/?bank=error`);
  }
}
