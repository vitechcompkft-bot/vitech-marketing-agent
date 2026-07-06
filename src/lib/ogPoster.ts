import React from "react";
import { ImageResponse } from "next/og";
import { supabaseAdmin } from "./supabase";
import { ensureBucket } from "./sceneBg";

/**
 * SAJÁT, kvóta nélküli lifestyle-plakát renderelo (next/og — Satori + resvg, a szerveren fut).
 * Nincs külso render-szolgáltatás és nincs havi keret. A magyar ékezetekhez a Montserrat betut a Google
 * Fonts `text=` végpontjáról töltjük (TrueType, a szükséges karakterekkel garantáltan), és gyorsítótárazzuk.
 * A kész PNG-t a Supabase Storage "poster-bg" bucketbe töltjük, és a publikus URL-t adjuk vissza.
 */

const BUCKET = "poster-bg";
const LOGO_URL = "https://vitech-marketing-agent.vercel.app/avatars/vitech-logo.png";
const h = React.createElement;

// Teljes magyar ábécé + ASCII + számok + írásjelek (emoji NEM kell a plakátra, csak a FB-caption-be).
const FONT_CHARS =
  "AÁBCDEÉFGHIÍJKLMNOÓÖŐPQRSTUÚÜŰVWXYZaábcdeéfghiíjklmnoóöőpqrstuúüűvwxyz0123456789 .,!?–—-:;'\"%()+/&…€";

