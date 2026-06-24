import { supabaseAdmin } from "./supabase";
import { unasLogin, unasGetProducts } from "./unas";
import { klariResearch, klariCompose, lucaJudgeDeal, lucaReviewPoster } from "./claude";
import { generateProductScene } from "./falai";
import { buildDealPoster } from "./creatives";
import { renderPosterPng } from "./poster";
import { setAgentStatus } from "./team";
import { sendTelegram } from "./telegram";

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
}

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
}

/**
 * KÉTLÉPCSOS futás (Vercel Hobby 60s limit miatt):
 *  - runKlariText(): kutatás → ajánlat-szöveg → Luca jóváhagyás → 'pending_image' sor (gyors).
 *  - runKlariImage(): kivágás → render → Luca VIZUÁLIS QC → sor frissítése (gyors).
 * A két fázis KÜLÖN HTTP-invokáció, mindegyiknek saját 60s budget-je van.
 */

/** 1. FÁZIS — szöveg: a legjobb ajánlat + Luca jóváhagyás, majd 'pending_image' sor mentése. */
export async function runKlariText(): Promise<KlariResult> {
  const sb = supabaseAdmin();
  const { data: cfg } = await sb.from("agent_config").select("*").eq("id", 1).single();
  if (!cfg) return { ran: false, reason: "Nincs konfiguráció." };
  if (!cfg.agent_enabled) return { ran: false, reason: "Az Agent ki van kapcsolva (vész-leállító)." };

  const klariPersona = { name: "Klári", persona: cfg.klari_persona || "Lelkes, kreatív marketinges." };
  const lucaPersona = { name: cfg.agent_name, persona: cfg.agent_persona };

  await setAgentStatus("klari", "working", "Piackutatás a legjobb ajánlathoz…");

  // 1) Termékek (egy adag a katalógusból)
  const token = await unasLogin();
  const products = await unasGetProducts(token, { limitNum: 40, limitStart: 0 });
  const live = products.filter((p) => p.priceGross && p.name);
  if (!live.length) {
    await setAgentStatus("klari", "error", "Nincs feldolgozható termék az Unasból.");
    return { ran: false, reason: "Nincs feldolgozható termék." };
  }

  // 2) Klári: gyors piackutatás (web-keresés, szabad szöveg) → kifogástalan ajánlat összeállítása (eros modell).
  const productList = live.map((p) => ({ id: p.id, name: p.name, priceGross: p.priceGross }));
  const research = await klariResearch(productList, klariPersona);
  await setAgentStatus("klari", "working", "Ajánlat összeállítása + Luca jóváhagyása…");
  let deal = await klariCompose(productList, research, klariPersona);
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

  // 3) Luca (kritikusan) elbírálja — ha elutasít, Klári EGYSZER javít a visszajelzés alapján (keresés nélkül).
  let judge = await judgeFor(deal);
  if (!judge.approve) {
    const d2 = await klariCompose(
      productList,
      research + "\n\nLUCA KORÁBBI KRITIKÁJA (KÖTELEZO kijavítani, ne ismételd a hibát):\n" + judge.verdict,
      klariPersona
    );
    if (d2) {
      deal = d2;
      judge = await judgeFor(deal);
    }
  }

  const product = live.find((p) => p.id === deal.product_id) || live[0];
  const priceHuf = product.priceGross ? Number(product.priceGross) : undefined;

  // Ha Luca a szöveget elutasítja → 'rejected' sor, kép-fázis nem kell.
  if (!judge.approve) {
    await sb.from("klari_posts").insert({
      product_id: product.id,
      product_name: product.name,
      product_url: product.url ?? null,
      image_url: product.imageUrl ?? null,
      price_huf: priceHuf ?? null,
      market_note: deal.market_note,
      headline: deal.headline,
      caption: deal.caption,
      poster_svg: null,
      poster_url: null,
      luca_verdict: judge.verdict,
      status: "rejected",
    });
    await setAgentStatus("klari", "waiting", "Luca elutasította a szöveget — holnap új javaslat");
    return { ran: true, phase: "text", status: "rejected", product: product.name, verdict: judge.verdict };
  }

  // Jóváhagyott szöveg → 'pending_image' sor + render_data a kép-fázishoz.
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
  };
  const posterSvg = buildDealPoster({
    imageUrl: product.imageUrl,
    productName: product.name,
    headline: deal.headline,
    priceHuf,
    badges: deal.badges,
    features: deal.features,
    specs: deal.specs,
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
      luca_verdict: judge.verdict,
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
    verdict: judge.verdict,
    postId: ins?.id,
    renderData,
  };
}

