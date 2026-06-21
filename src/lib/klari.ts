import { supabaseAdmin } from "./supabase";
import { unasLogin, unasGetProducts } from "./unas";
import { klariFindDeal, lucaJudgeDeal } from "./claude";
import { buildDealPoster } from "./creatives";

export interface KlariResult {
  ran: boolean;
  reason?: string;
  status?: "approved" | "rejected";
  product?: string;
  verdict?: string;
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

  // 1) Termékek (egy adag a katalógusból)
  const token = await unasLogin();
  const products = await unasGetProducts(token, { limitNum: 40, limitStart: 0 });
  const live = products.filter((p) => p.priceGross && p.name);
  if (!live.length) return { ran: false, reason: "Nincs feldolgozható termék." };

  // 2) Klári (saját személyiségével): legjobb áru ajánlat + plakát-tartalom (web-kereséssel)
  const deal = await klariFindDeal(
    live.map((p) => ({ id: p.id, name: p.name, priceGross: p.priceGross })),
    klariPersona
  );
  if (!deal) return { ran: false, reason: "Klári most nem talált megfelelo ajánlatot." };

  const product = live.find((p) => p.id === deal.product_id) || live[0];
  const priceHuf = product.priceGross ? Number(product.priceGross) : undefined;

  // 3) Luca (kritikusan) elbírálja
  const judge = await lucaJudgeDeal(
    {
      name: product.name,
      price: product.priceGross,
      headline: deal.headline,
      market_note: deal.market_note,
      caption: deal.caption,
      reason: deal.reason,
    },
    lucaPersona
  );

  // 4) Jóváhagyás esetén gazdag plakát (logó + spec + fotó + ár)
  const posterSvg = judge.approve
    ? buildDealPoster({
        imageUrl: product.imageUrl,
        productName: product.name,
        headline: deal.headline,
        priceHuf,
        badges: deal.badges,
        features: deal.features,
        specs: deal.specs,
      })
    : null;

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
    luca_verdict: judge.verdict,
    status: judge.approve ? "approved" : "rejected",
  });

  return {
    ran: true,
    status: judge.approve ? "approved" : "rejected",
    product: product.name,
    verdict: judge.verdict,
  };
}
