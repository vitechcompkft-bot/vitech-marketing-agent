import { supabaseAdmin } from "./supabase";
import { ensureBucket } from "./sceneBg";

const BUCKET = "poster-bg";

/**
 * IRODA-háttér prompt: elmosott (bokeh) prémium iroda + tiszta, FÉNYES ELOTÉR-FELÜLET,
 * amire a terméket tesszük (tükrözodéssel) — így nem lebeg.
 */
export function buildScenePrompt(): string {
  return [
    "Premium modern office interior, clearly RECOGNIZABLE: a bright window with daylight and a city/office view, desks, subtle plants, modern furniture, navy and blue tones.",
    "Use only a MODERATE, gentle depth of field — the background is softly atmospheric but still CLEARLY READABLE as an office (NOT heavily blurred, NOT abstract bokeh).",
    "In the FOREGROUND there is a clean, empty, slightly glossy/reflective dark desk or counter surface with empty space — a product will be placed on it later.",
    "High-end advertising photography, balanced and uncluttered.",
    "IMPORTANT: NO laptop, NO computer, NO devices, NO objects on the front surface, NO people, NO text, NO letters, NO numbers, NO logos, NO watermarks.",
  ].join(" ");
}

/** Letölti a fal-képet és tartós URL-re re-hostolja (Supabase Storage). Hiba esetén az eredeti URL. */
async function rehost(url: string, prefix: string): Promise<string> {
  try {
    const img = await fetch(url);
    if (img.ok) {
      const buf = Buffer.from(await img.arrayBuffer());
      await ensureBucket();
      const sb = supabaseAdmin();
      const path = `${prefix}-${Date.now()}.png`;
      const up = await sb.storage.from(BUCKET).upload(path, buf, { contentType: "image/png", upsert: true });
      if (!up.error) {
        const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
        if (data?.publicUrl) return data.publicUrl;
      }
    }
  } catch {
    /* marad az eredeti URL */
  }
  return url;
}

/**
 * VALÓDI termék jelenetbe helyezése (fal.ai / Bria product-shot): a megadott termékfotót
 * (image_url) egy iroda-jelenetbe teszi az ASZTALRA, helyes perspektívával/árnyékkal — NEM lebeg.
 * A kész jelenet (a logót + szöveget már a sablon teszi rá). FAL_KEY hiányában null.
 */
export async function generateProductScene(
  productImageUrl: string,
  opts?: { scene?: string; placement?: string; shotSize?: [number, number] }
): Promise<string | null> {
  const key = process.env.FAL_KEY;
  if (!key || !productImageUrl) return null;
  // A Bria csak sima angol szöveget fogad (különleges karakterek nélkül) → a pontosvesszot/idézojelet kiszurjük.
  const scene = (
    opts?.scene ??
    "a modern bright corporate office, the laptop standing on a glossy dark desk on the RIGHT side, large window with a city skyline, soft natural daylight, a subtle plant, realistic contact shadow and reflection under the laptop, the LEFT side is calm empty office space, premium advertising photography, navy and blue tones"
  )
    .replace(/[;:"]/g, ",")
    .replace(/\s+/g, " ")
    .trim();
  try {
    const res = await fetch("https://fal.run/fal-ai/bria/product-shot", {
      method: "POST",
      headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url: productImageUrl,
        scene_description: scene,
        placement_type: "manual_placement",
        manual_placement_selection: opts?.placement ?? "right_center",
        shot_size: opts?.shotSize ?? [1200, 800],
        fast: true,
        optimize_description: true,
        num_results: 1,
      }),
    });
    const j = await res.json();
    const url = j?.images?.[0]?.url || j?.result?.images?.[0]?.url || j?.image?.url;
    if (!url) return null;
    return await rehost(url, "scene");
  } catch {
    return null;
  }
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

/**
 * LIFESTYLE jelenet (text-to-image, fal.ai Recraft V4, VALÓSÁGHU/realistic) → tartós URL (re-host).
 * Természetes színek (nincs márka-szín kényszer), 16:9. A logót + feliratot a lifestyle-sablon teszi rá.
 */
export async function generateLifestyleImage(prompt: string): Promise<string | null> {
  const key = process.env.FAL_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://fal.run/fal-ai/recraft/v4/text-to-image", {
      method: "POST",
      headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, image_size: "landscape_16_9" }),
    });
    const j = await res.json();
    const url = j?.images?.[0]?.url;
    if (!url) return null;
    return await rehost(url, "lifestyle");
  } catch {
    return null;
  }
}
