import { supabaseAdmin } from "./supabase";
import { unasLogin, unasGetProducts } from "./unas";
import { klariResearch, klariCompose, lucaJudgeDeal, lucaReviewPoster, lucaProofreadHungarian } from "./claude";
import { generateProductScene } from "./falai";
import { generateProductSceneHF, higgsfieldEnabled } from "./higgsfield";
import { buildDealPoster } from "./creatives";
import { renderPosterPng } from "./poster";
import { setAgentStatus } from "./team";
import { sendTelegram } from "./telegram";
import { facebookConfigured, facebookAutopostEnabled, publishKlariPoster } from "./facebook";

/**
 * A kész plakát automatikus kiposztolása a Vitech FB-oldalra (ha be van kötve + nincs kikapcsolva).
 * A poszt képe a renderelt plakát (poster_url); ha az nincs, a termékfotó. Visszaad egy rövid jegyzetet
 * a Luca-verdiktbe, és Telegramon is jelez. Soha nem dobja el a fo folyamatot (best-effort).
 */
async function autopostToFacebook(row: any, rd: RenderData, posterUrl: string | null): Promise<string> {
  if (!facebookConfigured() || !facebookAutopostEnabled()) return "";
  const img = posterUrl || row.image_url || rd.imageUrl;
  if (!img) return " | FB: kihagyva (nincs kép).";
  try {
    const fb = await publishKlariPoster({
      headline: rd.headline,
      caption: row.caption,
      priceHuf: rd.priceHuf,
      productName: rd.productName,
      productUrl: rd.productUrl,
      imageUrl: img,
    });
    if (fb.ok) {
      await sendTelegram(`📘 *Klári plakátja kiment a Vitech Facebook-oldalra is.*\n🖥️ ${rd.productName}${fb.url ? `\n${fb.url}` : ""}`).catch(() => {});
      return " | FB: kiposztolva.";
    }
    return ` | FB hiba: ${fb.error}`;
  } catch (e: any) {
    return ` | FB hiba: ${e?.message || "ismeretlen"}`;
  }
}

export interface KlariResult {
  ran: boolean;
  reason?: string;
  phase?: "text" | "image";
  status?: "approved" | "rejected" | "pending_image";
  product?: string;
  verdict?: string;
  posterUrl?: string | null;
  cutoutOk?: boolean;
  posterSource?: string;
  falNote?: string;
  postId?: number;
  renderData?: RenderData;
  retry?: boolean; // a kép-fázis jelzi: Luca elutasította, de Klári újra nekifut (láncolt invokáció)
  nextAttempt?: number; // a következo próba sorszáma (a render route ezzel hívja újra magát)
  attempt?: number;
}

