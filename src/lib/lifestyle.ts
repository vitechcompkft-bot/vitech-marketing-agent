import { supabaseAdmin } from "./supabase";
import { unasLogin, unasGetProducts, type UnasProduct } from "./unas";
import { lifestyleCompose } from "./claude";
import { generateLifestyleImage, generateProductScene } from "./falai";
import { renderLifestylePosterPng, getLastLifestyleRenderError } from "./poster";
import { publishKlariPoster } from "./facebook";
import { setAgentStatus } from "./team";
import { sendTelegram } from "./telegram";
import { isLive } from "./productLive";

const STATE_KEY = "lifestyle_state";
const PREVIEW_KEY = "lifestyle_preview";

// prompt = generikus text-to-image (fallback); scene = Bria szöveges háttér; bg = szép ÜRES jelenet
// (text-to-image, laptop nélkül), amit referenciaként a Bria-ba adunk, hogy a VALÓDI termék abba kerüljön.
type Style = { key: string; label: string; prompt: string; scene: string; bg: string };

/** Rotálódó lifestyle-hangulatok (nyár + foci-nyár). Egymás után NEM ismétlodnek. Mind LAPTOP-jelenet. */
const STYLES: Style[] = [
  { key: "beach", label: "tengerparti nyaralás", prompt: "a happy person in stylish white summer clothes and sunglasses on a beautiful tropical beach, holding an open modern silver business laptop, turquoise sea, palm trees and sun loungers, bright sunny day", scene: "a beautiful tropical beach with turquoise sea, white sand, palm trees and sun loungers, bright sunny day, the laptop placed on a NORMAL FULL-SIZED wooden table with a comfortable chair, realistic contact shadow, calm empty bright sky in the UPPER area, premium lifestyle advertising photography", bg: "a beautiful tropical beach with turquoise sea, white sand, palm trees and sun loungers, a NORMAL FULL-SIZED wooden table and a comfortable chair set up in the lower-right foreground, the table clearly big enough for a laptop" },
  { key: "yacht", label: "luxusjacht a tengeren", prompt: "a relaxed person in a light linen shirt on the deck of a luxury white yacht, an open modern silver business laptop on the table in front, turquoise Mediterranean sea and coastline, bright sunlight", scene: "the deck of a luxury white yacht with turquoise Mediterranean sea and coastline, bright sunlight, the laptop placed on a NORMAL FULL-SIZED polished wooden table with a comfortable chair, realistic contact shadow and soft reflection, calm empty sky in the UPPER area, premium lifestyle advertising photography", bg: "the sunny deck of a luxury white yacht, turquoise Mediterranean sea and coastline, bright sunlight, a NORMAL FULL-SIZED polished wooden table and a comfortable chair in the lower-right foreground, the table clearly big enough for a laptop" },
  { key: "pool", label: "medencés luxusnyaraló", prompt: "an open modern silver business laptop on a lounge table beside a luxury infinity pool, turquoise water, sun loungers and palm trees, bright summer day, aspirational vacation vibe", scene: "beside a luxury infinity pool with turquoise water, sun loungers and palm trees, bright summer day, the laptop placed on a NORMAL FULL-SIZED poolside table with a comfortable chair, realistic contact shadow, calm empty bright area in the UPPER part, premium lifestyle advertising photography", bg: "a luxury infinity pool with turquoise water, sun loungers and palm trees, bright summer day, a NORMAL FULL-SIZED poolside table and a comfortable chair in the lower-right foreground, the table clearly big enough for a laptop" },
  { key: "terrace", label: "nyári teraszos home-office", prompt: "an open modern silver business laptop and a cup of coffee on a stylish sunny outdoor terrace table, lush green garden and warm summer sunlight, relaxed premium remote-work vibe", scene: "a stylish sunny outdoor terrace with a lush green garden and warm summer sunlight, the laptop placed on a NORMAL FULL-SIZED wooden terrace table with a comfortable chair and a coffee cup, realistic contact shadow, calm empty space in the UPPER area, premium lifestyle advertising photography", bg: "a stylish sunny outdoor terrace with a lush green garden and warm bright summer sunlight, a NORMAL FULL-SIZED wooden terrace table with a coffee cup and a comfortable chair in the lower-right foreground, the table clearly big enough for a laptop" },
  { key: "cafe", label: "napsütötte kávézó, digitális nomád", prompt: "a person working on an open modern business laptop at a sunny stylish outdoor cafe table, warm softly blurred street background, coffee cup, cheerful summer city vibe", scene: "a sunny stylish outdoor cafe with a warm softly blurred summer street background, the laptop placed on a NORMAL FULL-SIZED cafe table with a comfortable chair and a coffee cup, realistic contact shadow, calm empty area in the UPPER part, premium lifestyle advertising photography", bg: "a sunny stylish outdoor cafe with a warm softly blurred bright summer street background, a NORMAL FULL-SIZED cafe table with a coffee cup and a comfortable chair in the lower-right foreground, the table clearly big enough for a laptop" },
  { key: "rooftop", label: "city rooftop naplementében", prompt: "an open modern business laptop on a modern rooftop bar table at golden-hour sunset, warm glowing city skyline in the background, premium summer evening lifestyle vibe", scene: "a modern rooftop bar at golden-hour sunset with a warm glowing city skyline in the background, the laptop placed on a NORMAL FULL-SIZED rooftop table with a comfortable chair, realistic contact shadow, calm warm empty sky in the UPPER area, premium lifestyle advertising photography", bg: "a modern rooftop bar at bright golden-hour sunset, a warm glowing city skyline in the background, a NORMAL FULL-SIZED rooftop table and a comfortable chair in the lower-right foreground, the table clearly big enough for a laptop" },
  { key: "football", label: "foci-nyár, stadion hangulat", prompt: "a sleek modern dark business laptop on a clean table with a classic black-and-white soccer ball beside it, a softly blurred green football stadium pitch and glowing floodlights in the background, evening golden light, energetic football summer atmosphere, NO logos, NO trophies, NO team names, NO flags", scene: "a NORMAL FULL-SIZED clean table with a comfortable chair and a classic black-and-white soccer ball beside the laptop, a softly blurred green football stadium pitch and glowing floodlights in the background, evening golden light, the laptop with a realistic contact shadow, calm empty area in the UPPER part, energetic football summer atmosphere, NO logos, NO trophies, NO team names, NO flags", bg: "a bright softly blurred green football stadium pitch with glowing floodlights in the background, a NORMAL FULL-SIZED table with a classic black-and-white soccer ball and a comfortable chair in the lower-right foreground, the table clearly big enough for a laptop, no logos no trophies no team names no flags" },
  { key: "garden", label: "kerti napsütés", prompt: "a person relaxing in a sunny green garden with an open modern business laptop on a wooden table, blooming flowers and warm summer daylight, cheerful lifestyle vibe", scene: "a sunny green garden with blooming flowers and warm summer daylight, the laptop placed on a NORMAL FULL-SIZED wooden garden table with a comfortable chair, realistic contact shadow, calm empty space in the UPPER area, cheerful lifestyle advertising photography", bg: "a bright sunny green garden with blooming flowers and warm summer daylight, a NORMAL FULL-SIZED wooden garden table and a comfortable chair in the lower-right foreground, the table clearly big enough for a laptop" },
];

