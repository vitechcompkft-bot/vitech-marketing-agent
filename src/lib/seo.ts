import { supabaseAdmin } from "./supabase";
import { unasLogin, unasGetProducts, unasSetProductSeo } from "./unas";
import { generateSeo } from "./claude";

export interface SeoAuditResult {
  ran: boolean;
  reason?: string;
  autoApply?: boolean;
  start?: number;
  checked?: number;
  applied?: number;
  proposed?: number;
  items?: { applied: string[]; proposed: string[] };
}

/**
 * SEO-átvilágítás egy adag termékre. Önálló (auto_guardrails) módban Luca
 * MAGÁTÓL átírja az Unasban a gyengébb SEO-t; egyébként javaslatot tesz.
 * A haladást a meglévo seo_update akciók száma adja (lapozó kurzor) — így
 * minden futás a következo termékeken dolgozik, a végén körbeér.
 */
export async function runSeoAudit(opts?: { limit?: number }): Promise<SeoAuditResult> {
  const limit = Math.min(opts?.limit ?? 5, 15);
  const sb = supabaseAdmin();

  const { data: cfg } = await sb.from("agent_config").select("*").eq("id", 1).single();
  if (!cfg) return { ran: false, reason: "Nincs konfiguráció." };
  if (!cfg.agent_enabled) return { ran: false, reason: "Az Agent ki van kapcsolva (vész-leállító)." };

  const autoApply = cfg.autonomy_level === "auto_guardrails";
  const persona = { name: cfg.agent_name, persona: cfg.agent_persona };

  // Kurzor: ennyi terméket néztünk már át (minden átnézett termék kap egy seo_update sort).
  const { count } = await sb.from("actions").select("id", { count: "exact", head: true }).eq("type", "seo_update");
  let start = count || 0;

  const token = await unasLogin();
  let products = await unasGetProducts(token, { limitNum: 30, limitStart: start });
  if (!products.length && start > 0) {
    start = 0; // körbeértünk → újrakezdjük a katalógus elejétol (frissítjük a régieket)
    products = await unasGetProducts(token, { limitNum: 30, limitStart: 0 });
  }

  const applied: string[] = [];
  const proposed: string[] = [];
  let checked = 0;

  for (const p of products) {
    if (checked >= limit) break;

    // Dedup: amit már átnéztünk, kihagyjuk.
    const { data: dup } = await sb
      .from("actions")
      .select("id")
      .eq("type", "seo_update")
      .eq("params->>product_id", p.id)
      .limit(1);
    if (dup && dup.length) continue;

    checked++;
    const seo = await generateSeo(
      {
        name: p.name,
        priceGross: p.priceGross,
        currentTitle: p.metaTitle,
        currentDescription: p.metaDescription,
        currentKeywords: p.metaKeywords,
      },
      persona
    );
    const params = {
      product_id: p.id,
      product_name: p.name,
      title: seo.title,
      description: seo.description,
      keywords: seo.keywords,
    };

    if (!seo.improve) {
      // Megjelöljük átnézettként (nincs érdemi javítás), hogy ne nézzük újra.
      await sb.from("actions").insert({
        type: "seo_update",
        campaign_id: null,
        campaign_name: p.name,
        params,
        reasoning: seo.reason || "A jelenlegi SEO megfelelo.",
        autonomous: true,
        status: "rejected",
        result: "Nincs érdemi javítás.",
      });
      continue;
    }

    if (autoApply) {
      const r = await unasSetProductSeo(token, p.id, {
        title: seo.title,
        description: seo.description,
        keywords: seo.keywords,
      });
      await sb.from("actions").insert({
        type: "seo_update",
        campaign_id: null,
        campaign_name: p.name,
        params,
        reasoning: seo.reason,
        autonomous: true,
        status: r.ok ? "executed" : "failed",
        result: r.message,
        executed_at: new Date().toISOString(),
      });
      if (r.ok) applied.push(p.name);
    } else {
      await sb.from("actions").insert({
        type: "seo_update",
        campaign_id: null,
        campaign_name: p.name,
        params,
        reasoning: seo.reason,
        autonomous: false,
        status: "proposed",
      });
      proposed.push(p.name);
    }
  }

  return { ran: true, autoApply, start, checked, applied: applied.length, proposed: proposed.length, items: { applied, proposed } };
}
