import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A Google Ads szkript ezt hívja: visszaadja a JÓVÁHAGYOTT, végrehajtandó parancsokat.
 * A visszaadott elemeket egyben "executing" állapotba teszi, hogy ne hajtódjanak végre kétszer.
 * Védelem: Authorization: Bearer <CRON_SECRET>.
 */
// PMax-en a sitelink/kiemelo a szkriptbol nem alkalmazható → csak ezeket adjuk át a szkriptnek.
const SCRIPT_TYPES = ["budget_change", "pause_ad", "enable_ad"];

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("actions")
    .select("id, type, campaign_id, params")
    .eq("status", "approved")
    .in("type", SCRIPT_TYPES)
    .order("id", { ascending: true })
    .limit(20);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const commands = data || [];
  if (commands.length) {
    const ids = commands.map((c) => c.id);
    await sb.from("actions").update({ status: "executing" }).in("id", ids);
  }

  return NextResponse.json(
    { ok: true, commands },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
