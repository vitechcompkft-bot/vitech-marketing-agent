import { supabaseAdmin } from "./supabase";
import { sendTelegram } from "./telegram";
import { sendAgentMessage } from "./teamComms";
import { gyulaDailyCheck } from "./team";

/**
 * ERIKA — FELÜGYELET. Napi ellenőrzés: minden ügynök elvégezte-e a mai feladatát?
 * Ha valami nincs kész → Erika "megkéri" a felelős ügynököt (üzenet + a munka újraindítása),
 * és KÖRÖNKÉNT addig nógatja (külön invokációkban, saját 60s budgettel), amíg el nem készül,
 * vagy a max. kör után riaszt a tulajdonosnak. Az ÉPP dolgozó ügynököt békén hagyja (idot ad).
 */

function baseUrl(): string {
  return process.env.PUBLIC_BASE_URL || "https://vitech-marketing-agent.vercel.app";
}
const bpDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest" }).format(d);

type Supervised = { key: string; label: string; kind: "klari" | "endpoint" | "gyula"; path?: string };
const SUPERVISED: Supervised[] = [
  { key: "klari", label: "napi Facebook-plakát", kind: "klari" },
  { key: "judit", label: "napi LinkedIn-poszt", kind: "endpoint", path: "/api/judit/run?force=1" },
  { key: "mihaly", label: "napi pénzügyi jelentés", kind: "endpoint", path: "/api/finance/run?force=1" },
  { key: "luca", label: "hirdetés-figyelés", kind: "endpoint", path: "/api/luca/reach?force=1" },
  { key: "gyula", label: "rendszer-ellenőrzés", kind: "gyula" },
];

const MAX_ROUNDS = 4;

async function setErikaStatus(status: string, note: string) {
  try {
    await supabaseAdmin()
      .from("agent_status")
      .update({ status, status_note: note, status_at: new Date().toISOString() })
      .eq("key", "erika");
  } catch {
    /* best-effort */
  }
}

async function fireBg(path: string) {
  const secret = process.env.CRON_SECRET;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret) headers.authorization = `Bearer ${secret}`;
  await fetch(`${baseUrl()}${path}`, { method: "POST", headers, signal: AbortSignal.timeout(10000) }).catch(() => {});
}

/**
 * Klári újraindítása duplikáció nélkül: ha MA van elakadt 'pending_image' sor → a rendert FOLYTATJA
 * (nem készít új posztot); különben teljes új futás.
 */
async function retriggerKlari() {
  try {
    const sb = supabaseAdmin();
    const today = bpDay(new Date());
    const { data } = await sb
      .from("klari_posts")
      .select("id, created_at, status")
      .eq("status", "pending_image")
      .order("id", { ascending: false })
      .limit(1);
    const pending = (data || [])[0];
    if (pending && bpDay(new Date(pending.created_at)) === today) {
      await fireBg("/api/klari/render"); // a legutóbbi pending_image folytatása (elakadt render)
      return;
    }
  } catch {
    /* ha nem tudjuk eldönteni, teljes futással pótolunk */
  }
  await fireBg("/api/klari/run?force=1");
}

/** Napi ÖSSZEGZÉS a tulajdonosnak Telegramon — MINDEN nap (nem csak hibánál), hogy rendszeres legyen. */
async function sendDailySummary(prefix = ""): Promise<void> {
  const sb = supabaseAdmin();
  const today = bpDay(new Date());
  const { data: statuses } = await sb.from("agent_status").select("key,status,status_at");
  const lines = SUPERVISED.map((a) => {
    const s = (statuses || []).find((x: any) => x.key === a.key);
    const done = !!s && s.status === "done" && !!s.status_at && bpDay(new Date(s.status_at)) === today;
    return `${done ? "✅" : "⚠️"} ${a.label}`;
  });
  let posterLine = "";
  try {
    const { data } = await sb.from("klari_posts").select("headline, status, created_at").order("id", { ascending: false }).limit(1);
    const p = (data || [])[0];
    if (p && bpDay(new Date(p.created_at)) === today) posterLine = `\n🖼️ Mai plakát: ${p.headline || "kész"}`;
  } catch {
    /* best-effort */
  }
  await sendTelegram(`📋 <b>Erika napi összegzés</b>${prefix}\n${lines.join("\n")}${posterLine}`).catch(() => {});
}

