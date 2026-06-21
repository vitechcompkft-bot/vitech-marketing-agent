import { supabaseAdmin } from "./supabase";
import { ensureBucket } from "./sceneBg";

const BUCKET = "poster-bg";

/** Hirdetés-prompt összeállítása a termékbol (Recraft V4-hez). */
export function buildAdPrompt(productName: string, headline: string, priceTxt: string): string {
  const kind = /workstation/i.test(productName)
    ? "workstation computer"
    : /\b(pc|asztali|tower|számítógép)\b/i.test(productName)
    ? "desktop PC"
    : "business laptop";
  return [
    `Professional advertising poster for a refurbished ${kind}, premium modern corporate design.`,
    `A sleek ${kind} on a clean desk in a bright modern office with soft daylight and a plant, shallow depth of field.`,
    `Big bold headline text in Hungarian "${headline}", smaller subtext "Bevizsgálva, felújítva, garanciával",`,
    priceTxt ? `a clear price badge "${priceTxt}",` : "",
    `and a clean logo-style wordmark "VITECH COMP" in the top-left corner.`,
    `Deep navy blue and bright blue color scheme, white accents, high-end, sharp, realistic, well composed, lots of clean negative space, advertising quality.`,
    `Correct, flawless Hungarian spelling with accents.`,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Teljes AI-hirdetés generálása (fal.ai / Recraft V4) → tartós URL (Supabase Storage-ba re-hostolva).
 * FAL_KEY hiányában null (a hívó visszaesik a sablonra).
 */
export async function generateAdImage(prompt: string): Promise<string | null> {
  const key = process.env.FAL_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://fal.run/fal-ai/recraft/v4/text-to-image", {
      method: "POST",
      headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        image_size: "landscape_4_3",
        colors: [
          { r: 17, g: 36, b: 63 },
          { r: 26, g: 115, b: 232 },
        ],
      }),
    });
    const j = await res.json();
    const url = j?.images?.[0]?.url;
    if (!url) return null;

    // Re-hostolás tartós URL-ért (a fal URL-ek lejárhatnak).
    try {
      const img = await fetch(url);
      if (img.ok) {
        const buf = Buffer.from(await img.arrayBuffer());
        await ensureBucket();
        const sb = supabaseAdmin();
        const path = `ad-${Date.now()}.webp`;
        const up = await sb.storage.from(BUCKET).upload(path, buf, { contentType: "image/webp", upsert: true });
        if (!up.error) {
          const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
          if (data?.publicUrl) return data.publicUrl;
        }
      }
    } catch {
      /* ha a re-host nem megy, az eredeti URL-t adjuk */
    }
    return url;
  } catch {
    return null;
  }
}
