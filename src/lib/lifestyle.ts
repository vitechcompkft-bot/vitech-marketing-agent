import { supabaseAdmin } from "./supabase";
import { unasLogin, unasGetProducts, type UnasProduct } from "./unas";
import { lifestyleCompose, lucaReviewCleanPoster } from "./claude";
import { removeBg } from "./removebg";
import { renderCleanProductPosterPng, getLastLifestyleRenderError } from "./poster";
import { publishKlariPoster } from "./facebook";
import { setAgentStatus } from "./team";
import { sendTelegram } from "./telegram";
import { isLive } from "./productLive";
import { pickApprovedPremium, publishPremiumPoster } from "./premium";

const STATE_KEY = "lifestyle_state";
const PREVIEW_KEY = "lifestyle_preview";

// LETISZTULT, DESIGNOLT plakát: rotálódó nyári SZÍNTÉMÁK (nem fotó-jelenet), a VALÓDI termék kivágva rákerül.
type Theme = { key: string; label: string; from: string; to: string; accent: string };

/** Rotálódó, VISSZAFOGOTT, MÁRKAHU színtémák (kék/türkiz — nincs rikító sárga/narancs). NEM ismétlodnek. */
const THEMES: Theme[] = [
  { key: "brand", label: "Vitech ajánlat", from: "#1a73e8", to: "#0b1f3f", accent: "#bfdbfe" },
  { key: "ocean", label: "Nyári ajánlat", from: "#0ea5e9", to: "#0c4a6e", accent: "#bae6fd" },
  { key: "teal", label: "Friss nyár", from: "#0d9488", to: "#134e4a", accent: "#99f6e4" },
  { key: "sky", label: "Tiszta nyár", from: "#3b82f6", to: "#1e3a8a", accent: "#bfdbfe" },
  { key: "indigo", label: "Prémium ajánlat", from: "#4f46e5", to: "#1e1b4b", accent: "#c7d2fe" },
  { key: "slate", label: "Üzleti ajánlat", from: "#334155", to: "#0f172a", accent: "#93c5fd" },
];

/** BEVÁLT, ÉRTELMES focímek — nem az AI találja ki (folyton kockázatos), hanem ezekbol forgatunk. */
const HEADLINES: string[] = [
  "Nyári laptop-akció",
  "Eros laptop, baráti ár",
  "Felújított laptop, garanciával",
  "Válts gépet még nyáron!",
  "Megbízható laptop, jó áron",
  "Prémium laptop, elérheto áron",
  "Itt a nyári laptop-ajánlat",
  "Üzleti laptop, teljes garanciával",
  "Vidd magaddal a nyárba",
  "Laptop, ami bírja a tempót",
  "Dolgozz bárhonnan nyáron",
  "Nyári ajánlat felújított laptopokra",
];

/** Világos, mindig helyes alcím a termékbol (nincs kitalált adat; garancia csak a névbol). */
function buildSub(name: string): string {
  const g = (name || "").match(/(\d+)\s*(hónap|év)\s*garanci/i);
  const gar = g ? `${g[1]} ${g[2].toLowerCase()} garanciával` : "garanciával";
  return `Gondosan bevizsgált, felújított üzleti laptop ${gar}, kedvezményes áron.`;
}

