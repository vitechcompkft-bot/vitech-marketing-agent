import { supabaseAdmin } from "./supabase";
import { unasLogin, unasGetProducts } from "./unas";
import { lifestyleCompose } from "./claude";
import { generateLifestyleImage } from "./falai";
import { renderLifestylePosterPng } from "./poster";
import { publishKlariPoster } from "./facebook";
import { setAgentStatus } from "./team";
import { sendTelegram } from "./telegram";

const STATE_KEY = "lifestyle_state";

type Style = { key: string; label: string; prompt: string };

/** Rotálódó lifestyle-hangulatok (nyár + foci-nyár). Egymás után NEM ismétlodnek. */
const STYLES: Style[] = [
  { key: "beach", label: "tengerparti nyaralás", prompt: "a happy person in stylish white summer clothes and sunglasses on a beautiful tropical beach, holding an open modern silver business laptop, turquoise sea, palm trees and sun loungers, bright sunny day" },
  { key: "yacht", label: "luxusjacht a tengeren", prompt: "a relaxed person in a light linen shirt on the deck of a luxury white yacht, an open modern silver business laptop on the table in front, turquoise Mediterranean sea and coastline, bright sunlight" },
  { key: "pool", label: "medencés luxusnyaraló", prompt: "an open modern silver business laptop on a lounge table beside a luxury infinity pool, turquoise water, sun loungers and palm trees, bright summer day, aspirational vacation vibe" },
  { key: "terrace", label: "nyári teraszos home-office", prompt: "an open modern silver business laptop and a cup of coffee on a stylish sunny outdoor terrace table, lush green garden and warm summer sunlight, relaxed premium remote-work vibe" },
  { key: "cafe", label: "napsütötte kávézó, digitális nomád", prompt: "a person working on an open modern business laptop at a sunny stylish outdoor cafe table, warm softly blurred street background, coffee cup, cheerful summer city vibe" },
  { key: "rooftop", label: "city rooftop naplementében", prompt: "an open modern business laptop on a modern rooftop bar table at golden-hour sunset, warm glowing city skyline in the background, premium summer evening lifestyle vibe" },
  { key: "football", label: "foci-nyár, stadion hangulat", prompt: "a sleek modern dark business laptop on a clean table with a classic black-and-white soccer ball beside it, a softly blurred green football stadium pitch and glowing floodlights in the background, evening golden light, energetic football summer atmosphere, NO logos, NO trophies, NO team names, NO flags" },
  { key: "garden", label: "kerti napsütés", prompt: "a person relaxing in a sunny green garden with an open modern business laptop on a wooden table, blooming flowers and warm summer daylight, cheerful lifestyle vibe" },
];

/** Fotorealisztikus, felirat nélküli jelenet — felül üres hely a focímnek. */
const wrap = (p: string) =>
  `Ultra-photorealistic advertising photograph, shot on a full-frame camera, premium commercial lifestyle photography, true to life, natural colors, sharp focus: ${p}. The laptop screen shows a vibrant colorful abstract wallpaper. Leave clean, calm empty space in the UPPER part of the image for a headline. Absolutely NO text, NO letters, NO numbers, NO logos, NO watermarks, NO brand names anywhere.`;

async function loadState(): Promise<{ styles: string[]; headlines: string[] }> {
  try {
    const { data } = await supabaseAdmin().from("app_state").select("value").eq("key", STATE_KEY).single();
    if (data?.value) {
      const j = JSON.parse(data.value);
      return { styles: Array.isArray(j.styles) ? j.styles : [], headlines: Array.isArray(j.headlines) ? j.headlines : [] };
    }
  } catch {
    /* elso futás */
  }
  return { styles: [], headlines: [] };
}

async function saveState(s: { styles: string[]; headlines: string[] }) {
  try {
    await supabaseAdmin()
      .from("app_state")
      .upsert({ key: STATE_KEY, value: JSON.stringify(s), updated_at: new Date().toISOString() });
  } catch {
    /* nem kritikus */
  }
}