/** A jelenet laptopjának kinézete illeszkedjen a valódi termékhez (pl. ThinkPad = fekete). */
function laptopLook(name: string): string {
  const n = (name || "").toLowerCase();
  if (/thinkpad|thinkbook|latitude|vostro/.test(n)) return "a professional matte BLACK clamshell business laptop";
  if (/macbook/.test(n)) return "a slim silver aluminium laptop";
  if (/elitebook|probook|zbook|\bhp\b/.test(n)) return "a dark silver-grey business laptop";
  return "a modern slim business laptop";
}

/** Szép, ÜRES lifestyle-jelenet (laptop NÉLKÜL) — ezt adjuk referenciának a Bria-ba a valódi termékhez. */
const wrapEmpty = (p: string) =>
  `Ultra-photorealistic advertising photograph, shot on a full-frame camera, premium commercial lifestyle photography, true to life, natural colors, bright and airy, sharp focus: ${p}. IMPORTANT: the scene must contain a NORMAL, FULL-SIZED table (a proper large table surface at natural desk height, clearly big enough for a laptop — NOT a tiny side table or stool) together with a matching comfortable chair, arranged as a real usable outdoor workspace. NO laptop, NO computer, NO device and NO people in the foreground. Leave clean, calm empty space in the UPPER part of the image for a headline. Absolutely NO text, NO letters, NO numbers, NO logos, NO watermarks anywhere.`;

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

/**
 * Azonnali (kód-alapú) tartalmi ellenorzés: TILOS a "tört ár", és TILOS a kitalált garancia-ido
 * (csak az szerepelhet, ami a termék nevében pontosan benne van). Így nem megy ki valótlan állítás.
 */
