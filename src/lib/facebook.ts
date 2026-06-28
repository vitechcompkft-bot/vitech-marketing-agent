/**
 * Facebook-oldal poszt-kliens — a Vitech Comp Kft. FB-oldalára (Graph API).
 * Klári napi, Luca által jóváhagyott plakátja automatikusan kimegy ide is (fotó-poszt).
 *
 * Env:
 *  - FB_PAGE_ID    — a Vitech FB-oldal azonosítója
 *  - FB_PAGE_TOKEN — hosszú életu / System User Page Access Token (pages_manage_posts, pages_read_engagement)
 *  - FB_AUTOPOST   — "0" => kikapcsolja az automata posztolást (vész-kapcsoló), alapból BE
 *
 * A token NEM kerül a kódba/chatbe — kizárólag Vercel env-ben él.
 */
const GRAPH = "https://graph.facebook.com/v21.0";

export function facebookConfigured(): boolean {
  return !!(process.env.FB_PAGE_ID && process.env.FB_PAGE_TOKEN);
}

/** Auto-poszt KI/BE: alapból BE, ha be van állítva; FB_AUTOPOST=0 kapcsolja ki. */
export function facebookAutopostEnabled(): boolean {
  return process.env.FB_AUTOPOST !== "0";
}

/** Fotó-poszt a FB-oldalra: a kép URL-jét a Graph tölti be, a caption a szöveg. */
export async function postPhotoToFacebook(
  caption: string,
  imageUrl: string
): Promise<{ ok: boolean; id?: string; url?: string; error?: string }> {
  const pageId = process.env.FB_PAGE_ID;
  const token = process.env.FB_PAGE_TOKEN;
  if (!pageId || !token) return { ok: false, error: "A Facebook-oldal nincs összekötve (FB_PAGE_ID/FB_PAGE_TOKEN hiányzik)." };
  try {
    const body = new URLSearchParams({ url: imageUrl, caption: caption.slice(0, 5000), access_token: token });
    const res = await fetch(`${GRAPH}/${pageId}/photos`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(20000),
    });
    const j: any = await res.json().catch(() => ({}));
    if (!res.ok || j.error) return { ok: false, error: `FB ${res.status}: ${JSON.stringify(j.error || j).slice(0, 220)}` };
    const postId = j.post_id || j.id;
    const url = postId ? `https://www.facebook.com/${postId}` : undefined;
    return { ok: true, id: postId, url };
  } catch (e: any) {
    return { ok: false, error: e?.message || "ismeretlen hiba" };
  }
}

/** A plakáthoz tartozó FB-caption összeállítása (marketing-szöveg + ár + link + hashtagek). */
function buildCaption(p: {
  headline?: string;
  caption?: string | null;
  priceHuf?: number | null;
  productName: string;
  productUrl?: string | null;
}): string {
  const price = p.priceHuf ? new Intl.NumberFormat("hu-HU").format(Math.round(p.priceHuf)) + " Ft" : "";
  const main = (p.caption && p.caption.trim()) || p.headline || p.productName;
  const link = p.productUrl || "https://vitechcompkft.hu";
  const parts = [main];
  if (price) parts.push(`💰 ${price}`);
  parts.push(`👉 ${link}`);
  parts.push("#Vitech #felújítottlaptop #használtlaptop #laptop #IT #informatika");
  return parts.filter(Boolean).join("\n\n");
}

/** Klári kész plakátjának (publikus kép URL) kiposztolása a FB-oldalra a megfelelo caption-nel. */
export async function publishKlariPoster(p: {
  headline?: string;
  caption?: string | null;
  priceHuf?: number | null;
  productName: string;
  productUrl?: string | null;
  imageUrl: string;
}): Promise<{ ok: boolean; url?: string; error?: string }> {
  const caption = buildCaption(p);
  return postPhotoToFacebook(caption, p.imageUrl);
}

export interface FacebookStatus {
  configured: boolean;
  connected: boolean;
  pageName?: string;
  error?: string;
}

/** Könnyu állapot a dashboardhoz: érvényes-e a token, mi az oldal neve. */
export async function getFacebookStatus(): Promise<FacebookStatus> {
  if (!facebookConfigured()) return { configured: false, connected: false };
  try {
    const pageId = process.env.FB_PAGE_ID;
    const token = process.env.FB_PAGE_TOKEN;
    const res = await fetch(`${GRAPH}/${pageId}?fields=name&access_token=${token}`, { signal: AbortSignal.timeout(5000) });
    const j: any = await res.json().catch(() => ({}));
    if (!res.ok || j.error) return { configured: true, connected: false, error: JSON.stringify(j.error || {}).slice(0, 160) };
    return { configured: true, connected: true, pageName: j.name };
  } catch (e: any) {
    return { configured: true, connected: false, error: e?.message };
  }
}
