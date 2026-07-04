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

  const img = new ImageResponse(root, { width: 1200, height: 675, fonts });
  const buf = Buffer.from(await img.arrayBuffer());

  try {
    await ensureBucket();
    const sb = supabaseAdmin();
    const path = `poster-${Date.now()}.png`;
    const up = await sb.storage.from(BUCKET).upload(path, buf, { contentType: "image/png", upsert: true });
    if (!up.error) {
      const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
      if (data?.publicUrl) return data.publicUrl;
    }
  } catch {
    /* feltöltési hiba → null */
  }
  return null;
}
