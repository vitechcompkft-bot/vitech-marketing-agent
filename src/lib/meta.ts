import { supabaseAdmin } from "./supabase";
import { sendTelegram } from "./telegram";

/**
 * Luca Meta-figyelése: a Pixel bekötése után ~3 hétig „érleli" a retargeting-közönséget,
 * majd Luca szól, hogy indulhat a kampány. (A pontos közönség-méret a Meta Marketing API-val
 * lenne mérheto — az külön integráció; ez az ido-alapú emlékezteto/jelzés.)
 */
const READY_DAYS = 21;

export interface MetaPlan {
  startedAt: string; // YYYY-MM-DD — a Pixel-figyelés indulása
  launchAt: string; // YYYY-MM-DD — ekkortól javasolt a kampány
  launched: boolean; // a user elindította-e már
  alerted: boolean; // szóltunk-e már, hogy indulhat
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export async function getMetaPlan(): Promise<MetaPlan | null> {
  try {
    const sb = supabaseAdmin();
    const { data } = await sb.from("app_state").select("value").eq("key", "meta_plan").maybeSingle();
    return data?.value ? (JSON.parse(data.value) as MetaPlan) : null;
  } catch {
    return null;
  }
}

async function saveMetaPlan(p: MetaPlan): Promise<void> {
  const sb = supabaseAdmin();
  await sb.from("app_state").upsert({ key: "meta_plan", value: JSON.stringify(p), updated_at: new Date().toISOString() });
}

export async function ensureMetaPlan(): Promise<MetaPlan> {
  let p = await getMetaPlan();
  if (!p) {
    const launch = new Date(Date.now() + READY_DAYS * 86400000).toISOString().slice(0, 10);
    p = { startedAt: todayISO(), launchAt: launch, launched: false, alerted: false };
    await saveMetaPlan(p);
  }
  return p;
}

/** Luca napi Meta-figyelése (a monitor-cronból): ha elérkezett az ido és még nem szólt → Telegram. */
export async function runMetaWatch(): Promise<void> {
  const p = await ensureMetaPlan();
  if (p.launched || p.alerted) return;
  if (todayISO() >= p.launchAt) {
    await sendTelegram(
      `🚀 *Luca — a Meta kampány indulhat!*\nA Meta Pixel kb. ${READY_DAYS} napja gyujti a webshop látogatóit, így már van retargeting-közönség. Javaslat: egy KIS budgetes RETARGETING kampány a boltot nézokre — ez a legjobb megtérülésu. Szólj, és összerakjuk.`
    ).catch(() => {});
    p.alerted = true;
    await saveMetaPlan(p);
  }
}

export interface MetaStatus {
  startedAt: string;
  launchAt: string;
  daysLeft: number;
  ready: boolean;
}
export async function getMetaStatus(): Promise<MetaStatus | null> {
  const p = await getMetaPlan();
  if (!p) return null;
  const daysLeft = Math.max(0, Math.ceil((new Date(p.launchAt).getTime() - Date.now()) / 86400000));
  return { startedAt: p.startedAt, launchAt: p.launchAt, daysLeft, ready: todayISO() >= p.launchAt };
}
