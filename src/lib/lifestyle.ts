import { supabaseAdmin } from "./supabase";
import { unasLogin, unasGetProducts, type UnasProduct } from "./unas";
import { lifestyleCompose, lifestyleReview } from "./claude";
import { generateLifestyleImage, generateProductScene } from "./falai";
import { renderLifestylePosterPng } from "./poster";
import { publishKlariPoster } from "./facebook";
import { setAgentStatus } from "./team";
import { sendTelegram } from "./telegram";

const STATE_KEY = "lifestyle_state";
const PREVIEW_KEY = "lifestyle_preview";

// prompt = generikus text-to-image (fallback); scene = Bria háttér, amibe a VALÓDI terméket illesztjük.
type Style = { key: string; label: string; prompt: string; scene: string };

/** Rotálódó lifestyle-hangulatok (nyár + foci-nyár). Egymás után NEM ismétlodnek. Mind LAPTOP-jelenet. */
const STYLES: Style[] = [
  { key: "beach", label: "tengerparti nyaralás", prompt: "a happy person in stylish white summer clothes and sunglasses on a beautiful tropical beach, holding an open modern silver business laptop, turquoise sea, palm trees and sun loungers, bright sunny day", scene: "a beautiful tropical beach with turquoise sea, white sand, palm trees and sun loungers, bright sunny day; the laptop placed on a small light wooden beach table with a realistic contact shadow; calm empty bright sky in the UPPER area; premium lifestyle advertising photography" },
  { key: "yacht", label: "luxusjacht a tengeren", prompt: "a relaxed person in a light linen shirt on the deck of a luxury white yacht, an open modern silver business laptop on the table in front, turquoise Mediterranean sea and coastline, bright sunlight", scene: "the deck of a luxury white yacht with turquoise Mediterranean sea and coastline, bright sunlight; the laptop placed on a polished wooden yacht table with a realistic contact shadow and soft reflection; calm empty sky in the UPPER area; premium lifestyle advertising photography" },
  { key: "pool", label: "medencés luxusnyaraló", prompt: "an open modern silver business laptop on a lounge table beside a luxury infinity pool, turquoise water, sun loungers and palm trees, bright summer day, aspirational vacation vibe", scene: "beside a luxury infinity pool with turquoise water, sun loungers and palm trees, bright summer day; the laptop placed on a stylish poolside lounge table with a realistic contact shadow; calm empty bright area in the UPPER part; premium lifestyle advertising photography" },
  { key: "terrace", label: "nyári teraszos home-office", prompt: "an open modern silver business laptop and a cup of coffee on a stylish sunny outdoor terrace table, lush green garden and warm summer sunlight, relaxed premium remote-work vibe", scene: "a stylish sunny outdoor terrace with a lush green garden and warm summer sunlight; the laptop placed on a wooden terrace table next to a coffee cup, with a realistic contact shadow; calm empty space in the UPPER area; premium lifestyle advertising photography" },
  { key: "cafe", label: "napsütötte kávézó, digitális nomád", prompt: "a person working on an open modern business laptop at a sunny stylish outdoor cafe table, warm softly blurred street background, coffee cup, cheerful summer city vibe", scene: "a sunny stylish outdoor cafe with a warm softly blurred summer street background; the laptop placed on a small round cafe table next to a coffee cup, with a realistic contact shadow; calm empty area in the UPPER part; premium lifestyle advertising photography" },
  { key: "rooftop", label: "city rooftop naplementében", prompt: "an open modern business laptop on a modern rooftop bar table at golden-hour sunset, warm glowing city skyline in the background, premium summer evening lifestyle vibe", scene: "a modern rooftop bar at golden-hour sunset with a warm glowing city skyline in the background; the laptop placed on a rooftop table with a realistic contact shadow; calm warm empty sky in the UPPER area; premium lifestyle advertising photography" },
  { key: "football", label: "foci-nyár, stadion hangulat", prompt: "a sleek modern dark business laptop on a clean table with a classic black-and-white soccer ball beside it, a softly blurred green football stadium pitch and glowing floodlights in the background, evening golden light, energetic football summer atmosphere, NO logos, NO trophies, NO team names, NO flags", scene: "a clean table with a classic black-and-white soccer ball beside the laptop; a softly blurred green football stadium pitch and glowing floodlights in the background; evening golden light; the laptop with a realistic contact shadow; calm empty area in the UPPER part; energetic football summer atmosphere; NO logos, NO trophies, NO team names, NO flags" },
  { key: "garden", label: "kerti napsütés", prompt: "a person relaxing in a sunny green garden with an open modern business laptop on a wooden table, blooming flowers and warm summer daylight, cheerful lifestyle vibe", scene: "a sunny green garden with blooming flowers and warm summer daylight; the laptop placed on a wooden garden table with a realistic contact shadow; calm empty space in the UPPER area; cheerful lifestyle advertising photography" },
];

