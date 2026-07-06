import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const GRAPH = "https://graph.facebook.com/v21.0";

/**
 * DIAGNOSZTIKA: miért nem látszik a Facebook-oldal posztja másoknak?
 * Lekérdezi az oldal publikáltság-állapotát + a legutóbbi posztokat/fotókat + azok láthatóságát.
 * Védelem: Bearer <CRON_SECRET>.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  const pageId = process.env.FB_PAGE_ID;
  const token = process.env.FB_PAGE_TOKEN;
  if (!pageId || !token) return NextResponse.json({ ok: false, error: "Nincs FB_PAGE_ID/FB_PAGE_TOKEN." });

  const get = async (path: string) => {
    try {
      const res = await fetch(`${GRAPH}/${path}${path.includes("?") ? "&" : "?"}access_token=${token}`, { signal: AbortSignal.timeout(15000) });
      return await res.json();
    } catch (e: any) {
      return { error: e?.message || "hiba" };
    }
  };

  const out: any = {};
  // 1) Oldal alapadatai + publikáltság
  out.page = await get(`${pageId}?fields=name,is_published,fan_count,followers_count,link,verification_status,is_permanently_closed,category,about,published_posts.limit(0).summary(true)`);
  // 2) Token-adatok: milyen jogosultságok, tényleg PAGE token-e
  out.tokenDebug = await get(`me?fields=id,name`);
  // 3) Legutóbbi feed-posztok (minden, amit az oldal posztolt) + láthatóság
  out.feed = await get(`${pageId}/feed?fields=id,created_time,message,is_published,is_hidden,privacy&limit=6`);
  // 4) Publikált posztok külön
  out.publishedPosts = await get(`${pageId}/published_posts?fields=id,created_time,is_published,is_hidden&limit=6`);
  // 5) Feltöltött fotók
  out.photos = await get(`${pageId}/photos?type=uploaded&fields=id,created_time,name,link,album&limit=6`);

  return NextResponse.json({ ok: true, ...out });
}

export const GET = handle;
export const POST = handle;
