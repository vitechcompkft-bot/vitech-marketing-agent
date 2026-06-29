import { supabaseAdmin } from "./supabase";
import { teamReply } from "./claude";
import { getSiteHealth } from "./health";
import { getBankSnapshot } from "./bank";
import { getOrderStats } from "./orders";

/**
 * AI-CSAPAT BELSO KOMMUNIKÁCIÓ (v1) — bármelyik ügynök üzenhet egy másiknak; a megszólított a SAJÁT
 * szakterületi adataival válaszol (Q → A). Tárolás: app_state "agent_messages" (JSON lista, nincs migráció).
 * A monitor cron futtatja a runTeamSync()-et: valós helyzeteket „magvet" (deduped) + feldolgozza az inboxokat.
 */

export interface AgentMessage {
  id: string;
  from: string; // ügynök kulcs
  to: string;
  type: "kérdés" | "kérés" | "riasztás" | "válasz" | "info";
  body: string;
  status: "open" | "answered";
  thread: string;
  createdAt: string;
}

const NAMES: Record<string, string> = { erika: "Erika", luca: "Luca", klari: "Klári", judit: "Judit", gyula: "Gyula", mihaly: "Mihály" };
const DOMAINS: Record<string, string> = {
  gyula: "informatika: rendszer- és weboldal-állapot, uptime, automatizálás, technikai hibák",
  mihaly: "gazdasági: pénzügy, banki költések, megtérülés, gazdaságosság",
  luca: "marketingfonök: stratégia, Google/Meta hirdetések, kampányok, eladások",
  klari: "kreatív marketinges: napi termék-plakátok, akciók",
  judit: "tartalomíró: blog, LinkedIn-posztok",
  erika: "titkárság: koordináció, üzenet-irányítás, jelentés",
};

const ft = (n: number) => new Intl.NumberFormat("hu-HU").format(Math.round(n || 0)) + " Ft";
const todayHu = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest" }).format(new Date());