/** A jelenet laptopjának kinézete illeszkedjen a valódi termékhez (pl. ThinkPad = fekete). */
function laptopLook(name: string): string {
  const n = (name || "").toLowerCase();
  if (/thinkpad|thinkbook|latitude|vostro/.test(n)) return "a professional matte BLACK clamshell business laptop";
  if (/macbook/.test(n)) return "a slim silver aluminium laptop";
  if (/elitebook|probook|zbook|\bhp\b/.test(n)) return "a dark silver-grey business laptop";
  return "a modern slim business laptop";
}

/** Fotorealisztikus, felirat nélküli LAPTOP-jelenet — felül üres hely a focímnek. */
const wrap = (p: string, look: string) =>
  `Ultra-photorealistic advertising photograph, shot on a full-frame camera, premium commercial lifestyle photography, true to life, natural colors, sharp focus: ${p}. The device is clearly ${look} — an open modern clamshell LAPTOP (never a desktop PC, tower or monitor). The laptop screen shows a vibrant colorful abstract wallpaper. Leave clean, calm empty space in the UPPER part of the image for a headline. Absolutely NO text, NO letters, NO numbers, NO logos, NO watermarks, NO brand names anywhere.`;

/**
 * LAPTOP-e a termék? A lifestyle-jelenet MINDIG laptopot mutat, ezért csak laptopot hirdethetünk
 * (különben kép↔leírás ellentmondás: pl. asztali gép a szövegben, laptop a képen).
 */
export function isLaptopProduct(name: string): boolean {
  const n = (name || "").toLowerCase();
  // Kizárjuk a nem-laptop / kiegészíto tételeket.
  const bad = /asztali|desktop|\bsff\b|\bmt\b|\bdt\b|tower|torony|mini\s?pc|all.?in.?one|\baio\b|monitor|kijelz|dokkol|\bdock\b|táska|hátizsák|\begér\b|billenty|adapter|tölto|\bkábel\b|\bram\b|\bssd\b|\bhdd\b|merevlemez|memória|videokárty|\bgpu\b|szerver|\bnas\b|nyomtat|webkamera|fejhallg|hangszóró|pendrive|szoftver|licenc|\bwin(dows)?\s?1[01]\b\s*$/i;
  if (bad.test(n)) return false;
  // Laptop-jelzok: kifejezés, ismert laptop-termékvonalak, vagy jellemzo képátló (13,3" / 14" / 15,6").
  const good = /laptop|notebook|latitude|elitebook|probook|thinkpad|thinkbook|zbook|\bfolio\b|inspiron|ideapad|macbook|\byoga\b|travelmate|vivobook|zenbook|\bswift\b|\baspire\b|\d{2}[.,]\d\s?["″”]|\b1[0-7][.,]\d\b|\b1[0-7]["″”]/i;
  return good.test(n);
}

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
    await supabaseAdmin().from("app_state").upsert({ key: STATE_KEY, value: JSON.stringify(s), updated_at: new Date().toISOString() });
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

/** Valódi Vitech-LAPTOP kiválasztása az Unasból (több lapot is átnéz, míg talál laptopot). */
async function pickLaptop(token: string): Promise<UnasProduct | null> {
  const dayIdx = Math.floor(Date.now() / 86_400_000);
  for (let w = 0; w < 5; w++) {
    const limitStart = ((dayIdx + w) * 23) % 500;
    const products = await unasGetProducts(token, { limitNum: 100, limitStart }).catch(() => [] as UnasProduct[]);
    const laptops = products.filter((p) => p.priceGross && p.name && p.url && isLaptopProduct(p.name));
    if (laptops.length) return laptops[Math.floor(Math.random() * laptops.length)];
  }
  return null;
}