/** Olyan focím, ami az utolsó 6-ban NEM szerepelt (változatosság, de mindig ÉRTELMES). */
function pickHeadline(recent: string[]): string {
  const last = recent.slice(-6);
  const fresh = HEADLINES.filter((h) => !last.includes(h));
  const pool = fresh.length ? fresh : HEADLINES;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Biztonságos jelvények: garancia CSAK a termék nevébol; nincs kitalált adat. */
function buildBadges(name: string): string[] {
  const b: string[] = [];
  const g = (name || "").match(/(\d+)\s*(hónap|év)\s*garanci/i);
  if (g) b.push(`${g[1]} ${g[2].toLowerCase() === "év" ? "ÉV" : "HÓ"} GARANCIA`);
  else b.push("GARANCIÁVAL");
  b.push("BEVIZSGÁLVA");
  b.push("GYORS SZÁLLÍTÁS");
  return b.slice(0, 3);
}

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

/** Olyan témát választ, ami az utolsó 4-ben NEM szerepelt (így nem ismétlodik). */
function pickTheme(recent: string[]): Theme {
  const last = recent.slice(-4);
  const fresh = THEMES.filter((s) => !last.includes(s.key));
  const pool = fresh.length ? fresh : THEMES;
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
  const theme = pickTheme(state.styles);
  // A FOCÍM bevált készletbol (nem AI-nonsense), az ALCÍM determinista — mindig ÉRTELMES és helyes.
  const headline = pickHeadline(state.headlines);
  const sub = buildSub(product.name);

  // Az AI CSAK a FB-poszt SZÖVEGÉT (caption) írja; a focímet/alcímet NEM (ott volt a „Nyár, sí, gépelj"-nonsense).
  const composed = await lifestyleCompose(
    { name: product.name, priceGross: product.priceGross },
    theme.label,
    state.headlines.slice(-6)
  ).catch(() => null);
  const caption =
    (composed?.caption && composed.caption.trim()) ||
    "Idén nyáron dolgozz a legjobb géppel! Nézd meg a felújított, garanciás laptopjainkat a vitechcompkft.hu-n.";

  // POSZTOLÁS ELOTTI KÖTELEZO tartalmi ellenorzés (tört ár + kitalált garancia) — a caption-re is.
  const guard = textGuard(product.name, headline, sub, caption);

  // A VALÓDI termékfotó háttér-kivágása (remove.bg) → átlátszó PNG a designolt plakátra.
  // Ha nincs kulcs / hiba → a sima fotót fehér kártyára tesszük (a fehér háttér így szándékosnak tunik).
  let cutout: string | null = null;
  if (product.imageUrl) cutout = await removeBg(product.imageUrl).catch(() => null);
  const cutoutUrl = cutout || product.imageUrl;
  if (!cutoutUrl) throw new Error("nincs termékfotó a plakáthoz");
  const usedRealProduct = true; // MINDIG a valódi termék van a plakáton (kivágva vagy fehér kártyán)

  const poster = await renderCleanProductPosterPng({
    cutoutUrl,
    onWhiteCard: !cutout,
    headline,
    sub,
    priceHuf: price ?? undefined,
    badges: buildBadges(product.name),
    ribbon: theme.label,
    from: theme.from,
    to: theme.to,
    accent: theme.accent,
  });
  if (!poster) throw new Error("poszter-render sikertelen — " + (getLastLifestyleRenderError() || "ismeretlen"));

  // VIZUÁLIS QC — Luca ránéz a KÉSZ plakátra + a focímre, és blokkol, ha nem egyértelmuen jó (posztolás elott).
  const review = await lucaReviewCleanPoster(poster, headline).catch(() => ({ ok: true, issue: "QC hiba (átengedve)" }));
  const qcOk = guard.ok && review.ok;
  const qcNote = [guard.ok ? "" : guard.note, review.ok ? "" : `Luca: ${review.issue}`].filter(Boolean).join(" | ");

  const draft: LifestyleDraft = {
    styleKey: theme.key,
    style: theme.label,
    product: product.name,
    productUrl: product.url || "https://vitechcompkft.hu",
    priceHuf: price,
    headline,
    sub,
    caption,
    poster,
    realProduct: usedRealProduct,
    qcOk,
    qcNote,
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
  await setAgentStatus("klari", "working", "Napi lifestyle-plakát…");
  try {
    // ÉLES: elsoként a tulajdonos által JÓVÁHAGYOTT prémium plakátot posztoljuk (ha van ilyen).
    if (!opts?.dryRun) {
      const approved = await pickApprovedPremium().catch(() => null);
      if (approved) {
        const fb = await publishPremiumPoster(approved.id);
        if (fb.ok) {
          await setAgentStatus("klari", "done", `Prémium plakát kiposztolva: ${approved.headline}`);
          await sendTelegram(`🌴 *Napi prémium plakát kint a Facebookon*\n\n📰 ${approved.headline}${fb.fbUrl ? `\n🔗 ${fb.fbUrl}` : ""}`).catch(() => {});
          return { ok: true, fbUrl: fb.fbUrl };
        }
        // ha a prémium posztolás hibázott → átesünk az automata plakátra (safety net)
      }
    }

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