const fontCache = new Map<number, ArrayBuffer>();
async function loadMontserrat(weight: number): Promise<ArrayBuffer | null> {
  if (fontCache.has(weight)) return fontCache.get(weight)!;
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=Montserrat:wght@${weight}&text=${encodeURIComponent(FONT_CHARS)}`;
    const css = await fetch(cssUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1)" }, // régi UA → TrueType (Satori azt tudja)
      signal: AbortSignal.timeout(10000),
    }).then((r) => r.text());
    const url = css.match(/src:\s*url\(([^)]+)\)\s*format\('truetype'\)/)?.[1] || css.match(/url\((https:[^)]+\.ttf[^)]*)\)/)?.[1];
    if (!url) return null;
    const buf = await fetch(url, { signal: AbortSignal.timeout(10000) }).then((r) => r.arrayBuffer());
    fontCache.set(weight, buf);
    return buf;
  } catch {
    return null;
  }
}

/** Emoji/ismeretlen jelek eltávolítása a plakát-szövegbol (a betukészletben nincsenek). */
function clean(s: string): string {
  return (s || "").replace(/[^\p{L}\p{N}\p{P}\p{Z}€]/gu, "").replace(/\s+/g, " ").trim();
}

export async function renderLifestylePosterOG(o: { bgUrl: string; headline: string; sub?: string }): Promise<string | null> {
  if (!o.bgUrl) return null;
  const [w600, w800, w900] = await Promise.all([loadMontserrat(600), loadMontserrat(800), loadMontserrat(900)]);
  if (!w900) return null; // legalább a focím-súly kell
  const fonts: any[] = [];
  if (w600) fonts.push({ name: "Montserrat", data: w600, weight: 600, style: "normal" });
  if (w800) fonts.push({ name: "Montserrat", data: w800, weight: 800, style: "normal" });
  fonts.push({ name: "Montserrat", data: w900, weight: 900, style: "normal" });

  const headline = clean(o.headline);
  const sub = o.sub ? clean(o.sub) : "";

  const bg = h("img", {
    src: o.bgUrl,
    width: 1200,
    height: 675,
    style: { position: "absolute", top: 0, left: 0, width: 1200, height: 675, objectFit: "cover" },
  });
  const gTop = h("div", {
    style: { position: "absolute", top: 0, left: 0, width: 1200, height: 340, display: "flex", backgroundImage: "linear-gradient(180deg, rgba(6,15,35,0.55), rgba(6,15,35,0))" },
  });
  const gBot = h("div", {
    style: { position: "absolute", bottom: 0, left: 0, width: 1200, height: 300, display: "flex", backgroundImage: "linear-gradient(0deg, rgba(6,15,35,0.68), rgba(6,15,35,0))" },
  });
  const head = h(
    "div",
    { style: { position: "absolute", top: 34, left: 52, width: 800, display: "flex", color: "#fff", fontSize: 62, fontWeight: 900, lineHeight: 1.03, letterSpacing: -0.5, textShadow: "0 3px 16px rgba(0,0,0,0.55)" } },
    headline
  );
  const subEl = sub
    ? h(
        "div",
        { style: { position: "absolute", bottom: 104, left: 52, width: 1040, display: "flex", color: "#fff", fontSize: 29, fontWeight: 600, textShadow: "0 2px 12px rgba(0,0,0,0.8)" } },
        sub
      )
    : null;
  const chip = h(
    "div",
    { style: { position: "absolute", bottom: 26, left: 52, display: "flex", alignItems: "center" } },
    h("div", { style: { display: "flex", background: "#fff", borderRadius: 14, padding: "8px 14px" } }, h("img", { src: LOGO_URL, height: 40, style: { height: 40 } })),
    h("div", { style: { display: "flex", color: "#fff", fontSize: 26, fontWeight: 800, marginLeft: 14, textShadow: "0 2px 10px rgba(0,0,0,0.85)" } }, "vitechcompkft.hu")
  );
  const root = h(
    "div",
    { style: { width: 1200, height: 675, display: "flex", position: "relative", fontFamily: "Montserrat", overflow: "hidden" } },
    bg,
    gTop,
    gBot,
    head,
    subEl,
    chip
  );

  return toPngUrl(root, fonts);
}

/** ImageResponse → PNG bytes → Supabase Storage feltöltés → publikus URL. */
async function toPngUrl(root: any, fonts: any[]): Promise<string | null> {
  try {
    const img = new ImageResponse(root, { width: 1200, height: 675, fonts });
    const buf = Buffer.from(await img.arrayBuffer());
    await ensureBucket();
    const sb = supabaseAdmin();
    const path = `poster-${Date.now()}.png`;
    const up = await sb.storage.from(BUCKET).upload(path, buf, { contentType: "image/png", upsert: true });
    if (!up.error) {
      const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
      if (data?.publicUrl) return data.publicUrl;
    }
  } catch {
    /* render/feltöltési hiba → null */
  }
  return null;
}

/**
 * KLÁRI „deal" plakát (jelenet a VALÓDI termékkel + focím + ÁR + jelvények + logó + CTA) — next/og,
 * kvóta nélkül. A busy spec-lista helyett tiszta, figyelemfelkelto elrendezés; a részletek a FB-caption-ben.
 */
export async function renderDealPosterOG(o: { bgUrl: string; headline: string; priceHuf?: number; badges?: string[] }): Promise<string | null> {
  if (!o.bgUrl) return null;
  const [w600, w800, w900] = await Promise.all([loadMontserrat(600), loadMontserrat(800), loadMontserrat(900)]);
  if (!w900) return null;
  const fonts: any[] = [];
  if (w600) fonts.push({ name: "Montserrat", data: w600, weight: 600, style: "normal" });
  if (w800) fonts.push({ name: "Montserrat", data: w800, weight: 800, style: "normal" });
  fonts.push({ name: "Montserrat", data: w900, weight: 900, style: "normal" });

  const headline = clean(o.headline);
  const price = o.priceHuf ? new Intl.NumberFormat("hu-HU").format(Math.round(o.priceHuf)) + " Ft" : "";
  const badges = (o.badges || []).map(clean).filter(Boolean).slice(0, 3);

  const bg = h("img", { src: o.bgUrl, width: 1200, height: 675, style: { position: "absolute", top: 0, left: 0, width: 1200, height: 675, objectFit: "cover" } });
  const gTop = h("div", { style: { position: "absolute", top: 0, left: 0, width: 1200, height: 300, display: "flex", backgroundImage: "linear-gradient(180deg, rgba(6,15,35,0.6), rgba(6,15,35,0))" } });
  const gBot = h("div", { style: { position: "absolute", bottom: 0, left: 0, width: 1200, height: 320, display: "flex", backgroundImage: "linear-gradient(0deg, rgba(6,15,35,0.72), rgba(6,15,35,0))" } });
  const head = h(
    "div",
    { style: { position: "absolute", top: 34, left: 52, width: 760, display: "flex", color: "#fff", fontSize: 60, fontWeight: 900, lineHeight: 1.02, letterSpacing: -0.5, textShadow: "0 3px 16px rgba(0,0,0,0.6)" } },
    headline
  );
  const badgeRow = badges.length
    ? h(
        "div",
        { style: { position: "absolute", top: 176, left: 52, display: "flex", alignItems: "center" } },
        ...badges.map((b, i) =>
          h(
            "div",
            {
              key: i,
              style: {
                display: "flex",
                marginRight: 12,
                padding: "7px 16px",
                borderRadius: 999,
                background: "rgba(26,115,232,0.92)",
                color: "#fff",
                fontSize: 20,
                fontWeight: 800,
                letterSpacing: 0.3,
              },
            },
            b
          )
        )
      )
    : null;
  const pricePill = price
    ? h(
        "div",
        { style: { position: "absolute", bottom: 30, right: 52, display: "flex", alignItems: "center", padding: "12px 26px", borderRadius: 18, background: "#1a73e8", color: "#fff", fontSize: 44, fontWeight: 900, boxShadow: "0 6px 22px rgba(0,0,0,0.4)" } },
        price
      )
    : null;
  const chip = h(
    "div",
    { style: { position: "absolute", bottom: 30, left: 52, display: "flex", alignItems: "center" } },
    h("div", { style: { display: "flex", background: "#fff", borderRadius: 14, padding: "8px 14px" } }, h("img", { src: LOGO_URL, height: 40, style: { height: 40 } })),
    h("div", { style: { display: "flex", color: "#fff", fontSize: 26, fontWeight: 800, marginLeft: 14, textShadow: "0 2px 10px rgba(0,0,0,0.85)" } }, "vitechcompkft.hu")
  );
  const root = h(
    "div",
    { style: { width: 1200, height: 675, display: "flex", position: "relative", fontFamily: "Montserrat", overflow: "hidden" } },
    bg,
    gTop,
    gBot,
    head,
    badgeRow,
    pricePill,
    chip
  );
  return toPngUrl(root, fonts);
}

/**
 * LETISZTULT, DESIGNOLT plakát a VALÓDI termékkel (háttér kivágva) — next/og, nincs fotó-jelenet-kompozit.
 * Gradiens háttér (nyári színvilág) + kivágott termék jobb oldalon + focím/alcím/jelvények/ár + logó + CTA.
 * cutoutUrl: átlátszó PNG (remove.bg data URI); ha nincs kivágás → onWhiteCard=true (fehér kártyára tesszük).
 */
export async function renderCleanProductPosterOG(o: {
  cutoutUrl: string;
  onWhiteCard?: boolean;
  headline: string;
  sub?: string;
  priceHuf?: number;
  badges?: string[];
  ribbon?: string;
  from: string;
  to: string;
  accent: string;
}): Promise<string | null> {
  if (!o.cutoutUrl) return null;
  const [w600, w800, w900] = await Promise.all([loadMontserrat(600), loadMontserrat(800), loadMontserrat(900)]);
  if (!w900) return null;
  const fonts: any[] = [];
  if (w600) fonts.push({ name: "Montserrat", data: w600, weight: 600, style: "normal" });
  if (w800) fonts.push({ name: "Montserrat", data: w800, weight: 800, style: "normal" });
  fonts.push({ name: "Montserrat", data: w900, weight: 900, style: "normal" });

  const headline = clean(o.headline);
  const sub = o.sub ? clean(o.sub) : "";
  const price = o.priceHuf ? new Intl.NumberFormat("hu-HU").format(Math.round(o.priceHuf)) + " Ft" : "";
  const badges = (o.badges || []).map(clean).filter(Boolean).slice(0, 3);
  const navy = "#0b1f3f";

  // Háttér: gradiens + lágy „nap" fénykör.
  const bg = h("div", { style: { position: "absolute", top: 0, left: 0, width: 1200, height: 675, display: "flex", backgroundImage: `linear-gradient(135deg, ${o.from}, ${o.to})` } });
  const sun = h("div", { style: { position: "absolute", top: -150, right: -90, width: 460, height: 460, borderRadius: 9999, background: "rgba(255,255,255,0.13)", display: "flex" } });
  const sun2 = h("div", { style: { position: "absolute", bottom: -170, left: -110, width: 380, height: 380, borderRadius: 9999, background: "rgba(255,255,255,0.08)", display: "flex" } });

  // Termék jobb oldalon (kivágva vagy fehér kártyán).
  const productImg = h("img", { src: o.cutoutUrl, style: { width: "100%", height: "100%", objectFit: "contain" } });
  const product = o.onWhiteCard
    ? h("div", { style: { position: "absolute", right: 40, top: 96, width: 560, height: 470, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", borderRadius: 24, padding: 24 } }, productImg)
    : h("div", { style: { position: "absolute", right: 28, top: 70, width: 600, height: 545, display: "flex", alignItems: "center", justifyContent: "center" } }, productImg);

  // Bal oldali szöveg-oszlop.
  const col: any[] = [];
  if (o.ribbon)
    col.push(
      h("div", { style: { display: "flex", alignSelf: "flex-start", background: o.accent, color: navy, fontSize: 18, fontWeight: 900, letterSpacing: 1, padding: "7px 16px", borderRadius: 999, marginBottom: 16 } }, o.ribbon.toUpperCase())
    );
  col.push(h("div", { style: { display: "flex", color: "#fff", fontSize: 56, fontWeight: 900, lineHeight: 1.03, letterSpacing: -0.5, textShadow: "0 3px 16px rgba(0,0,0,0.35)" } }, headline));
  if (sub) col.push(h("div", { style: { display: "flex", color: "rgba(255,255,255,0.94)", fontSize: 24, fontWeight: 600, marginTop: 14, textShadow: "0 2px 10px rgba(0,0,0,0.3)" } }, sub));
  if (badges.length)
    col.push(
      h(
        "div",
        { style: { display: "flex", marginTop: 20 } },
        ...badges.map((b, i) => h("div", { key: i, style: { display: "flex", marginRight: 10, background: "rgba(255,255,255,0.18)", color: "#fff", fontSize: 17, fontWeight: 800, padding: "6px 14px", borderRadius: 999 } }, b))
      )
    );
  const leftCol = h("div", { style: { position: "absolute", left: 56, top: 78, width: 560, display: "flex", flexDirection: "column" } }, ...col);

  // Ár-pill (jobb alul) + logó/CTA (bal alul).
  const pricePill = price
    ? h("div", { style: { position: "absolute", bottom: 30, right: 40, display: "flex", alignItems: "center", padding: "12px 28px", borderRadius: 18, background: "#fff", color: navy, fontSize: 46, fontWeight: 900, boxShadow: "0 6px 22px rgba(0,0,0,0.3)" } }, price)
    : null;
  const chip = h(
    "div",
    { style: { position: "absolute", bottom: 30, left: 56, display: "flex", alignItems: "center" } },
    h("div", { style: { display: "flex", background: "#fff", borderRadius: 14, padding: "8px 14px" } }, h("img", { src: LOGO_URL, height: 40, style: { height: 40 } })),
    h("div", { style: { display: "flex", color: "#fff", fontSize: 26, fontWeight: 800, marginLeft: 14, textShadow: "0 2px 10px rgba(0,0,0,0.4)" } }, "vitechcompkft.hu")
  );

  const root = h(
    "div",
    { style: { width: 1200, height: 675, display: "flex", position: "relative", fontFamily: "Montserrat", overflow: "hidden" } },
    bg,
    sun,
    sun2,
    product,
    leftCol,
    pricePill,
    chip
  );
  return toPngUrl(root, fonts);
}
