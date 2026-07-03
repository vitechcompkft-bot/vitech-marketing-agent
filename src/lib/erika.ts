import { supabaseAdmin } from "./supabase";
import { sendTelegram } from "./telegram";
import { sendAgentMessage } from "./teamComms";
import { gyulaDailyCheck } from "./team";

/**
 * ERIKA — MENETREND-ALAPÚ FELÜGYELET.
 * Van egy napi menetrend (ki, HÁNY ÓRAKOR, mit). A feladat idopontja UTÁN pár perccel Erika:
 *  - ha még nem indult el → elindítja a felelos ügynököt,
 *  - ha a türelmi ido (GRACE) letelt és MÉG SINCS kész → RÁSZÓL az ügynökre és újraindítja (nógat),
 *  amíg el nem készül. Este (SUMMARY_TIME) egy napi ÖSSZEGZÉST küld.
 *
 * A gyakori ellenorzést a HELYI health-agent (2 percenként) hívja: POST /api/erika/audit → runErikaTick().
 * A Vercel 19:00-ás monitor-cron is meghívja (felho-tartalék, ha a gép ki volt kapcsolva).
 * A napi állapotot az app_state "erika_day_<dátum>" tárolja (a dashboard ebbol rajzolja a táblázatot).
 */

function baseUrl(): string {
  return process.env.PUBLIC_BASE_URL || "https://vitech-marketing-agent.vercel.app";
}
const bpDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest" }).format(d);
function bpNowHM(): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Budapest", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}
const hmToMin = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
};

type SchedTask = { key: string; label: string; time: string; kind: "klari" | "endpoint" | "gyula"; trigger?: string };

/** NAPI MENETREND (Budapest ido). Igény szerint átírható a time mezokben. */
export const SCHEDULE: SchedTask[] = [
  { key: "klari", label: "Napi Facebook-plakát", time: "07:00", kind: "klari" },
  { key: "judit", label: "Napi LinkedIn-poszt", time: "09:00", kind: "endpoint", trigger: "/api/judit/run?force=1" },
  { key: "mihaly", label: "Napi pénzügyi jelentés", time: "11:00", kind: "endpoint", trigger: "/api/finance/run?force=1" },
  { key: "luca", label: "Hirdetés-figyelés, optimalizálás", time: "13:00", kind: "endpoint", trigger: "/api/luca/reach?force=1" },
  { key: "gyula", label: "Rendszer-ellenorzés", time: "15:00", kind: "gyula" },
  { key: "lifestyle", label: "Napi lifestyle-plakát (FB)", time: "17:00", kind: "endpoint", trigger: "/api/klari/lifestyle?force=1" },
];
export const SUMMARY_TIME = "18:00";
const GRACE_MIN = 6; // a feladat idopontja UTÁN ennyi perccel nógat Erika, ha nincs kész

async function loadDay(date: string): Promise<any> {
  try {
    const { data } = await supabaseAdmin().from("app_state").select("value").eq("key", `erika_day_${date}`).maybeSingle();
    if (data?.value) return JSON.parse(data.value);
  } catch {}
  return null;
}
async function saveDay(date: string, obj: any) {
  try {
    await supabaseAdmin().from("app_state").upsert({ key: `erika_day_${date}`, value: JSON.stringify(obj), updated_at: new Date().toISOString() });
  } catch {}
}
async function setErikaStatus(status: string, note: string) {
  try {
    await supabaseAdmin().from("agent_status").update({ status, status_note: note, status_at: new Date().toISOString() }).eq("key", "erika");
  } catch {}
}
async function fireBg(path: string) {
  const secret = process.env.CRON_SECRET;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret) headers.authorization = `Bearer ${secret}`;
  await fetch(`${baseUrl()}${path}`, { method: "POST", headers, signal: AbortSignal.timeout(10000) }).catch(() => {});
}

/** Klári indítása duplikáció nélkül: elakadt MAI pending_image → render FOLYTATÁS, különben teljes futás. */
async function triggerKlari() {
  try {
    const today = bpDay(new Date());
    const { data } = await supabaseAdmin()
      .from("klari_posts")
      .select("id, created_at, status")
      .eq("status", "pending_image")
      .order("id", { ascending: false })
      .limit(1);
    const pending = (data || [])[0];
    if (pending && bpDay(new Date(pending.created_at)) === today) {
      await fireBg("/api/klari/render");
      return;
    }
  } catch {}
  await fireBg("/api/klari/run?force=1");
}
async function triggerTask(t: SchedTask) {
  if (t.kind === "klari") return triggerKlari();
  if (t.kind === "gyula") return gyulaDailyCheck().catch(() => {});
  if (t.trigger) return fireBg(t.trigger);
}

