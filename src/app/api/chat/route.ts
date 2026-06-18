import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { chatWithAgent } from "@/lib/claude";
import { getConfig } from "@/lib/agent";
import { buildContext } from "@/lib/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { message, history } = await req.json();
    const sb = supabaseAdmin();

    await sb.from("chat_messages").insert({ role: "user", content: message, channel: "dashboard" });

    const context = await buildContext();
    const cfg = await getConfig();
    const reply = await chatWithAgent(
      [...(history || []), { role: "user", content: message }],
      context,
      { name: cfg.agent_name, persona: cfg.agent_persona }
    );

    await sb.from("chat_messages").insert({ role: "agent", content: reply, channel: "dashboard" });
    return NextResponse.json({ reply });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "hiba" }, { status: 500 });
  }
}