export interface LifestyleDraft {
  styleKey: string;
  style: string;
  product: string;
  productUrl: string;
  priceHuf: number | null;
  headline: string;
  sub: string;
  caption: string;
  poster: string; // renderelt PNG URL
  realProduct: boolean; // a VALÓDI termékfotó került a jelenetbe (Bria) vagy generikus (fallback)?
  qcOk: boolean;
  qcNote: string;
}

/**
 * Teljes plakát ELOÁLLÍTÁSA (LAPTOP + rotáló hangulat + fotorealisztikus jelenet + tiszta render),
 * QC-vel — de POSZTOLÁS NÉLKÜL. Az eredményt eltárolja elonézetként (lifestyle_preview).
 */
export async function buildLifestylePoster(): Promise<LifestyleDraft> {
  const token = await unasLogin();
  const product = await pickLaptop(token);
  if (!product) throw new Error("nem találtam LAPTOP terméket az Unasban");
  const price = Number(String(product.priceGross).replace(/[^\d]/g, "")) || null;

  const state = await loadState();
  const style = pickStyle(state.styles);

  const drafted =
    (await lifestyleCompose({ name: product.name, priceGross: product.priceGross }, style.label, state.headlines.slice(-6))) || {
      headline: "Dolgozz bárhonnan",
      sub: "Felújított, bevizsgált üzleti laptopok garanciával.",
      caption: "Idén nyáron vidd magaddal az irodát! 💻☀️ Nézd meg a felújított laptopjainkat a vitechcompkft.hu-n!",
    };

  // POSZTOLÁS ELOTTI KÖTELEZO ELLENORZÉS (nyelvhelyesség + laptop-egyezés, javítással).
  const qc = await lifestyleReview({ name: product.name }, style.label, drafted);

  // ELSODLEGES: a VALÓDI termékfotót illesztjük a lifestyle-jelenetbe (Bria product-shot) — így nem
  // hasonló, hanem PONTOSAN a hirdetett gép látszik. Ha nincs termékfotó vagy hibázik → generikus jelenet.
  let bg: string | null = null;
  let usedRealProduct = false;
  if (product.imageUrl) {
    bg = await generateProductScene(product.imageUrl, {
      scene: style.scene,
      placement: "right_center",
      shotSize: [1600, 900],
    }).catch(() => null);
    if (bg) usedRealProduct = true;
  }
  if (!bg) {
    const scenePrompt = wrap(style.prompt.replace(/\bsilver\s?/gi, ""), laptopLook(product.name));
    bg = await generateLifestyleImage(scenePrompt);
  }
  if (!bg) throw new Error("kép-generálás sikertelen (fal.ai)");

  const poster = await renderLifestylePosterPng({ bgUrl: bg, headline: qc.headline, sub: qc.sub });
  if (!poster) throw new Error("poszter-render sikertelen (hcti)");

  const draft: LifestyleDraft = {
    styleKey: style.key,
    style: style.label,
    product: product.name,
    productUrl: product.url || "https://vitechcompkft.hu",
    priceHuf: price,
    headline: qc.headline,
    sub: qc.sub,
    caption: qc.caption,
    poster,
    realProduct: usedRealProduct,
    qcOk: qc.ok,
    qcNote: qc.note,
  };

  try {
    await supabaseAdmin()
      .from("app_state")
      .upsert({ key: PREVIEW_KEY, value: JSON.stringify({ ...draft, asOf: new Date().toISOString() }), updated_at: new Date().toISOString() });
  } catch {
    /* nem kritikus */
  }
  return draft;
}

