import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/linkedin";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * LinkedIn OAuth visszairányítás — a LinkedIn hívja (ezért middleware-mentes). State-ellenorzés,
 * majd token-csere + tárolás, végül vissza a Marketing osztály oldalára.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const err = req.nextUrl.searchParams.get("error_description") || req.nextUrl.searchParams.get("error");
  const back = (process.env.PUBLIC_BASE_URL || "https://vitech-marketing-agent.vercel.app") + "/osztaly/marketing";

  if (err) return NextResponse.redirect(`${back}?linkedin=error`);
  if (!code || !state) return NextResponse.redirect(`${back}?linkedin=missing`);

  try {
    const sb = supabaseAdmin();
    const { data } = await sb.from("app_state").select("value").eq("key", "linkedin_oauth_state").maybeSingle();
    if (!data?.value || data.value !== state) return NextResponse.redirect(`${back}?linkedin=badstate`);
    await exchangeCode(code);
    await sb.from("app_state").delete().eq("key", "linkedin_oauth_state");
    return NextResponse.redirect(`${back}?linkedin=ok`);
  } catch {
    return NextResponse.redirect(`${back}?linkedin=fail`);
  }
}
