import { supabaseAdmin } from "./supabase";
import { unasLogin, unasCreateBlogPost } from "./unas";
import { juditWriteBlog, lucaProofreadHungarian } from "./claude";
import { sendTelegram } from "./telegram";

/**
 * Automata webshop-blog — KÉTLÉPCSOS (Vercel 60s limit miatt):
 *  - runBlogWrite(): Judit megírja a cikket → 'blog_draft' app_state (gyors-ish).
 *  - runBlogPublishDraft(): Luca PÁRHUZAMOS ékezet-/helyesírás-korrektúra → Unas setPageContent (blog) ÉLESBEN.
 * A két fázis KÜLÖN HTTP-invokáció, mindegyiknek saját 60s budget-je. Heti 1 cikk (monitor cron, hétfo).
 */

/** A „Blog" menüpont (oldal) azonosítója — ide kerülnek a blog-cikkek. (URL: /spg/367234/Blog) */
const BLOG_PAGE_ID = process.env.BLOG_PAGE_ID || "367234";

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

interface BlogDraft {
  topic: string;
  title: string;
  slug: string;
  metaDescription: string;
  lead: string;
  bodyHtml: string;
}

async function setJuditStatus(status: string, note: string): Promise<void> {
  try {
    const sb = supabaseAdmin();
    await sb.from("agent_status").upsert({ key: "judit", status, status_note: note, status_at: new Date().toISOString() }, { onConflict: "key" });
  } catch {
    /* a státusz nem kritikus */
  }
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

/** 1. FÁZIS — Judit megírja a cikket, és 'blog_draft'-ként eltárolja. */
export async function runBlogWrite(opts?: { force?: boolean }): Promise<{ ok: boolean; reason?: string; draftReady?: boolean; topic?: string }> {
  const sb = supabaseAdmin();
  const { data: cfg } = await sb.from("agent_config").select("agent_enabled").eq("id", 1).maybeSingle();
  if (cfg && !cfg.agent_enabled) return { ok: false, reason: "Az Agent ki van kapcsolva (vész-leállító)." };

  const existing = await getBlogPosts();
  if (!opts?.force && existing[0]?.date === todayHu()) return { ok: false, reason: "Ma már jelent meg blogcikk — kihagyva." };

  const usedTitles = new Set(existing.map((r) => r.title));
  const usedSlugs = new Set(existing.map((r) => r.slug));
  const topic = TOPICS.find((t) => !usedTitles.has(t)) || (opts?.force ? TOPICS[existing.length % TOPICS.length] : undefined);
  if (!topic) return { ok: false, reason: "Minden téma ki lett adva." };

  await setJuditStatus("working", `Blogcikk írása: ${topic.slice(0, 40)}…`);
  const w = await juditWriteBlog(topic);
  if (!w) {
    await setJuditStatus("error", "A blogcikk most nem készült el.");
    return { ok: false, reason: "Judit most nem tudott blogcikket írni." };
  }
  let slug = w.slug;
  if (usedSlugs.has(slug)) slug = `${slug}-${existing.length + 1}`;

  const draft: BlogDraft = { topic, title: w.title, slug, metaDescription: w.metaDescription, lead: w.lead, bodyHtml: w.bodyHtml };
  await sb.from("app_state").upsert({ key: "blog_draft", value: JSON.stringify(draft), updated_at: new Date().toISOString() });
  await setJuditStatus("working", "Luca ellenőrzi a szöveget, utána publikálás…");
  return { ok: true, draftReady: true, topic };
}

/** 2. FÁZIS — Luca PÁRHUZAMOS korrektúrája + Unas publikálás (élesben). */
export async function runBlogPublishDraft(): Promise<{ ok: boolean; reason?: string; record?: BlogRecord }> {
  const sb = supabaseAdmin();
  const { data } = await sb.from("app_state").select("value").eq("key", "blog_draft").maybeSingle();
  if (!data?.value) return { ok: false, reason: "Nincs publikálandó blog-piszkozat." };
  const d = JSON.parse(data.value) as BlogDraft;

  // LUCA KORREKTÚRA — párhuzamosan (hogy beférjen 60s-be).
  const [title, lead, bodyHtml, metaDescription] = await Promise.all([
    lucaProofreadHungarian(d.title),
    lucaProofreadHungarian(d.lead),
    lucaProofreadHungarian(d.bodyHtml),
    lucaProofreadHungarian(d.metaDescription),
  ]);
  const metaTitle = `${title} | Vitech Comp`.slice(0, 65);

  const token = await unasLogin();
  const res = await unasCreateBlogPost(token, {
    title,
    sefUrl: d.slug,
    lead,
    bodyHtml,
    metaTitle,
    metaDescription,
    metaKeywords: "",
    authorName: "Vitech Comp",
    pageId: BLOG_PAGE_ID,
  });
  if (!res.ok) {
    await setJuditStatus("error", "Az Unas publikálás nem sikerült.");
    return { ok: false, reason: res.message };
  }

  const existing = await getBlogPosts();
  const url = `https://vitechcompkft.hu/${d.slug}`;
  const record: BlogRecord = { date: todayHu(), title, slug: d.slug, url, id: res.id };
  await sb.from("app_state").upsert({ key: "blog_posts", value: JSON.stringify([record, ...existing].slice(0, 30)), updated_at: new Date().toISOString() });
  await sb.from("app_state").delete().eq("key", "blog_draft"); // piszkozat törlése
  await setJuditStatus("done", `Blogcikk élesben: ${title.slice(0, 38)}`);
  await sendTelegram(`📰 *Judit — új blogcikk a webshopon* (élesben)\n\n${title}\n${url}`).catch(() => {});
  return { ok: true, record };
}
