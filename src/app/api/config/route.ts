import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = [
  "agent_name",
  "agent_avatar",
  "agent_persona",
  "agent_enabled",
  "autonomy_level",
  "max_daily_budget_huf",
  "max_budget_change_pct",
  "min_data_clicks",
  "target_roas",
  "allow_pause_ads",
  "allow_budget_changes",
  "allow_create_campaign",
  "telegram_chat_id",
];

export async function GET() {
  const sb = supabaseAdmin();
  const { data } = await sb.from("agent_config").select("*").eq("id", 1).single();
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of ALLOWED) if (k in body) patch[k] = body[k];
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("agent_config").update(patch).eq("id", 1).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
