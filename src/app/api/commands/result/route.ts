import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A Google Ads szkript ezt hívja egy parancs végrehajtása után:
 *   { id, ok, message }  → a parancsot "executed" vagy "failed" állapotba teszi.
 * Védelem: Authorization: Bearer <CRON_SECRET>.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!id) return NextResponse.json({ ok: false, error: "Hiányzó id." }, { status: 400 });

  const ok = body?.ok === true;
  const message = String(body?.message ?? "");

  const sb = supabaseAdmin();
  await sb
    .from("actions")
    .update({
      status: ok ? "executed" : "failed",
      result: message,
      executed_at: new Date().toISOString(),
    })
    .eq("id", id);

  return NextResponse.json({ ok: true });
}
