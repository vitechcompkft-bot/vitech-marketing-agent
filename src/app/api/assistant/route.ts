import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { officeRoute, agentReply } from "@/lib/claude";
import { buildContext } from "@/lib/context";
import { createTask } from "@/lib/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function baseUrl(): string {
  return process.env.PUBLIC_BASE_URL || "https://vitech-marketing-agent.vercel.app";
}

/**
 * A titkárság (Erika) bejövo csatornája. Ha a feladat egy osztályvezetonek szól, Erika FELADATKÉNT
 * továbbítja (követheto: fogadva → folyamatban → kész + válasz a „Feladatok" panelen), és a feldolgozást
 * KÜLÖN invokációban indítja. Ha Erikának magának szól, o azonnal válaszol.
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
    const mihalyPersona =
      mihaly?.persona ||
      "Gazdasági vezeto / pénzügyi kontroller: elemzi a költéseket (mire megy a pénz, szükséges-e), és javaslatot tesz a gazdaságosabb muködésre.";

    const heads = [
      { key: "luca", name: lucaName, department: "Marketing", role: "marketingfonök" },
      ...(gyula ? [{ key: "gyula", name: gyula.name, department: "Informatika", role: gyula.role }] : []),
      { key: "mihaly", name: mihaly?.name || "Mihály", department: "Gazdasági", role: mihaly?.role || "gazdasági vezeto (kontroller)" },
    ];

    const route = await officeRoute(message, erika?.persona || "", heads);
    const headKey = ["luca", "gyula", "mihaly"].includes(route.head_key) ? route.head_key : "erika";

    // Erika magának tartja → azonnal válaszol (titkársági ügy).
    if (headKey === "erika") {
      const who = { name: erika?.name || "Erika", role: "titkárno", department: "Titkárság", persona: erika?.persona || "" };
      const reply = await agentReply(who, message, "");
      await sb.from("chat_messages").insert([
        { role: "user", content: message, channel: "office" },
        { role: "agent", content: `[${who.name} – Titkárság] ${reply}`, channel: "office" },
      ]);
      return NextResponse.json({ routedTo: { name: who.name, department: "Titkárság" }, reason: route.reason, reply, task: false });
    }

    // Osztályvezetonek szól → FELADAT létrehozása + háttér-feldolgozás indítása.
    const who =
      headKey === "luca"
        ? { name: lucaName, role: "marketingfonök", department: "Marketing", persona: lucaPersona }
        : headKey === "gyula" && gyula
        ? { name: gyula.name, role: gyula.role, department: "Informatika", persona: gyula.persona }
        : { name: mihaly?.name || "Mihály", role: mihaly?.role || "gazdasági vezeto (kontroller)", department: "Gazdasági", persona: mihalyPersona };

    await createTask(headKey, who, message);
    const ack = `Megkaptam! Továbbítottam ${who.name}nak (${who.department} osztály). Már dolgozik rajta — a választ a „Feladatok" panelen látod hamarosan.`;
    await sb.from("chat_messages").insert([
      { role: "user", content: message, channel: "office" },
      { role: "agent", content: `[Erika – Titkárság] ${ack}`, channel: "office" },
    ]);

    // Feldolgozás KÜLÖN invokációban (saját 60s budget); ha nem indul el, a napi cron pótolja.
    const secret = process.env.CRON_SECRET;
    fetch(`${baseUrl()}/api/tasks/run`, {
      method: "POST",
      headers: secret ? { authorization: `Bearer ${secret}` } : {},
      signal: AbortSignal.timeout(4000),
    }).catch(() => {});

    return NextResponse.json({ routedTo: { name: who.name, department: who.department }, reason: route.reason, reply: ack, task: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "hiba" }, { status: 500 });
  }
}
