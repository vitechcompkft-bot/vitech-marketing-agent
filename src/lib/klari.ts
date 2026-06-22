import { supabaseAdmin } from "./supabase";
import { unasLogin, unasGetProducts } from "./unas";
import { klariResearch, klariCompose, lucaJudgeDeal, lucaReviewPoster } from "./claude";
import { buildDealPoster } from "./creatives";
import { renderPosterPng } from "./poster";
import { removeBg } from "./removebg";
import { setAgentStatus } from "./team";

export interface KlariResult {
  ran: boolean;
  reason?: string;
  status?: "approved" | "rejected";
  product?: string;
  verdict?: string;
  posterUrl?: string | null;
  cutoutOk?: boolean;
  posterSource?: string;
  falNote?: string;
}

/**
 * KLÁRI napi feladata (reggel 7):
 *  1) Beolvas egy adag Vitech terméket (ár + fotó).
 *  2) Web-kereséssel megkeresi a piachoz képest legjobb áru ajánlatot + plakát-szöveget.
 *  3) Eloterjeszti LUCÁNAK, aki jóváhagyja vagy elutasítja.
 *  4) Jóváhagyás esetén plakátot készít (termékfotóval) → a dashboardon posztolásra kész.
 * Klári mindig Lucának jelent. (A Facebook-posztolást egyelore te végzed egy kattintással.)
 */
export async function runKlariDaily(): Promise<KlariResult> {
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

  // 4) Jóváhagyás esetén plakát: elsodlegesen PROFI renderelt PNG (htmlcsstoimage),
  //    SVG mindig fallbacknek (ha nincs HCTI kulcs).
  let posterSvg: string | null = null;
  let posterUrl: string | null = null;
  let cutoutOk = false;
  let posterSource = "template";
  let falNote = "";
  let visualOk = true;
  if (judge.approve) {
    // Prémium STÚDIÓ-plakát: valódi termék kivágva, tükrözodéssel + árnyékkal a felületen áll (nem lebeg).
    const cutout = product.imageUrl ? await removeBg(product.imageUrl).catch(() => null) : null;
    cutoutOk = !!cutout;
    const base = {
      imageUrl: product.imageUrl,
      cutout: cutout || undefined,
      productName: product.name,
      headline: deal.headline,
      priceHuf,
      badges: deal.badges,
      features: deal.features,
      specs: deal.specs,
    };
    posterSvg = buildDealPoster(base);
    posterUrl = await renderPosterPng(base).catch(() => null);
    posterSource = "studio";

    // Luca SZIGORÚ vizuális ellenorzés: ha a termék lebeg / nem valós kinézetu → NEM hagyja jóvá.
    if (posterUrl) {
      const qc = await lucaReviewPoster(posterUrl).catch(() => ({ ok: true, issue: "" }));
      if (!qc.ok) {
        visualOk = false;
        falNote = "Luca vizuálisan elvetette: " + qc.issue;
      }
    }
  }
  const approved = judge.approve && visualOk;

  await sb.from("klari_posts").insert({
    product_id: product.id,
    product_name: product.name,
    product_url: product.url ?? null,
    image_url: product.imageUrl ?? null,
    price_huf: priceHuf ?? null,
    market_note: deal.market_note,
    headline: deal.headline,
    caption: deal.caption,
    poster_svg: posterSvg,
    poster_url: approved ? posterUrl : null,
    luca_verdict: visualOk ? judge.verdict : `${judge.verdict} | ${falNote}`,
    status: approved ? "approved" : "rejected",
  });

  await setAgentStatus(
    "klari",
    approved ? "done" : "waiting",
    approved
      ? `Kész: ${product.name.slice(0, 38)} — plakát posztolásra kész`
      : visualOk
      ? "Luca elutasította a szöveget — holnap új javaslat"
      : "Luca elvetette a plakátot (vizuális) — újra próbálom"
  );

  return {
    ran: true,
    status: approved ? "approved" : "rejected",
    product: product.name,
    verdict: judge.verdict,
    posterUrl,
    cutoutOk,
    posterSource,
    falNote,
  };
}