/** Egy elkészült (QC-n átment) plakát kiposztolása + dedup-állapot és napló frissítése. */
export async function publishLifestyleDraft(draft: LifestyleDraft): Promise<{ ok: boolean; url?: string; error?: string }> {
  const fb = await publishKlariPoster({
    headline: draft.headline,
    caption: draft.caption,
    priceHuf: draft.priceHuf,
    productName: draft.product,
    productUrl: draft.productUrl,
    imageUrl: draft.poster,
  });

  if (fb.ok) {
    // Ismétlés-kerülés: csak SIKERES posztnál rögzítjük a felhasznált stílust + focímet.
    const state = await loadState();
    state.styles = [...state.styles, draft.styleKey].slice(-8);
    state.headlines = [...state.headlines, draft.headline].slice(-10);
    await saveState(state);
    try {
      await supabaseAdmin()
        .from("app_state")
        .upsert({
          key: "lifestyle_last",
          value: JSON.stringify({
            style: draft.style,
            headline: draft.headline,
            product: draft.product,
            productUrl: draft.productUrl,
            poster: draft.poster,
            fbUrl: fb.url || null,
            ok: true,
            asOf: new Date().toISOString(),
          }),
          updated_at: new Date().toISOString(),
        });
    } catch {
      /* nem kritikus */
    }
  }
  return fb;
}

/** A legutóbb elokészített elonézet betöltése (kézi jóváhagyás → publikálás). */
export async function loadLifestylePreview(): Promise<LifestyleDraft | null> {
  try {
    const { data } = await supabaseAdmin().from("app_state").select("value").eq("key", PREVIEW_KEY).maybeSingle();
    if (data?.value) return JSON.parse(data.value) as LifestyleDraft;
  } catch {
    /* nincs elonézet */
  }
  return null;
}

/**
 * Napi lifestyle-plakát. dryRun=true → csak elokészít + QC (NEM posztol; visszaadja az elonézetet).
 * Éles futásnál CSAK akkor posztol, ha a QC rendben van; különben riaszt és NEM tesz ki semmit.
 */
export async function runLifestyleDaily(opts?: { dryRun?: boolean }): Promise<{ ok: boolean; fbUrl?: string; error?: string; draft?: LifestyleDraft }> {
  await setAgentStatus("klari", "working", "Napi lifestyle-plakát készítése (LAPTOP + QC)…");
  try {
    const draft = await buildLifestylePoster();

    if (opts?.dryRun) {
      await setAgentStatus("klari", "working", `Elonézet kész (QC ${draft.qcOk ? "OK" : "HIBA"}) — jóváhagyásra vár.`);
      return { ok: draft.qcOk, draft };
    }

    if (!draft.qcOk) {
      await setAgentStatus("klari", "error", `Lifestyle-plakát VISSZATARTVA (QC): ${draft.qcNote || "nyelvi/tartalmi hiba"}`);
      await sendTelegram(
        `⚠️ *Lifestyle-plakát VISSZATARTVA* — nem ment ki, mert a QC hibát talált:\n${draft.qcNote || "nyelvi/tartalmi hiba"}\n(termék: ${draft.product})`
      ).catch(() => {});
      return { ok: false, error: "QC nem OK: " + draft.qcNote, draft };
    }

    const fb = await publishLifestyleDraft(draft);
    if (fb.ok) {
      await setAgentStatus("klari", "done", `Lifestyle-plakát kint: ${draft.style} · ${draft.headline}`);
      await sendTelegram(
        `🌴 *Napi lifestyle-plakát kint a Facebookon*\n\n🎨 Stílus: ${draft.style}\n📰 ${draft.headline}\n💻 ${draft.product}${fb.url ? `\n🔗 ${fb.url}` : ""}`
      ).catch(() => {});
    } else {
      await setAgentStatus("klari", "error", `Lifestyle FB-hiba: ${fb.error || "?"}`);
      await sendTelegram(`⚠️ A lifestyle-plakát elkészült és átment a QC-n, de a Facebook-poszt nem ment ki: ${fb.error || "?"}`).catch(() => {});
    }
    return { ok: fb.ok, fbUrl: fb.url, error: fb.error, draft };
  } catch (e: any) {
    const msg = String(e?.message || e);
    await setAgentStatus("klari", "error", `Lifestyle-plakát hiba: ${msg}`);
    await sendTelegram(`❌ Napi lifestyle-plakát hiba: ${msg}`).catch(() => {});
    return { ok: false, error: msg };
  }
}
