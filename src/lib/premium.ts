import { supabaseAdmin } from "./supabase";
import { postPhotoToFacebook } from "./facebook";

/**
 * PRÉMIUM (kézzel gyártott) lifestyle-plakátok jóváhagyási tárolója.
 * A tulajdonos a dashboardon (/plakatok) JÓVÁHAGYJA vagy ELVETI oket; a napi poszt csak JÓVÁHAGYOTTAT tesz ki.
 * app_state „premium_posters" (JSON tömb).
 */

const KEY = "premium_posters";

export type PremiumStatus = "pending" | "approved" | "posted" | "rejected";

export interface PremiumPoster {
  id: string;
  url: string; // a KÉSZ, rámárkázott plakát URL-je
  headline: string;
  sub?: string;
  caption?: string;
  productUrl?: string; // a poszthoz a link (alapból a webshop)
  status: PremiumStatus;
  createdAt: string;
  postedAt?: string;
  fbUrl?: string;
}

async function load(): Promise<PremiumPoster[]> {
  try {
    const { data } = await supabaseAdmin().from("app_state").select("value").eq("key", KEY).maybeSingle();
    if (data?.value) {
      const j = JSON.parse(data.value);
      if (Array.isArray(j)) return j;
      if (Array.isArray(j.items)) return j.items;
    }
  } catch {
    /* elso futás */
  }
  return [];
}
async function save(items: PremiumPoster[]): Promise<void> {
  await supabaseAdmin().from("app_state").upsert({ key: KEY, value: JSON.stringify(items.slice(0, 80)), updated_at: new Date().toISOString() });
}

/** Új rámárkázott plakát felvétele JÓVÁHAGYÁSRA (pending). */
export async function addPremiumPoster(p: { url: string; headline: string; sub?: string; caption?: string; productUrl?: string }): Promise<PremiumPoster> {
  const items = await load();
  const item: PremiumPoster = {
    id: "pp_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    url: p.url,
    headline: p.headline,
    sub: p.sub,
    caption: p.caption,
    productUrl: p.productUrl || "https://vitechcompkft.hu",
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  items.unshift(item);
  await save(items);
  return item;
}

export async function listPremiumPosters(): Promise<PremiumPoster[]> {
  return load();
}

/** Állapotváltás (approve / reject). */
export async function setPremiumStatus(id: string, status: PremiumStatus): Promise<{ ok: boolean }> {
  const items = await load();
  const it = items.find((x) => x.id === id);
  if (!it) return { ok: false };
  it.status = status;
  await save(items);
  return { ok: true };
}

/** Egy JÓVÁHAGYOTT, még ki nem posztolt plakát (a napi forgatáshoz) — a legrégebbi jóváhagyott. */
export async function pickApprovedPremium(): Promise<PremiumPoster | null> {
  const items = await load();
  const approved = items.filter((x) => x.status === "approved");
  if (!approved.length) return null;
  approved.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || "")); // legrégebbi elobb
  return approved[0];
}

/** Egy plakát kiposztolása a Facebookra (a caption + a link a plakáthoz tartozik). */
export async function publishPremiumPoster(id: string): Promise<{ ok: boolean; fbUrl?: string; error?: string }> {
  const items = await load();
  const it = items.find((x) => x.id === id);
  if (!it) return { ok: false, error: "nincs ilyen plakát" };
  const link = it.productUrl || "https://vitechcompkft.hu";
  const caption = `${(it.caption && it.caption.trim()) || it.headline}\n\n👉 ${link}\n\n#Vitech #felújítottlaptop #használtlaptop #laptop #IT`;
  const fb = await postPhotoToFacebook(caption, it.url);
  if (fb.ok) {
    it.status = "posted";
    it.postedAt = new Date().toISOString();
    it.fbUrl = fb.url;
    await save(items);
  }
  return { ok: fb.ok, fbUrl: fb.url, error: fb.error };
}