function textGuard(productName: string, headline: string, sub: string, caption: string): { ok: boolean; note: string } {
  const all = `${headline} ${sub} ${caption}`.toLowerCase();
  if (/tört\s*ár/.test(all)) return { ok: false, note: "tört ár kifejezés" };
  const claim = all.match(/(\d+)\s*(hónap|év)\s*garanci/);
  if (claim) {
    const inName = (productName || "").toLowerCase().match(/(\d+)\s*(hónap|év)\s*garanci/);
    if (!inName || inName[1] !== claim[1] || inName[2] !== claim[2]) {
      return { ok: false, note: `kitalált garancia-ido (${claim[1]} ${claim[2]}) — a termék nevében nincs ilyen` };
    }
  }
  return { ok: true, note: "" };
}

/** Olyan stílust választ, ami az utolsó 4-ben NEM szerepelt (így nem ismétlodik). */
function pickStyle(recent: string[]): Style {
  const last = recent.slice(-4);
  const fresh = STYLES.filter((s) => !last.includes(s.key));
  const pool = fresh.length ? fresh : STYLES;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Valódi, ÉLO Vitech-LAPTOP kiválasztása az Unasból (csak amelyik oldala tényleg elérheto a boltban). */
async function pickLaptop(token: string): Promise<UnasProduct | null> {
  const dayIdx = Math.floor(Date.now() / 86_400_000);
  const seen = new Set<string>();
  const pool: UnasProduct[] = [];
  // 1-2 lap általában boven elég laptopból; a gyorsaságért nem söprünk többet.
  for (let w = 0; w < 2 && pool.length < 24; w++) {
    const limitStart = ((dayIdx + w) * 23) % 500;
    const products = await unasGetProducts(token, { limitNum: 100, limitStart }).catch(() => [] as UnasProduct[]);
    for (const p of products) {
      if (p.priceGross && p.name && p.url && isLaptopProduct(p.name) && !seen.has(p.id)) {
        seen.add(p.id);
        pool.push(p);
      }
    }
  }
  // Véletlen sorrend a változatosságért, majd párhuzamos élo-ellenorzés — az elso ÉLO nyer (max ~16 ellenorzés).
  pool.sort(() => Math.random() - 0.5);
  for (let i = 0; i < pool.length && i < 16; i += 8) {
    const batch = pool.slice(i, i + 8);
    const flags = await Promise.all(batch.map((p) => isLive(p.url)));
    const idx = flags.findIndex(Boolean);
    if (idx >= 0) return batch[idx];
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
  if (!product) throw new Error("nem találtam ÉLO (elérheto) laptop terméket az Unasban");
  const price = Number(String(product.priceGross).replace(/[^\d]/g, "")) || null;

  const state = await loadState();
  const style = pickStyle(state.styles);

  const qc =
    (await lifestyleCompose({ name: product.name, priceGross: product.priceGross }, style.label, state.headlines.slice(-6))) || {
      headline: "Dolgozz bárhonnan",
      sub: "Bevizsgált üzleti laptopok garanciával.",
      caption: "Idén nyáron vidd magaddal az irodát! 💻☀️ Nézd meg a laptopjainkat a vitechcompkft.hu-n!",
    };

  // POSZTOLÁS ELOTTI KÖTELEZO tartalmi ellenorzés (tört ár + kitalált garancia) — azonnali, kód-alapú.
  const guard = textGuard(product.name, qc.headline, qc.sub, qc.caption);

  // ELSODLEGES: a VALÓDI termékfotót illesztjük a lifestyle-jelenetbe (Bria product-shot) — így nem
  // HASONLÓ, hanem PONTOSAN a hirdetett gép látszik. A szép hatásért elobb egy világos ÜRES jelenetet
  // generálunk (text-to-image), és AZT adjuk referenciának a Bria-nak → szép jelenet + valódi termék.
  let bg: string | null = null;
  let usedRealProduct = false;
  if (product.imageUrl) {
    const refBg = await generateLifestyleImage(wrapEmpty(style.bg)).catch(() => null);
    bg = await generateProductScene(product.imageUrl, {
      refImageUrl: refBg || undefined,
      scene: style.scene, // ha nincs refBg, szöveges leírással dolgozik a Bria
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
  if (!poster) throw new Error("poszter-render sikertelen (hcti) — " + (getLastLifestyleRenderError() || "ismeretlen"));

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
    qcOk: guard.ok,
    qcNote: guard.note,
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
