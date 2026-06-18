import { NextResponse } from "next/server";
import { runMonitorCycle } from "@/lib/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Kézi futtatás a dashboard "Futtatás most" gombjához (azonos eredetű hívás). */
export async function POST() {
  try {
    const result = await runMonitorCycle();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}