/** A kreatív készítésének napja (Budapest) — „melyik nap készült". */
function todayLabel(): string {
  return new Intl.DateTimeFormat("hu-HU", {
    timeZone: "Europe/Budapest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Hány alkalommal próbálja Klári a plakátot, amíg Luca el nem fogadja (láncolt invokációkban). */
const MAX_IMAGE_ATTEMPTS = 6;

/** A kép-fázishoz szükséges renderelési adatok (a szöveg-fázis állítja elo, a kép-fázis használja). */
export interface RenderData {
  productId: string;
  productName: string;
  productUrl?: string | null;
  imageUrl?: string;
  priceHuf?: number;
  headline: string;
  badges?: string[];
  features?: string[];
  specs?: Record<string, string | undefined>;
  dateLabel?: string; // a készítés napja — a plakátra kerül
  lastPosterUrl?: string; // legutóbbi renderelt plakát (fallback-hez, ha kifutunk a próbákból)
}

/**
 * KÉTLÉPCSOS futás (Vercel Hobby 60s limit miatt):
 *  - runKlariText(): kutatás → ajánlat-szöveg → Luca jóváhagyás → 'pending_image' sor (gyors).
 *  - runKlariImage(): kivágás → render → Luca VIZUÁLIS QC → sor frissítése (gyors).
 * A két fázis KÜLÖN HTTP-invokáció, mindegyiknek saját 60s budget-je van.
 */

/** 1. FÁZIS — szöveg: a legjobb ajánlat + Luca jóváhagyás, majd 'pending_image' sor mentése. */
export async function runKlariText(opts?: { force?: boolean }): Promise<KlariResult> {
  const sb = supabaseAdmin();
  const { data: cfg } = await sb.from("agent_config").select("*").eq("id", 1).single();
  if (!cfg) return { ran: false, reason: "Nincs konfiguráció." };
  if (!cfg.agent_enabled) return { ran: false, reason: "Az Agent ki van kapcsolva (vész-leállító)." };

  // NAPI EGY plakát: ha ma már készült (vagy folyamatban) plakát, kihagyjuk (kivéve force).
  // Így a reggeli (07:00) és a fallback (19:00) cron nem duplázik, de a kimaradt reggelt pótolja.
  if (!opts?.force) {
    const todayBp = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest" }).format(new Date());
    const { data: last } = await sb
      .from("klari_posts")
      .select("created_at, status")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastDay = last?.created_at ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest" }).format(new Date(last.created_at)) : "";
    if (lastDay === todayBp && last?.status !== "rejected") {
      return { ran: false, reason: "Ma már készült plakát — kihagyva." };
    }
  }

  const klariPersona = { name: "Klári", persona: cfg.klari_persona || "Lelkes, kreatív marketinges." };
  const lucaPersona = { name: cfg.agent_name, persona: cfg.agent_persona };

  await setAgentStatus("klari", "working", "Piackutatás a legjobb ajánlathoz…");

  // 1) Termékek — NAPONTA FORGÓ ablak a katalógusból, hogy ne ugyanazt a 40-et lássa minden nap.
  const token = await unasLogin();
  const dayIdx = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest", day: "numeric" }).format(new Date())); // 1–31
  const limitStart = ((dayIdx - 1) * 20) % 200; // a katalógus más-más szeletét nézi naponta
  let products = await unasGetProducts(token, { limitNum: 60, limitStart });
  if (products.filter((p) => p.priceGross && p.name).length < 5) {
    products = await unasGetProducts(token, { limitNum: 60, limitStart: 0 }); // ha a szelet üres/rövid, elejérol
  }
  const live = products.filter((p) => p.priceGross && p.name);
  if (!live.length) {
    await setAgentStatus("klari", "error", "Nincs feldolgozható termék az Unasból.");
    return { ran: false, reason: "Nincs feldolgozható termék." };
  }

  // Luca delegált briefje (több elérésért) — ha van nyitott, beépítjük és lezárjuk.
  let lucaBrief = "";
  const { data: deleg } = await sb
    .from("delegated_tasks")
    .select("id, brief")
    .eq("to_key", "klari")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (deleg?.brief) {
    lucaBrief = deleg.brief;
    await sb.from("delegated_tasks").update({ status: "done" }).eq("id", deleg.id);
    await setAgentStatus("klari", "working", "Luca briefje alapján dolgozom (több elérés)…");
  }

  // VÁLTOZATOSSÁG: az utóbbi napok kiemelt termékeit KIZÁRJUK (Klári kreatív → minden nap MÁS plakát),
  // és napi friss FOCÍM-szöget adunk. Luca (a fonök) nem tur ismétlést.
  const { data: recentPosts } = await sb
    .from("klari_posts")
    .select("product_id, product_name, headline")
    .order("created_at", { ascending: false })
    .limit(12);
  const recentIds = new Set((recentPosts || []).map((r: any) => r.product_id));
  const recentNames = (recentPosts || []).map((r: any) => r.product_name).filter(Boolean).slice(0, 8);
  const recentHeadlines = (recentPosts || []).map((r: any) => r.headline).filter(Boolean).slice(0, 6);
  const poolSrc = live.filter((p) => !recentIds.has(p.id));
  const pool = poolSrc.length >= 5 ? poolSrc : live; // ha kifogyna, ne akadjon el
  const ANGLES = ["kiemelt ár-előny", "üzleti teljesítmény", "tanuláshoz / diákoknak", "home office kényelem", "megbízhatóság + 12 hó garancia", "kompakt és hordozható", "kreatív munkára"];
  const angle = ANGLES[dayIdx % ANGLES.length];
  const varietyNote =
    `\n\n[VÁLTOZATOSSÁG — KÖTELEZO] Kreatív marketinges vagy: MINDEN NAP MÁS plakát kell, sosem ugyanaz.` +
    (recentNames.length ? ` Az elmúlt napokban EZEKET emelted ki, NE ezeket válaszd újra: ${recentNames.join("; ")}.` : "") +
    (recentHeadlines.length ? ` Korábbi focímek, NE ismételd a megfogalmazást: ${recentHeadlines.join(" | ")}.` : "") +
    ` MA válassz egy ezektol ELTÉRO terméket (más márka/típus/árkategória), és a FOCÍM szöge legyen: „${angle}".`;

  // 2) Klári: gyors piackutatás → kifogástalan, VÁLTOZATOS ajánlat összeállítása.
  const productList = pool.map((p) => ({ id: p.id, name: p.name, priceGross: p.priceGross }));
  const __t0 = Date.now(); // idokorlát-védelem: a szöveg-újrapróbálás ne lépje túl a Vercel 60s limitet
  const research = await klariResearch(productList, klariPersona);
  const composeCtx = research + varietyNote;
  await setAgentStatus("klari", "working", `Mai szög: ${angle} — ajánlat + Luca jóváhagyása…`);
  let deal = await klariCompose(productList, composeCtx, klariPersona, lucaBrief);
  if (!deal) {
    await setAgentStatus("klari", "error", "Nem sikerült ajánlatot összeállítani.");
    return { ran: false, reason: "Klári most nem tudott ajánlatot összeállítani." };
  }

  // Luca elbírálás az aktuális ajánlatra (a termékét a deal-bol keressük ki).
  const judgeFor = (d: NonNullable<typeof deal>) => {
    const p = live.find((x) => x.id === d.product_id) || live[0];
    return lucaJudgeDeal(
      { name: p.name, price: p.priceGross, headline: d.headline, market_note: d.market_note, caption: d.caption, reason: d.reason },
      lucaPersona
    );
  };

  // 3) Luca (kritikusan) elbírálja — ha elutasít, Klári ÚJRA ÉS ÚJRA javít a visszajelzés alapján,
  //    amíg Luca el nem fogadja (nem „holnap új", hanem MOST, ugyanabban a futásban). Felso korlát
  //    a végtelen ciklus ellen; ha addig sem fogadja el, a LEGJOBB verzióval megyünk tovább, hogy
  //    reggel biztosan legyen kész plakát.
  const TEXT_MAX = 3;
  let judge = await judgeFor(deal);
  let critiques = "";
  // A retry EGY invokációban fut → IDOKORLÁT: ha közelít a 60s-hez, a LEGJOBB addigi verzióval
  // megyünk tovább, hogy a plakát biztosan elkészüljön (ne ölje meg a Vercel a függvényt).
  for (let i = 1; i < TEXT_MAX && !judge.approve && Date.now() - __t0 < 42000; i++) {
    await setAgentStatus("klari", "working", `Luca észrevételezte a szöveget — Klári újra nekifut (${i + 1}. próba)…`);
    critiques += "\n\nLUCA KRITIKÁJA (KÖTELEZO kijavítani, ne ismételd a hibát):\n" + judge.verdict;
    const dN = await klariCompose(productList, composeCtx + critiques, klariPersona, lucaBrief);
    if (!dN) break;
    deal = dN;
    judge = await judgeFor(deal);
  }

  // LUCA KORREKTÚRA — a plakátra és az FB-caption-be kerülo magyar szöveg helyesírása/ékezetei.
  // Ékezethibás plakát/poszt SOHA nem mehet ki.
  await setAgentStatus("luca", "working", "Helyesírás és ékezetek ellenorzése a plakát-szövegen…");
  deal.headline = await lucaProofreadHungarian(deal.headline);
  if (deal.caption) deal.caption = await lucaProofreadHungarian(deal.caption);

  const product = live.find((p) => p.id === deal.product_id) || live[0];
  const priceHuf = product.priceGross ? Number(product.priceGross) : undefined;
  const dateLabel = todayLabel();
  const textVerdict = judge.approve
    ? judge.verdict
    : `Luca észrevételei beépítve (legjobb verzió ${TEXT_MAX} próbából): ${judge.verdict}`;

  // A szöveg KÉSZ → 'pending_image' sor + render_data a kép-fázishoz (a kép-fázis Klári addig
  // csinálja a plakátot, amíg Luca vizuálisan is el nem fogadja).
  const renderData: RenderData = {
    productId: product.id,
    productName: product.name,
    productUrl: product.url ?? null,
    imageUrl: product.imageUrl,
    priceHuf,
    headline: deal.headline,
    badges: deal.badges,
    features: deal.features,
    specs: deal.specs,
    dateLabel,
  };
  const posterSvg = buildDealPoster({
    imageUrl: product.imageUrl,
    productName: product.name,
    headline: deal.headline,
    priceHuf,
    badges: deal.badges,
    features: deal.features,
    specs: deal.specs,
    dateLabel,
  });

  const { data: ins } = await sb
    .from("klari_posts")
    .insert({
      product_id: product.id,
      product_name: product.name,
      product_url: product.url ?? null,
      image_url: product.imageUrl ?? null,
      price_huf: priceHuf ?? null,
      market_note: deal.market_note,
      headline: deal.headline,
      caption: deal.caption,
      poster_svg: posterSvg,
      poster_url: null,
      luca_verdict: textVerdict,
      status: "pending_image",
      render_data: renderData,
    })
    .select("id")
    .single();

  await setAgentStatus("klari", "working", `Szöveg kész (${product.name.slice(0, 30)}) — plakát készítése…`);

  return {
    ran: true,
    phase: "text",
    status: "pending_image",
    product: product.name,
    verdict: textVerdict,
    postId: ins?.id,
    renderData,
  };
}

/** 2. FÁZIS — kép: a 'pending_image' sorhoz plakát + Luca VIZUÁLIS QC, majd a sor véglegesítése. */
export async function runKlariImage(opts?: { postId?: number; renderData?: RenderData; attempt?: number }): Promise<KlariResult> {
  const sb = supabaseAdmin();

  // A feldolgozandó sor: postId alapján, vagy a legutóbbi 'pending_image'.
  let row: any = null;
  if (opts?.postId) {
    row = (await sb.from("klari_posts").select("*").eq("id", opts.postId).maybeSingle()).data;
  } else {
    row = (await sb.from("klari_posts").select("*").eq("status", "pending_image").order("id", { ascending: false }).limit(1).maybeSingle()).data;
  }
  if (!row) return { ran: false, reason: "Nincs feldolgozandó (pending_image) plakát." };

  const rd: RenderData | null = opts?.renderData || row.render_data || null;
  if (!rd) {
    await sb.from("klari_posts").update({ status: "rejected", luca_verdict: (row.luca_verdict || "") + " | Hiányzó render_data." }).eq("id", row.id);
    return { ran: false, reason: "Hiányzó render_data a kép-fázishoz." };
  }

  // A sablon csak a logót + szöveget (+ dátumot) teszi rá; a LAPTOP magában a Bria-jelenetben van.
  const base = {
    imageUrl: rd.imageUrl,
    productName: rd.productName,
    headline: rd.headline,
    priceHuf: rd.priceHuf,
    badges: rd.badges,
    features: rd.features,
    specs: rd.specs,
    dateLabel: rd.dateLabel,
  };

  const attempt = opts?.attempt ?? 0; // hányadik próbánál tartunk (0-tól)
  const attemptNo = attempt + 1;
  const posterSource = "bria-scene";

  await setAgentStatus("gyula", "working", `Technikai elokészítés (AI-jelenet, ${attemptNo}. próba): ${rd.productName.slice(0, 22)}…`);
  await setAgentStatus("luca", "working", `Hirdetés elbírálása (${attemptNo}. próba): ${rd.productName.slice(0, 26)}…`);

  // EGY próba per invokáció (a Vercel 60s limit miatt): Gyula AI-jelenet → render → Luca VIZUÁLIS QC.
  let url: string | null = null;
  let approved = false;
  let reason = "";
  if ((process.env.FAL_KEY || higgsfieldEnabled()) && rd.imageUrl) {
    // KÉP-MOTOR: IMAGE_ENGINE=higgsfield → Higgsfield (valódi termék a jelenetben), különben fal.ai.
    // Bármelyik hibázik → visszaesés fal.ai-ra, hogy a napi plakát biztosan elkészüljön.
    const engine = (process.env.IMAGE_ENGINE || "fal").toLowerCase();
    let sceneUrl: string | null = null;
    if (engine === "higgsfield" && higgsfieldEnabled()) {
      const hfPrompt = `Premium e-commerce ad scene for this refurbished business laptop (from the reference image). Bright modern office desk, the laptop large and hero-lit, realistic shadow and reflection so it sits on the desk, deep navy and bright blue accents, clean empty space on the left and bottom for headline/price text. High-end commercial product photography, trustworthy business tone.`;
      sceneUrl = await generateProductSceneHF(rd.imageUrl, hfPrompt, "3:2").catch(() => null);
    }
    if (!sceneUrl) sceneUrl = await generateProductScene(rd.imageUrl).catch(() => null);
    if (!sceneUrl) {
      reason = "Gyula nem tudott AI-jelenetet készíteni (fal hiba).";
    } else {
      url = await renderPosterPng({ ...base, bgUrl: sceneUrl, productInScene: true }).catch(() => null);
      if (!url) {
        reason = "A plakát renderelése nem sikerült.";
      } else {
        const verdict = await lucaReviewPoster(url).catch(() => ({ ok: false, issue: "technikai hiba az elbíráláskor" }));
        if (verdict.ok) approved = true;
        else reason = verdict.issue || "Luca nem hagyta jóvá.";
      }
    }
  } else {
    reason = "Hiányzó FAL_KEY vagy termékfotó — nem készült AI-jelenet.";
  }

  const bestUrl = url || rd.lastPosterUrl || null; // a legjobb eddigi render (fallback-hez)
  const moreTries = attemptNo < MAX_IMAGE_ATTEMPTS; // van-e még próba hátra

  // 1) JÓVÁHAGYVA → publikálás (FB-oldal is) + Telegram + kész.
  if (approved && url) {
    const fbNote = await autopostToFacebook(row, rd, url);
    await sb
      .from("klari_posts")
      .update({
        poster_url: url,
        poster_svg: row.poster_svg || buildDealPoster(base),
        luca_verdict: `${row.luca_verdict} | Luca jóváhagyta a kész hirdetést a ${attemptNo}. próbára (Gyula technikai elokészítése után).${fbNote}`,
        status: "approved",
        render_data: { ...rd, lastPosterUrl: url },
      })
      .eq("id", row.id);
    await setAgentStatus("gyula", "done", `Technikailag kész: ${rd.productName.slice(0, 30)}`);
    await setAgentStatus("luca", "done", `Jóváhagyta a napi hirdetést: ${rd.productName.slice(0, 28)}`);
    await setAgentStatus("klari", "done", `Plakát kész, Luca jóváhagyta (${attemptNo}. próba): ${rd.productName.slice(0, 22)}`);
    const price = rd.priceHuf ? new Intl.NumberFormat("hu-HU").format(Math.round(rd.priceHuf)) + " Ft" : "";
    await sendTelegram(
      `✅ *Luca jóváhagyta a napi hirdetést* (${attemptNo}. próbára).\n\n🖥️ ${rd.productName}\n💰 ${price}\n📅 ${rd.dateLabel || ""}\n\n${url}`
    ).catch(() => {});
    return { ran: true, phase: "image", status: "approved", product: rd.productName, verdict: "Luca jóváhagyta", posterUrl: url, cutoutOk: false, posterSource, falNote: reason, postId: row.id, attempt };
  }

  // 2) NINCS JÓVÁHAGYVA, de VAN MÉG PRÓBA → Klári ÚJRA nekifut (a render route láncolva hívja újra).
  if (moreTries) {
    await sb
      .from("klari_posts")
      .update({
        poster_svg: row.poster_svg || buildDealPoster(base),
        luca_verdict: `${row.luca_verdict} | ${attemptNo}. próba — Luca észrevétele: ${reason} → Klári újra nekifut.`,
        status: "pending_image",
        render_data: { ...rd, lastPosterUrl: bestUrl || undefined },
      })
      .eq("id", row.id);
    await setAgentStatus("gyula", "working", `Új jelenet kell (${attemptNo}. után): ${reason.slice(0, 36)}`);
    await setAgentStatus("luca", "working", `Még nem jó (${attemptNo}. próba): ${reason.slice(0, 36)}`);
    await setAgentStatus("klari", "working", `Luca észrevételezte — Klári újra nekifut (${attemptNo + 1}. próba)…`);
    return { ran: true, phase: "image", status: "pending_image", product: rd.productName, verdict: `Még nem jó: ${reason}`, posterUrl: null, posterSource, falNote: reason, postId: row.id, retry: true, nextAttempt: attemptNo, attempt };
  }

  // 3) ELFOGYTAK A PRÓBÁK → hogy reggel BIZTOSAN legyen kész plakát, a LEGJOBB verzióval publikálunk
  //    (Luca észrevételeivel együtt). Soha nem maradunk plakát nélkül, és nem halasztjuk holnapra.
  const finalUrl = bestUrl;
  const fbNote2 = await autopostToFacebook(row, rd, finalUrl);
  await sb
    .from("klari_posts")
    .update({
      poster_url: finalUrl,
      poster_svg: row.poster_svg || buildDealPoster(base),
      luca_verdict: `${row.luca_verdict} | ${MAX_IMAGE_ATTEMPTS} próba után a legjobb verzió publikálva (Luca utolsó észrevétele: ${reason}).${fbNote2}`,
      status: "approved",
      render_data: { ...rd, lastPosterUrl: finalUrl || undefined },
    })
    .eq("id", row.id);
  await setAgentStatus("gyula", "done", `Kész (legjobb a ${MAX_IMAGE_ATTEMPTS} próbából): ${rd.productName.slice(0, 24)}`);
  await setAgentStatus("luca", "done", `Publikálva (legjobb verzió): ${rd.productName.slice(0, 26)}`);
  await setAgentStatus("klari", "done", `Plakát kész (legjobb a ${MAX_IMAGE_ATTEMPTS} próbából): ${rd.productName.slice(0, 22)}`);
  const price2 = rd.priceHuf ? new Intl.NumberFormat("hu-HU").format(Math.round(rd.priceHuf)) + " Ft" : "";
  await sendTelegram(
    `📌 *Napi hirdetés kész* — ${MAX_IMAGE_ATTEMPTS} próba után a legjobb verzió (Luca utolsó észrevétele: ${reason}).\n\n🖥️ ${rd.productName}\n💰 ${price2}\n📅 ${rd.dateLabel || ""}${finalUrl ? `\n\n${finalUrl}` : "\n\n(A részletes plakát a dashboardon.)"}`
  ).catch(() => {});
  return { ran: true, phase: "image", status: "approved", product: rd.productName, verdict: `Legjobb verzió ${MAX_IMAGE_ATTEMPTS} próbából (utolsó észrevétel: ${reason})`, posterUrl: finalUrl, posterSource, falNote: reason, postId: row.id, attempt };
}

/** Kényelmi wrapper (mindkét fázis egy folyamatban) — kézi/lokális használatra. A Vercel route a kétlépcsost használja.
 *  Itt is ADDIG ismétli a kép-fázist, amíg Luca el nem fogadja (vagy el nem fogynak a próbák). */
export async function runKlariDaily(): Promise<KlariResult> {
  const t = await runKlariText();
  if (t.status !== "pending_image") return t;
  let r = await runKlariImage({ postId: t.postId, renderData: t.renderData });
  while (r.retry && r.nextAttempt !== undefined) {
    r = await runKlariImage({ postId: t.postId, attempt: r.nextAttempt });
  }
  return r;
}
