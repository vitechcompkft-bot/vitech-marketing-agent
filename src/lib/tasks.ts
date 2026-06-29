import { supabaseAdmin } from "./supabase";
import { agentReply } from "./claude";
import { getBankSnapshot } from "./bank";
import { getOrderStats } from "./orders";
import { getSiteHealth } from "./health";

/**
 * TULAJDONOSI FELADATOK — a tulajdonos Erikának ad egy feladatot, Erika a megfelelo ügynökhöz továbbítja,
 * az dolgozik rajta, és válaszol. Látható életciklus: fogadva → folyamatban → kész (+ válasz).
 * Tárolás: app_state "agent_tasks" (JSON lista, nincs migráció).
 */
export interface OwnerTask {
  id: string;
  to: string; // ügynök kulcs (luca/gyula/mihaly…)
  who: { name: string; role: string; department: string; persona: string };
  title: string; // a feladat szövege
  status: "fogadva" | "folyamatban" | "kész";
  response?: string;
  createdAt: string;
  updatedAt: string;
}

const ft = (n: number) => new Intl.NumberFormat("hu-HU").format(Math.round(n || 0)) + " Ft";

let _c = 0;
function nid(): string {
  return `${Date.now().toString(36)}${(_c++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

async function load(): Promise<OwnerTask[]> {
  try {
    const sb = supabaseAdmin();
    const { data } = await sb.from("app_state").select("value").eq("key", "agent_tasks").maybeSingle();
    return data?.value ? (JSON.parse(data.value) as OwnerTask[]) : [];
  } catch {
    return [];
  }
}
async function save(list: OwnerTask[]): Promise<void> {
  const sb = supabaseAdmin();
  await sb.from("app_state").upsert({ key: "agent_tasks", value: JSON.stringify(list.slice(0, 40)), updated_at: new Date().toISOString() });
}

export async function getTasks(): Promise<OwnerTask[]> {
  return load();
}

/** Új feladat létrehozása (Erika átadta a megfelelo ügynöknek) — állapot: fogadva. */
export async function createTask(to: string, who: OwnerTask["who"], title: string): Promise<OwnerTask> {
  const list = await load();
  const now = new Date().toISOString();
  const t: OwnerTask = { id: nid(), to, who, title, status: "fogadva", createdAt: now, updatedAt: now };
  await save([t, ...list]);
  return t;
}

/** A megszólított ügynök szakterületi kontextusa a feladat megoldásához. */
async function ctxFor(to: string): Promise<string> {
  try {
    if (to === "gyula") {
      const s = await getSiteHealth().catch(() => [] as any[]);
      const list = (s || []).map((x: any) => `${x.name || x.url || "oldal"}: ${x.ok === false || x.status === "down" ? "HIBA" : "OK"}`).join(", ");
      return list ? `Rendszerek állapota: ${list}.` : "A rendszerek rendben.";
    }
    if (to === "mihaly") {
      const b = await getBankSnapshot().catch(() => null as any);
      const o = await getOrderStats().catch(() => null as any);
      return [
        b ? `Banki egyenleg ~${ft(b.balance || 0)}, 30 napos ÖSSZES kiadás ~${ft(b.out30 || 0)} (nagy része nagyker-/beszerzési költség, nem hirdetés).` : "",
        o ? `Webshop havi bevétel ${ft(o.monthRevenue || 0)} (${o.monthCount || 0} eladás).` : "",
      ].filter(Boolean).join(" ");
    }
    if (to === "luca") {
      const o = await getOrderStats().catch(() => null as any);
      return o ? `Eladás ma ${o.todayCount || 0} db, havi ${o.monthCount || 0} db, havi bevétel ${ft(o.monthRevenue || 0)}.` : "";
    }
  } catch {
    /* a kontextus nem kritikus */
  }
  return "";
}

/** A függoben lévo feladatok feldolgozása: folyamatban → válasz generálása → kész. */
export async function processTasks(): Promise<number> {
  const list = await load();
  const pending = list.filter((t) => t.status !== "kész");
  let done = 0;
  for (const t of pending) {
    // 1) folyamatban
    let cur = await load();
    let i = cur.findIndex((x) => x.id === t.id);
    if (i >= 0) {
      cur[i].status = "folyamatban";
      cur[i].updatedAt = new Date().toISOString();
      await save(cur);
    }
    // 2) válasz a szakterületi adatokkal
    const ctx = await ctxFor(t.to);
    const resp = await agentReply(t.who, t.title, ctx).catch(() => "");
    // 3) kész (+ válasz)
    cur = await load();
    i = cur.findIndex((x) => x.id === t.id);
    if (i >= 0) {
      cur[i].status = resp ? "kész" : "fogadva";
      if (resp) cur[i].response = resp;
      cur[i].updatedAt = new Date().toISOString();
      await save(cur);
    }
    if (resp) done++;
  }
  return done;
}
