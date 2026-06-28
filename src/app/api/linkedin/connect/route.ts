import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { linkedinConfigured, linkedinAuthUrl } from "@/lib/linkedin";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * LinkedIn összekötés indítása — a dashboard Basic Auth-ja védi (bejelentkezett user kattintja).
 * Generál egy state-et, eltárolja, majd a LinkedIn engedélyezo oldalára irányít.
 */
export async function GET(req: NextRequest) {
  if (!linkedinConfigured()) {
    return NextResponse.json({ ok: false, error: "Hiányzik a LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET a Vercel env-ben." }, { status: 400 });
  }
  const state = crypto.randomUUID();
  try {
    const sb = supabaseAdmin();
    await sb.from("app_state").upsert({ key: "linkedin_oauth_state", value: state, updated_at: new Date().toISOString() });
  } catch {
    /* state mentés */
  }
  void req;
  return NextResponse.redirect(linkedinAuthUrl(state));
}