let _ctr = 0;
function newId(): string {
  return `${Date.now().toString(36)}${(_ctr++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

async function load(): Promise<AgentMessage[]> {
  try {
    const sb = supabaseAdmin();
    const { data } = await sb.from("app_state").select("value").eq("key", "agent_messages").maybeSingle();
    return data?.value ? (JSON.parse(data.value) as AgentMessage[]) : [];
  } catch {
    return [];
  }
}
async function save(list: AgentMessage[]): Promise<void> {
  const sb = supabaseAdmin();
  await sb.from("app_state").upsert({ key: "agent_messages", value: JSON.stringify(list.slice(0, 80)), updated_at: new Date().toISOString() });
}

export async function getAgentMessages(): Promise<AgentMessage[]> {
  return load();
}

/** Üzenet küldése egyik ügynöktol a másiknak. */
export async function sendAgentMessage(
  from: string,
  to: string,
  type: AgentMessage["type"],
  body: string,
  thread?: string
): Promise<AgentMessage> {
  const msgs = await load();
  const m: AgentMessage = { id: newId(), from, to, type, body, status: "open", thread: thread || newId(), createdAt: new Date().toISOString() };
  await save([m, ...msgs]);
  return m;
}

/** A megszólított ügynök szakterületi kontextusa a válaszhoz. */
async function domainContext(agentKey: string): Promise<string> {
  try {
    if (agentKey === "gyula") {
      const s = await getSiteHealth().catch(() => [] as any[]);
      const list = (s || []).map((x: any) => `${x.name || x.url || "oldal"}: ${x.ok === false || x.status === "down" ? "HIBA" : "OK"}`).join(", ");
      return list ? `Weboldalak/rendszerek állapota: ${list}.` : "A rendszerek rendben.";
    }
    if (agentKey === "mihaly") {
      const b = await getBankSnapshot().catch(() => null as any);
      const o = await getOrderStats().catch(() => null as any);
      const bal =
        !b || b.balance === null || b.balance === undefined
          ? "egyenleg: ismeretlen (K&H az open-bankingon nem adja vissza — NE feltételezd, hogy 0)"
          : `egyenleg ~${ft(b.balance)}`;
      const top = (b?.outByParty || []).slice(0, 5).map((p: any) => `${p.party}: ${ft(p.total)}`).join("; ");
      return [
        b ? `Banki adatok (30 nap): ${bal}; kiadás ~${ft(b.out30 || 0)}; bevétel ~${ft(b.in30 || 0)}.` : "",
        top ? `Kiadás-bontás: ${top}.` : "",
        o ? `Webshop havi bevétel ${ft(o.monthRevenue || 0)} (${o.monthCount || 0} eladás).` : "",
      ].filter(Boolean).join(" ");
    }
    if (agentKey === "luca") {
      const o = await getOrderStats().catch(() => null as any);
      return o ? `Eladás ma ${o.todayCount || 0} db, havi ${o.monthCount || 0} db, havi bevétel ${ft(o.monthRevenue || 0)}.` : "";
    }
  } catch {
    /* kontextus nem kritikus */
  }
  return "";
}

/** Egy ügynök inboxának feldolgozása: a neki címzett nyitott üzenetekre válaszol (Q → A). */
export async function processInbox(agentKey: string, maxReplies = 3): Promise<number> {
  const msgs = await load();
  const open = msgs.filter((m) => m.to === agentKey && m.status === "open").slice(0, maxReplies);
  if (!open.length) return 0;
  const ctx = await domainContext(agentKey);
  const persona = `Te vagy ${NAMES[agentKey] || agentKey}, a Vitech AI-csapat tagja (${DOMAINS[agentKey] || ""}).`;
  let answered = 0;
  for (const m of open) {
    const fromName = NAMES[m.from] || m.from;
    const reply = await teamReply(persona, fromName, m.body, ctx);
    if (!reply) continue;
    const cur = await load();
    const idx = cur.findIndex((x) => x.id === m.id);
    if (idx >= 0) cur[idx].status = "answered";
    const ans: AgentMessage = { id: newId(), from: agentKey, to: m.from, type: "válasz", body: reply, status: "answered", thread: m.thread, createdAt: new Date().toISOString() };
    await save([ans, ...cur]);
    answered++;
  }
  return answered;
}

/** Valós helyzetek „magvetése" (naponta egyszer, deduped). */
async function seedRealScenarios(): Promise<void> {
  const sb = supabaseAdmin();
  const { data } = await sb.from("app_state").select("value").eq("key", "team_seed").maybeSingle();
  const marker = (data?.value ? JSON.parse(data.value) : {}) as Record<string, string>;
  const today = todayHu();
  let changed = false;

  // Gyula → Luca: ha valamelyik oldal/rendszer hibás.
  try {
    const s = await getSiteHealth().catch(() => [] as any[]);
    const down = (s || []).filter((x: any) => x.ok === false || x.status === "down").map((x: any) => x.name || x.url);
    if (down.length && marker.gyula_down !== today) {
      await sendAgentMessage("gyula", "luca", "riasztás", `Technikai jelzés: elérhetetlen/hibás — ${down.join(", ")}. Megpróbálom automatikusan újraindítani; ha tartós, szólj a marketingnek, mert eshet a forgalom.`);
      marker.gyula_down = today;
      changed = true;
    }
  } catch {}

  // Mihály → Luca: napi pénzügyi figyelo (ha van marketing-költés).
  try {
    if (marker.mihaly_cost !== today) {
      const b = await getBankSnapshot().catch(() => null as any);
      const out30 = b?.out30 || 0;
      if (out30 > 0) {
        await sendAgentMessage("mihaly", "luca", "kérdés", `A 30 napos ÖSSZES banki kiadás ~${ft(out30)} (ennek nagy része nagyker-/beszerzési költség, a hirdetés csak egy kis rész). Átnéznéd kifejezetten a HIRDETÉSI költéseket — hol térül meg, és hol lehetne gazdaságosabb? Küldj egy gyors helyzetképet.`);
        marker.mihaly_cost = today;
        changed = true;
      }
    }
  } catch {}

  if (changed) await sb.from("app_state").upsert({ key: "team_seed", value: JSON.stringify(marker), updated_at: new Date().toISOString() });
}

/** Demo-magvetés (teszthez): pár induló üzenet, hogy lássuk a csapatot „beszélni". */
async function seedDemo(): Promise<void> {
  await sendAgentMessage("klari", "gyula", "kérdés", "A reggeli plakát-render néha lassú. Tudsz valamit gyorsítani a technikai oldalon, vagy minden rendben a rendszerrel?");
  await sendAgentMessage("luca", "mihaly", "kérés", "Döntés elott: mennyi most a valós megtérülés (ROAS) a webshop-eladások alapján? Kérek egy számot.");
}

/** A teljes csapat-szinkron: magvetés + inboxok feldolgozása (egy kör: Q → A). */
export async function runTeamSync(opts?: { demo?: boolean }): Promise<{ seeded: boolean; answered: number }> {
  if (opts?.demo) await seedDemo();
  await seedRealScenarios();
  let answered = 0;
  for (const a of ["luca", "mihaly", "gyula", "klari", "judit", "erika"]) {
    answered += await processInbox(a, 3);
  }
  return { seeded: true, answered };
}