async function isDoneToday(key: string, statuses: any[], today: string): Promise<boolean> {
  if (key === "lifestyle") {
    // A lifestyle-plakát a "klari" agent-státuszt írja, ezért külön mérjük: app_state "lifestyle_last".
    try {
      const { data } = await supabaseAdmin().from("app_state").select("value").eq("key", "lifestyle_last").maybeSingle();
      if (!data?.value) return false;
      const j = JSON.parse(data.value);
      return j.ok === true && !!j.asOf && bpDay(new Date(j.asOf)) === today;
    } catch {
      return false;
    }
  }
  if (key === "klari") {
    try {
      const { data } = await supabaseAdmin().from("klari_posts").select("status, created_at").eq("status", "approved").order("id", { ascending: false }).limit(1);
      const p = (data || [])[0];
      return !!p && bpDay(new Date(p.created_at)) === today;
    } catch {
      return false;
    }
  }
  const s = statuses.find((x) => x.key === key);
  return !!s && s.status === "done" && !!s.status_at && bpDay(new Date(s.status_at)) === today;
}
function isWorking(key: string, statuses: any[]): boolean {
  const s = statuses.find((x) => x.key === key);
  if (!s || s.status !== "working" || !s.status_at) return false;
  return Date.now() - new Date(s.status_at).getTime() < 5 * 60 * 1000;
}

/** EGY ellenorzo kör. A helyi 2 perces figyelo + a 19:00-ás cron hívja. Idempotens (triggeredAt véd a dupla ellen). */
export async function runErikaTick(): Promise<any> {
  const sb = supabaseAdmin();
  const today = bpDay(new Date());
  const nowHM = bpNowHM();
  const nowMin = hmToMin(nowHM);
  const { data: statuses } = await sb.from("agent_status").select("key,status,status_at");
  const sts = statuses || [];

  let day = await loadDay(today);
  if (!day || day.date !== today) day = { date: today, tasks: {}, summarySent: false };

  const nudged: string[] = [];
  for (const t of SCHEDULE) {
    const e = day.tasks[t.key] || { key: t.key, label: t.label, time: t.time, status: "pending", triggeredAt: null, doneAt: null, nudges: 0 };
    e.label = t.label;
    e.time = t.time;
    const done = await isDoneToday(t.key, sts, today);
    const working = isWorking(t.key, sts);
    const taskMin = hmToMin(t.time);

    if (done) {
      if (e.status !== "done") {
        e.status = "done";
        if (!e.doneAt) e.doneAt = nowHM;
      }
    } else if (nowMin >= taskMin) {
      if (!e.triggeredAt && !working) {
        await triggerTask(t);
        e.triggeredAt = nowHM;
        e.status = "working";
      } else if (nowMin >= taskMin + GRACE_MIN && !working) {
        await sendAgentMessage("erika", t.key, "kérés", `A mai feladatod ("${t.label}", ${t.time}) még nincs kész — kérlek, csináld meg most.`).catch(() => {});
        await triggerTask(t);
        e.nudges = (e.nudges || 0) + 1;
        e.status = "late";
        nudged.push(t.label);
      } else {
        e.status = "working";
      }
    } else {
      e.status = "pending";
    }
    day.tasks[t.key] = e;
  }

  const doneCount = SCHEDULE.filter((t) => day.tasks[t.key]?.status === "done").length;
  const lateList = SCHEDULE.filter((t) => day.tasks[t.key]?.status === "late").map((t) => t.label);
  await setErikaStatus(
    lateList.length ? "working" : "done",
    lateList.length
      ? `Nógatom a késo feladatot: ${lateList.join(", ")} (${doneCount}/${SCHEDULE.length} kész).`
      : `Menetrend-ellenorzés: ${doneCount}/${SCHEDULE.length} mai feladat kész.`
  );

  if (nowMin >= hmToMin(SUMMARY_TIME) && !day.summarySent) {
    await sendDaySummary(day);
    day.summarySent = true;
  }

  await saveDay(today, day);
  return { ok: true, nowHM, doneCount, total: SCHEDULE.length, nudged, summarySent: day.summarySent };
}

async function sendDaySummary(day: any) {
  const lines = SCHEDULE.map((t) => {
    const e = day.tasks[t.key];
    return e?.status === "done"
      ? `✅ ${t.time} ${t.label} — kész${e.doneAt ? " (" + e.doneAt + ")" : ""}`
      : `⚠️ ${t.time} ${t.label} — NEM készült el`;
  });
  const allOk = SCHEDULE.every((t) => day.tasks[t.key]?.status === "done");
  await sendTelegram(`📋 <b>Erika napi összegzés</b> (${day.date})\n${lines.join("\n")}${allOk ? "\n\n🎉 Minden mai feladat elkészült!" : ""}`).catch(() => {});
}

/** A dashboard főoldali menetrend-táblázatához: a mai nap feladatai + státusz. */
export async function getTodaySchedule(): Promise<{ date: string; summarySent: boolean; tasks: any[] }> {
  const today = bpDay(new Date());
  const day = await loadDay(today);
  const tasks = SCHEDULE.map((t) => {
    const e = day?.tasks?.[t.key];
    return { key: t.key, label: t.label, time: t.time, status: e?.status || "pending", doneAt: e?.doneAt || null, nudges: e?.nudges || 0 };
  });
  return { date: today, summarySent: !!day?.summarySent, tasks };
}
