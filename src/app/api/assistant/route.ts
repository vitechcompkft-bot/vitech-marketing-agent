import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { officeRoute, agentReply } from "@/lib/claude";
import { buildContext } from "@/lib/context";
import { sendAgentMessage } from "@/lib/teamComms";

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
    const mihaly = agents.find((a) => a.key === "mihaly");
    const lucaName = cfg?.agent_name || "Luca";
    const lucaPersona = cfg?.agent_persona || "";
    const mihalyPersona = mihaly?.persona || "Gazdasági vezeto / pénzügyi kontroller: elemzi a költéseket (mire megy a pénz, szükséges-e), és javaslatot tesz a gazdaságosabb muködésre.";

    const heads = [
      { key: "luca", name: lucaName, department: "Marketing", role: "marketingfonök" },
      ...(gyula ? [{ key: "gyula", name: gyula.name, department: "Informatika", role: gyula.role }] : []),
      { key: "mihaly", name: mihaly?.name || "Mihály", department: "Gazdasági", role: mihaly?.role || "gazdasági vezeto (kontroller)" },
    ];

    const route = await officeRoute(message, erika?.persona || "", heads);

    let who: { name: string; role: string; department: string; persona: string };
    let context = "";
    if (route.head_key === "luca") {
      who = { name: lucaName, role: "marketingfonök", department: "Marketing", persona: lucaPersona };
      context = await buildContext().catch(() => "");
    } else if (route.head_key === "gyula" && gyula) {
      who = { name: gyula.name, role: gyula.role, department: "Informatika", persona: gyula.persona };
    } else if (route.head_key === "mihaly") {
      who = { name: mihaly?.name || "Mihály", role: mihaly?.role || "gazdasági vezeto (kontroller)", department: "Gazdasági", persona: mihalyPersona };
      context = await buildContext().catch(() => "");
    } else {
      who = { name: erika?.name || "Erika", role: "titkárno", department: "Titkárság", persona: erika?.persona || "" };
    }

    const reply = await agentReply(who, message, context);

    await sb.from("chat_messages").insert([
      { role: "user", content: message, channel: "office" },
      { role: "agent", content: `[${who.name} – ${who.department}] ${reply}`, channel: "office" },
    ]);

    // A folyamat megjelenítése a „Csapat-kommunikáció" feedben is: Erika továbbítja a kérést a
    // megfelelo osztályvezetonek, az válaszol. Így a tulajdonos LÁTJA, hogy Erika tovább adta.
    const headKey = ["luca", "gyula", "mihaly"].includes(route.head_key) ? route.head_key : "erika";
    if (headKey !== "erika") {
      try {
        await sendAgentMessage("erika", headKey, "kérés", `A tulajdonos kérése: ${message}`);
        await sendAgentMessage(headKey, "erika", "válasz", reply);
      } catch {
        /* a feed-naplózás nem kritikus */
      }
    }

    return NextResponse.json({
      routedTo: { name: who.name, department: who.department },
      reason: route.reason,
      reply,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "hiba" }, { status: 500 });
  }
}
