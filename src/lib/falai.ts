import { supabaseAdmin } from "./supabase";
import { ensureBucket } from "./sceneBg";

const BUCKET = "poster-bg";

/** HÁTTÉR-jelenet prompt (ÜRES asztal — a VALÓDI terméket + logót + szöveget a sablon teszi rá). */
export function buildScenePrompt(): string {
  return [
    "Premium modern office advertising background, photorealistic.",
    "A clean empty desk surface in the foreground, soft natural daylight from a large window, a subtle plant and blurred bokeh in the background, shallow depth of field.",
    "The RIGHT side has clean empty desk space (a product will be placed there); the LEFT side is cleaner/softly darker for text.",
    "Deep navy blue and bright blue tones with white accents, high-end corporate mood, lots of clean negative space.",
    "IMPORTANT: NO laptop, NO computer, NO devices, NO text, NO letters, NO numbers, NO logos, NO watermarks, NO people. Just an empty premium office scene.",
    "Sharp, realistic, advertising quality.",
  ].join(" ");
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
