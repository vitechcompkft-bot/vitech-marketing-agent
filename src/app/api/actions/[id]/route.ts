import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { execute, getConfig } from "@/lib/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Javasolt akció jóváhagyása / elutasítása a dashboardról. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const { decision } = await req.json(); // 'approve' | 'reject'
  const sb = supabaseAdmin();

  const { data: action } = await sb.from("actions").select("*").eq("id", id).single();
  if (!action) return NextResponse.json({ error: "Nincs ilyen akció" }, { status: 404 });
  if (action.status !== "proposed") return NextResponse.json({ error: `Már ${action.status}` }, { status: 400 });

  if (decision === "reject") {
    await sb.from("actions").update({ status: "rejected" }).eq("id", id);
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  const config = await getConfig();
  const res = await execute(action.type, action.campaign_id, action.params, config);
  await sb.from("actions").update({
    status: res.ok ? "executed" : "failed",
    result: res.message,
    executed_at: new Date().toISOString(),
  }).eq("id", id);
  return NextResponse.json({ ok: res.ok, status: res.ok ? "executed" : "failed", message: res.message });
}