export async function runErikaAudit(round = 1): Promise<{
  ok: boolean;
  round: number;
  allDone: boolean;
  missing: string[];
  nudged: string[];
}> {
  // 1. kör: adjunk idot a monitor-cron által ÉPP elindított ügynököknek, hogy elkezdjenek dolgozni
  // (különben Erika a tegnapi 'done'-t látná és feleslegesen újraindítaná oket = dupla futás/poszt).
  if (round === 1) await new Promise((r) => setTimeout(r, 25000));
  const sb = supabaseAdmin();
  const today = bpDay(new Date());
  const { data: statuses } = await sb.from("agent_status").select("key,status,status_at");
  const byKey = (k: string) => (statuses || []).find((s: any) => s.key === k);

  const doneToday = (k: string) => {
    const s = byKey(k);
    return !!s && s.status === "done" && !!s.status_at && bpDay(new Date(s.status_at)) === today;
  };
  const activelyWorking = (k: string) => {
    const s = byKey(k);
    if (!s || s.status !== "working" || !s.status_at) return false;
    return Date.now() - new Date(s.status_at).getTime() < 5 * 60 * 1000; // 5 percen belül frissült → hagyd dolgozni
  };

  const missing = SUPERVISED.filter((a) => !doneToday(a.key));

  if (missing.length === 0) {
    await setErikaStatus("done", `Ellenőrzés kész (${round}. kör): minden ügynök végzett ma. ✅`);
    await sendDailySummary(round > 1 ? " (nógatás után minden kész)" : "");
    return { ok: true, round, allDone: true, missing: [], nudged: [] };
  }

  // Az ÉPP (frissen) dolgozó ügynököt nem nógatjuk — csak az elakadtat/el nem kezdettet.
  const toNudge = missing.filter((a) => !activelyWorking(a.key));
  await setErikaStatus(
    "working",
    `Ellenőrzés (${round}. kör): hiányzik — ${missing.map((m) => m.label).join(", ")}. ${
      toNudge.length ? "Nógatom: " + toNudge.map((m) => m.label).join(", ") + "…" : "Épp dolgoznak, várok…"
    }`
  );

  for (const a of toNudge) {
    await sendAgentMessage("erika", a.key, "kérés", `A mai feladatod ("${a.label}") még nincs kész — kérlek, fejezd be most.`).catch(() => {});
    if (a.kind === "klari") await retriggerKlari();
    else if (a.kind === "gyula") await gyulaDailyCheck().catch(() => {});
    else if (a.path) await fireBg(a.path);
  }

  // „Addig nógatja, míg el nem készül": következő kör KÜLÖN invokációban, kis várakozás után.
  if (round < MAX_ROUNDS) {
    await new Promise((r) => setTimeout(r, 18000)); // hagyjuk dolgozni a felnógatottakat
    const secret = process.env.CRON_SECRET;
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (secret) headers.authorization = `Bearer ${secret}`;
    await fetch(`${baseUrl()}/api/erika/audit`, {
      method: "POST",
      headers,
      body: JSON.stringify({ round: round + 1 }),
      signal: AbortSignal.timeout(10000),
    }).catch(() => {});
    return { ok: true, round, allDone: false, missing: missing.map((m) => m.key), nudged: toNudge.map((m) => m.key) };
  }

  // Elfogytak a körök, még mindig hiányzik → RIASZTÁS a tulajdonosnak.
  await setErikaStatus("working", `${MAX_ROUNDS} kör után is hiányzik: ${missing.map((m) => m.label).join(", ")}. Kézi beavatkozás kellhet.`);
  await sendDailySummary(` — ⚠️ ${MAX_ROUNDS} nógatás után is hiányzik: ${missing.map((m) => m.label).join(", ")}! Kézi beavatkozás kellhet.`);
  return { ok: true, round, allDone: false, missing: missing.map((m) => m.key), nudged: [] };
}
