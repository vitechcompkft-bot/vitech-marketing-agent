import { supabaseAdmin } from "./supabase";

/**
 * AI-generált iroda-jelenet hátterek (OpenAI gpt-image-1) → Supabase Storage (publikus) → poster_backgrounds.
 * Készletet generálunk (nem minden plakáthoz újat); Klári véletlenszeruen választ.
 */
const BUCKET = "poster-bg";

const SCENE_PROMPTS = [
  "Professional modern bright office interior, clean wooden desk near a large window with soft daylight, subtle plants, premium minimal tech ambiance, shallow depth of field, no people, no text, no logos, cinematic photography, empty desk space",
  "Elegant dark home office with warm desk lamp glow, bokeh lights, premium tech mood, wooden desk surface in the foreground, no people, no text, no logos, cinematic",
  "Minimalist corporate office, glass wall, neutral tones, soft daylight, clean desk surface, gentle shadows, no people, no text, no logos, professional photo",
  "Cozy creative studio desk by a window, plants, soft morning light, premium feel, blurred background, no people, no text, no logos",
  "Modern tech showroom ambiance, subtle blue accent lighting, sleek desk, depth of field, no people, no text, no logos, cinematic",
];

export async function ensureBucket() {
  const sb = supabaseAdmin();
  try {
    await sb.storage.createBucket(BUCKET, { public: true });
  } catch {
    // már létezik
  }
}

async function genOne(prompt: string): Promise<Buffer | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: "dall-e-3", prompt, size: "1792x1024", quality: "hd", n: 1, response_format: "b64_json" }),
    });
    const j = await res.json();
    const b64 = j?.data?.[0]?.b64_json;
    if (!b64) return null;
    return Buffer.from(b64, "base64");
  } catch {
    return null;
  }
}

/** Néhány iroda-jelenet legenerálása + tárolása (készlet feltöltése). */
export async function generateScenes(n = 5): Promise<{ ok: boolean; created: number; error?: string }> {
  if (!process.env.OPENAI_API_KEY) return { ok: false, created: 0, error: "Hiányzó OPENAI_API_KEY." };
  await ensureBucket();
  const sb = supabaseAdmin();
  let created = 0;
  const count = Math.min(n, SCENE_PROMPTS.length);
  for (let i = 0; i < count; i++) {
    const buf = await genOne(SCENE_PROMPTS[i]);
    if (!buf) continue;
    const path = `scene-${Date.now()}-${i}.png`;
    const up = await sb.storage.from(BUCKET).upload(path, buf, { contentType: "image/png", upsert: true });
    if (up.error) continue;
    const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
    if (data?.publicUrl) {
      await sb.from("poster_backgrounds").insert({ url: data.publicUrl });
      created++;
    }
  }
  return { ok: true, created };
}

/** Véletlen háttér a készletbol (vagy null, ha üres). */
export async function getRandomBackgroundUrl(): Promise<string | null> {
  try {
    const sb = supabaseAdmin();
    const { data } = await sb.from("poster_backgrounds").select("url").limit(50);
    if (!data || !data.length) return null;
    return data[Math.floor(Math.random() * data.length)].url as string;
  } catch {
    return null;
  }
}
