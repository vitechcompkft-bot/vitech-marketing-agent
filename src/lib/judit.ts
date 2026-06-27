import { supabaseAdmin } from "./supabase";
import { juditWriteLinkedIn } from "./claude";
import { sendTelegram } from "./telegram";

/** Judit egy LinkedIn-posztja (a marketing-csapat tartalomírója). */
export interface JuditPost {
  date: string;
  topic: string;
  hook: string;
  body: string;
  hashtags: string[];
}

/** Judit státuszának frissítése (a „judit" sor upsert-tel jön létre, ha még nincs). */
async function setJuditStatus(status: string, note: string): Promise<void> {
  try {
    const sb = supabaseAdmin();
    await sb
      .from("agent_status")
      .upsert({ key: "judit", status, status_note: note, status_at: new Date().toISOString() }, { onConflict: "key" });
  } catch {
    /* a státusz nem kritikus */
  }
}

/** A tárolt LinkedIn-posztok (app_state.judit_posts, legújabb elöl). */
export async function getJuditPosts(): Promise<JuditPost[]> {
  try {
    const sb = supabaseAdmin();
    const { data } = await sb.from("app_state").select("value").eq("key", "judit_posts").maybeSingle();
    if (!data?.value) return [];
    return JSON.parse(data.value) as JuditPost[];
  } catch {
    return [];
  }
}

/** JUDIT napi feladata: egy ÚJ, változatos LinkedIn-poszt az AI-ügynökségrol → mentés + Telegram. */
export async function runJuditDaily(): Promise<{ ok: boolean; post?: JuditPost; reason?: string }> {
  await setJuditStatus("working", "LinkedIn-poszt írása…");
  const existing = await getJuditPosts();
  const recentTopics = existing.slice(0, 8).map((p) => p.topic).filter(Boolean);

  const w = await juditWriteLinkedIn(recentTopics);
  if (!w) {
    await setJuditStatus("error", "A LinkedIn-poszt most nem készült el.");
    return { ok: false, reason: "Judit most nem tudott posztot írni." };
  }

  const dateLabel = new Intl.DateTimeFormat("hu-HU", {
    timeZone: "Europe/Budapest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const post: JuditPost = { date: dateLabel, topic: w.topic, hook: w.hook, body: w.body, hashtags: w.hashtags };
  const next = [post, ...existing].slice(0, 12);

  try {
    const sb = supabaseAdmin();
    await sb.from("app_state").upsert({ key: "judit_posts", value: JSON.stringify(next), updated_at: new Date().toISOString() });
  } catch {
    /* mentés nem kritikus a Telegram-küldéshez */
  }

  await setJuditStatus("done", `Mai LinkedIn-poszt kész: ${w.topic}`);

  const tags = w.hashtags.join(" ");
  await sendTelegram(
    `📝 *Judit — mai LinkedIn-poszt* (${w.topic})\n\n${w.body}${tags ? `\n\n${tags}` : ""}`
  ).catch(() => {});

  return { ok: true, post };
}