/** 2. FÁZIS — kép: a 'pending_image' sorhoz plakát + Luca VIZUÁLIS QC, majd a sor véglegesítése. */
export async function runKlariImage(opts?: { postId?: number; renderData?: RenderData }): Promise<KlariResult> {
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

  // A sablon csak a logót + szöveget teszi rá; a LAPTOP magában a Bria-jelenetben van (productInScene).
  const base = {
    imageUrl: rd.imageUrl,
    productName: rd.productName,
    headline: rd.headline,
    priceHuf: rd.priceHuf,
    badges: rd.badges,
    features: rd.features,
    specs: rd.specs,
  };

  let posterUrl: string | null = null;
  const posterSource = "bria-scene";
  let approved = false;
  let reason = "";

  await setAgentStatus("gyula", "working", `Technikai elokészítés (AI-jelenet): ${rd.productName.slice(0, 26)}…`);
  await setAgentStatus("luca", "working", `Hirdetés elbírálása: ${rd.productName.slice(0, 30)}…`);

  // 1) GYULA (technikai) a Bria product-shottal a VALÓDI terméket az ASZTALRA teszi → render.
  //    Majd LUCA (marketing fonök) hozza a VÉGSO döntést. Max 2 próba.
  if (process.env.FAL_KEY && rd.imageUrl) {
    for (let attempt = 0; attempt < 2 && !approved; attempt++) {
      const sceneUrl = await generateProductScene(rd.imageUrl).catch(() => null);
      if (!sceneUrl) {
        reason = "Gyula nem tudott AI-jelenetet készíteni (fal hiba).";
        continue;
      }
      const url = await renderPosterPng({ ...base, bgUrl: sceneUrl, productInScene: true }).catch(() => null);
      if (!url) {
        reason = "A plakát renderelése nem sikerült.";
        continue;
      }
      const verdict = await lucaReviewPoster(url).catch(() => ({ ok: false, issue: "technikai hiba az elbíráláskor" }));
      if (verdict.ok) {
        posterUrl = url;
        approved = true;
      } else {
        reason = verdict.issue || "Luca nem hagyta jóvá.";
      }
    }
  } else {
    reason = "Hiányzó FAL_KEY vagy termékfotó — nem készült AI-jelenet.";
  }

  // 2) Eredmény mentése: CSAK Luca (marketing fonök) jóváhagyásával publikálunk.
  await sb
    .from("klari_posts")
    .update({
      poster_url: approved ? posterUrl : null,
      poster_svg: row.poster_svg || buildDealPoster(base),
      luca_verdict: approved
        ? `${row.luca_verdict} | Luca jóváhagyta a kész hirdetést (Gyula technikai elokészítése után).`
        : `${row.luca_verdict} | Luca NEM hagyta jóvá: ${reason}`,
      status: approved ? "approved" : "rejected",
    })
    .eq("id", row.id);

  await setAgentStatus(
    "gyula",
    approved ? "done" : "working",
    approved ? `Technikailag kész: ${rd.productName.slice(0, 30)}` : `Technikai javítás kell: ${reason.slice(0, 40)}`
  );
  await setAgentStatus(
    "luca",
    approved ? "done" : "waiting",
    approved ? `Jóváhagyta a napi hirdetést: ${rd.productName.slice(0, 28)}` : `Elutasította: ${reason.slice(0, 40)}`
  );
  await setAgentStatus(
    "klari",
    approved ? "done" : "waiting",
    approved ? `Plakát kész, Luca jóváhagyta: ${rd.productName.slice(0, 26)}` : "Luca elutasította — holnap új próba"
  );

  // 3) LUCA (a döntnök) Telegramon szól, HA jóváhagyta a hirdetést.
  if (approved && posterUrl) {
    const price = rd.priceHuf ? new Intl.NumberFormat("hu-HU").format(Math.round(rd.priceHuf)) + " Ft" : "";
    await sendTelegram(
      `✅ *Luca jóváhagyta a napi hirdetést* (Gyula technikai elokészítése után).\n\n🖥️ ${rd.productName}\n💰 ${price}\n\n${posterUrl}`
    ).catch(() => {});
  }

  return {
    ran: true,
    phase: "image",
    status: approved ? "approved" : "rejected",
    product: rd.productName,
    verdict: approved ? "Luca jóváhagyta" : `Luca elutasította: ${reason}`,
    posterUrl,
    cutoutOk: false,
    posterSource,
    falNote: reason,
    postId: row.id,
  };
}

/** Kényelmi wrapper (mindkét fázis egy folyamatban) — kézi/lokális használatra. A Vercel route a kétlépcsost használja. */
export async function runKlariDaily(): Promise<KlariResult> {
  const t = await runKlariText();
  if (t.status === "pending_image") {
    return await runKlariImage({ postId: t.postId, renderData: t.renderData });
  }
  return t;
}
