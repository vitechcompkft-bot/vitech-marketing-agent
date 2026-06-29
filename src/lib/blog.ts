import { supabaseAdmin } from "./supabase";
import { unasLogin, unasCreateBlogPost } from "./unas";
import { juditWriteBlog, lucaProofreadHungarian } from "./claude";
import { setAgentStatus } from "./team";
import { sendTelegram } from "./telegram";

/**
 * Automata webshop-blog: Judit ír egy SEO vásárlási útmutatót → Luca ékezet-/helyesírás-korrektúra
 * → Unas setPageContent (Type=blog) ÉLESBEN. Heti 1 cikk (a monitor cron hétfon indítja).
 */

/** Téma-sor — a következo, még ki nem adott témát választjuk. */
const TOPICS: string[] = [
  "Felújított laptop vásárlás: mire figyelj? (teljes útmutató)",
  "Melyik felújított üzleti laptop kinek? ThinkPad vs EliteBook vs Latitude",
  "Felújított vagy új laptop — tényleg megéri a felújított?",
  "Felújított laptop diákoknak: mennyit költs és mire figyelj?",
  "Felújított laptop home office-ra: a legjobb választások",
  "Felújított laptopok cégeknek: miért éri meg flottában?",
  "Mit jelent az A, B és C minőségi besorolás egy felújított gépnél?",
  "SSD vagy HDD? Miért gyorsabb egy felújított gép SSD-vel",
  "Mennyi memória (RAM) kell? 8, 16 vagy 32 GB?",
  "Hogyan ellenőrizd egy felújított laptop akkumulátorát?",
  "Garancia felújított laptopnál: mire figyelj vásárlás előtt?",
  "Üzleti laptop-sorozatok, amelyek évekig bírják",
];

export interface BlogRecord {
  date: string;
  title: string;
  slug: string;
  url: string;
  id?: string;
}

export async function getBlogPosts(): Promise<BlogRecord[]> {
  try {
    const sb = supabaseAdmin();
    const { data } = await sb.from("app_state").select("value").eq("key", "blog_posts").maybeSingle();
    if (!data?.value) return [];
    return JSON.parse(data.value) as BlogRecord[];
  } catch {
    return [];
  }
}

const todayHu = () =>
  new Intl.DateTimeFormat("hu-HU", { timeZone: "Europe/Budapest", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/** Egy blogcikk megírása + Luca-korrektúra + Unas publikálás (élesben). */
export async function runBlogPublish(opts?: { force?: boolean }): Promise<{ ok: boolean; reason?: string; record?: BlogRecord }> {
  const sb = supabaseAdmin();
  const { data: cfg } = await sb.from("agent_config").select("agent_enabled").eq("id", 1).maybeSingle();
  if (cfg && !cfg.agent_enabled) return { ok: false, reason: "Az Agent ki van kapcsolva (vész-leállító)." };

  const existing = await getBlogPosts();
  const usedTitles = new Set(existing.map((r) => r.title));
  const usedSlugs = new Set(existing.map((r) => r.slug));
  // Heti egy: ha force nélkül ma már volt cikk, kihagyjuk.
  if (!opts?.force && existing[0]?.date === todayHu()) {
    return { ok: false, reason: "Ma már jelent meg blogcikk — kihagyva." };
  }
  const topic = TOPICS.find((t) => !usedTitles.has(t)) || (opts?.force ? TOPICS[existing.length % TOPICS.length] : undefined);
  if (!topic) return { ok: false, reason: "Minden téma ki lett adva." };

  await setAgentStatus("judit", "working", `Blogcikk írása: ${topic.slice(0, 40)}…`);
  const w = await juditWriteBlog(topic);
  if (!w) {
    await setAgentStatus("judit", "error", "A blogcikk most nem készült el.");
    return { ok: false, reason: "Judit most nem tudott blogcikket írni." };
  }

  // LUCA KORREKTÚRA — helyesírás + ékezetek a kimeno tartalmon.
  await setAgentStatus("judit", "working", "Luca ellenőrzi a helyesírást és az ékezeteket…");
  const title = await lucaProofreadHungarian(w.title);
  const lead = await lucaProofreadHungarian(w.lead);
  const bodyHtml = await lucaProofreadHungarian(w.bodyHtml);
  const metaDescription = await lucaProofreadHungarian(w.metaDescription);
  const metaTitle = `${title} | Vitech Comp`.slice(0, 65);

  // Egyedi slug (ne ütközzön korábbival).
  let slug = w.slug;
  if (usedSlugs.has(slug)) slug = `${slug}-${existing.length + 1}`;

  await setAgentStatus("judit", "working", "Publikálás a webshop blogjára…");
  const token = await unasLogin();
  const res = await unasCreateBlogPost(token, {
    title,
    sefUrl: slug,
    lead,
    bodyHtml,
    metaTitle,
    metaDescription,
    metaKeywords: "",
    authorName: "Vitech Comp",
  });
  if (!res.ok) {
    await setAgentStatus("judit", "error", "Az Unas publikálás nem sikerült.");
    return { ok: false, reason: res.message };
  }

  const url = `https://vitechcompkft.hu/${slug}`;
  const record: BlogRecord = { date: todayHu(), title, slug, url, id: res.id };
  const next = [record, ...existing].slice(0, 30);
  await sb.from("app_state").upsert({ key: "blog_posts", value: JSON.stringify(next), updated_at: new Date().toISOString() }).then(() => {}, () => {});

  await setAgentStatus("judit", "done", `Blogcikk élesben: ${title.slice(0, 38)}`);
  await sendTelegram(`📰 *Judit — új blogcikk a webshopon* (élesben)\n\n${title}\n${url}`).catch(() => {});
  return { ok: true, record };
}
