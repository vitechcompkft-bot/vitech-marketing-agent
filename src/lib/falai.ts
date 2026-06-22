import { supabaseAdmin } from "./supabase";
import { ensureBucket } from "./sceneBg";

const BUCKET = "poster-bg";

/** STÚDIÓ-háttér prompt (NEM szoba/asztal — sima gradiens stúdió, hogy a rátett termék NE lebegjen). */
export function buildScenePrompt(): string {
  return [
    "Premium product photography STUDIO backdrop, abstract and minimal.",
    "Smooth deep navy blue to bright blue gradient, soft top lighting, gentle bokeh light spots, and a faint subtle reflective dark surface along the bottom (a studio floor).",
    "High-end, clean, lots of empty negative space.",
    "IMPORTANT: this is only a smooth studio BACKDROP — NO room, NO window, NO desk, NO furniture, NO laptop, NO devices, NO objects, NO text, NO letters, NO numbers, NO logos, NO people.",
    "Sharp, professional studio background.",
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
