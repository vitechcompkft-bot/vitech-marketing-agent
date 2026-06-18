import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getConfig } from "@/lib/agent";
import { generateCreativeCopy } from "@/lib/claude";
import { buildCreativeSVG } from "@/lib/creatives";
import type { CreativeKind } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { kind, topic } = (await req.json()) as { kind: CreativeKind; topic: string };
    const config = await getConfig();

    const copy = await generateCreativeCopy(topic, kind, {
      name: config.agent_name,
      persona: config.agent_persona,
    });
    const svg = buildCreativeSVG(kind, copy);

    const sb = supabaseAdmin();
    const { data } = await sb
      .from("creatives")
      .insert({ kind, topic, ...copy, svg, created_by: "user" })
      .select()
      .single();

    return NextResponse.json({ ok: true, creative: data ?? { kind, topic, ...copy, svg } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}
