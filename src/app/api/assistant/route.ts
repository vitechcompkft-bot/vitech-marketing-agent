import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { officeRoute, agentReply } from "@/lib/claude";
import { buildContext } from "@/lib/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A titkárság (Erika) bejövo csatornája: a tulajdonos üzenetét Erika a megfelelo
 * osztályvezetohöz irányítja, az válaszol, Erika pedig rendezve továbbítja.
 */
export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();
    if (!message) return NextResponse.json({ error: "Üres üzenet." }, { status: 400 });

    const sb = supabaseAdmin();
    const [{ data: cfg }, { data: ags }] = await Promise.all([
      sb.from("agent_config").select("agent_name, agent_persona").eq("id", 1).single(),
      sb.from("agents").select("*").eq("active", true),
    ]);
    const agents: any[] = ags || [];
    const erika = agents.find((a) => a.key === "erika");
    const gyula = agents.find((a) => a.key === "gyula");
    const lucaName = cfg?.agent_name || "Luca";
    const lucaPersona = cfg?.agent_persona || "";

    const heads = [
      { key: "luca", name: lucaName, department: "Marketing", role: "marketingfonök" },
      ...(gyula ? [{ key: "gyula", name: gyula.name, department: "Informatika", role: gyula.role }] : []),
    ];

    const route = await officeRoute(message, erika?.persona || "", heads);

    let who: { name: string; role: string; department: string; persona: string };
    let context = "";
    if (route.head_key === "luca") {
      who = { name: lucaName, role: "marketingfonök", department: "Marketing", persona: lucaPersona };
      context = await buildContext().catch(() => "");
    } else if (route.head_key === "gyula" && gyula) {
      who = { name: gyula.name, role: gyula.role, department: "Informatika", persona: gyula.persona };
    } else {
      who = { name: erika?.name || "Erika", role: "titkárno", department: "Titkárság", persona: erika?.persona || "" };
    }

    const reply = await agentReply(who, message, context);

    await sb.from("chat_messages").insert([
      { role: "user", content: message, channel: "office" },
      { role: "agent", content: `[${who.name} – ${who.department}] ${reply}`, channel: "office" },
    ]);

    return NextResponse.json({
      routedTo: { name: who.name, department: who.department },
      reason: route.reason,
      reply,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "hiba" }, { status: 500 });
  }
}
