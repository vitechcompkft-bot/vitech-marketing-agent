import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { approveAction } from "@/lib/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Javasolt akció jóváhagyása / elutasítása a dashboardról. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const { decision } = await req.json(); // 'approve' | 'reject'

  if (decision === "reject") {
    const sb = supabaseAdmin();
    const { data: action } = await sb.from("actions").select("status").eq("id", id).single();
    if (!action) return NextResponse.json({ error: "Nincs ilyen akció" }, { status: 404 });
    if (action.status !== "proposed") return NextResponse.json({ error: `Már ${action.status}` }, { status: 400 });
    await sb.from("actions").update({ status: "rejected" }).eq("id", id);
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  const res = await approveAction(id);
  return NextResponse.json(res);
}