/** Olyan stílust választ, ami az utolsó 4-ben NEM szerepelt (így nem ismétlodik). */
function pickStyle(recent: string[]): Style {
  const last = recent.slice(-4);
  const fresh = STYLES.filter((s) => !last.includes(s.key));
  const pool = fresh.length ? fresh : STYLES;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Napi lifestyle-plakát: valódi Vitech-termék + rotálódó nyári/foci hangulat → fotorealisztikus jelenet
 * → tiszta plakát (focím + logó + vitechcompkft.hu) → Facebook-poszt (a caption tartalmazza a termék linkjét).
 */
export async function runLifestyleDaily(): Promise<{ ok: boolean; fbUrl?: string; error?: string }> {
  await setAgentStatus("klari", "working", "Napi lifestyle-plakát készítése…");
  try {
    const token = await unasLogin();
    const dayIdx = Math.floor(Date.now() / 86_400_000);
    const limitStart = (dayIdx * 17) % 200;
    const products = await unasGetProducts(token, { limitNum: 60, limitStart });
    const live = products.filter((p) => p.priceGross && p.name && p.url);
    if (!live.length) throw new Error("nincs élo termék az Unasban");
    const product = live[Math.floor(Math.random() * live.length)];
    const price = Number(String(product.priceGross).replace(/[^\d]/g, "")) || null;

    const state = await loadState();
    const style = pickStyle(state.styles);

    const compose =
      (await lifestyleCompose({ name: product.name, priceGross: product.priceGross }, style.label, state.headlines.slice(-6))) || {
        headline: "Nyári laptop-akció",
        sub: "Felújított, bevizsgált üzleti laptopok garanciával.",
        caption: "Idén nyáron dolgozz vagy pihenj a legjobb géppel! 💻☀️ Nézd meg a kínálatunkat a vitechcompkft.hu-n!",
      };

    const bg = await generateLifestyleImage(wrap(style.prompt));
    if (!bg) throw new Error("kép-generálás sikertelen (fal.ai)");

    const poster = await renderLifestylePosterPng({ bgUrl: bg, headline: compose.headline, sub: compose.sub });
    if (!poster) throw new Error("poszter-render sikertelen (hcti)");

    const fb = await publishKlariPoster({
      headline: compose.headline,
      caption: compose.caption,
      priceHuf: price,
      productName: product.name,
      productUrl: product.url,
      imageUrl: poster,
    });

    // Ismétlés-kerülés: az utolsó stílusok + focímek elmentése.
    state.styles = [...state.styles, style.key].slice(-8);
    state.headlines = [...state.headlines, compose.headline].slice(-10);
    await saveState(state);

    // Napló a dashboardnak.
    try {
      await supabaseAdmin()
        .from("app_state")
        .upsert({
          key: "lifestyle_last",
          value: JSON.stringify({
            style: style.label,
            headline: compose.headline,
            product: product.name,
            productUrl: product.url,
            poster,
            fbUrl: fb.url || null,
            ok: fb.ok,
            asOf: new Date().toISOString(),
          }),
          updated_at: new Date().toISOString(),
        });
    } catch {
      /* nem kritikus */
    }

    if (fb.ok) {
      await setAgentStatus("klari", "done", `Lifestyle-plakát kint: ${style.label} · ${compose.headline}`);
      await sendTelegram(
        `🌴 *Napi lifestyle-plakát kint a Facebookon*\n\n🎨 Stílus: ${style.label}\n📰 ${compose.headline}\n💻 ${product.name}${fb.url ? `\n🔗 ${fb.url}` : ""}`
      ).catch(() => {});
    } else {
      await setAgentStatus("klari", "error", `Lifestyle FB-hiba: ${fb.error || "?"}`);
      await sendTelegram(`⚠️ A lifestyle-plakát elkészült, de a Facebook-poszt nem ment ki: ${fb.error || "?"}`).catch(() => {});
    }
    return { ok: fb.ok, fbUrl: fb.url, error: fb.error };
  } catch (e: any) {
    const msg = String(e?.message || e);
    await setAgentStatus("klari", "error", `Lifestyle-plakát hiba: ${msg}`);
    await sendTelegram(`❌ Napi lifestyle-plakát hiba: ${msg}`).catch(() => {});
    return { ok: false, error: msg };
  }
}
