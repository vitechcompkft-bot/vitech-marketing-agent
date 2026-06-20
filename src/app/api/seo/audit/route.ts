import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { unasLogin, unasGetProducts } from "@/lib/unas";
import { generateSeo } from "@/lib/claude";
import { getConfig } from "@/lib/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * SEO-átvilágítás: Luca végignéz egy adag terméket, és ahol érdemben javítható,
 * SEO-javaslatot (seo_update) készít. A javaslatok a dashboardon + napi jelentésben
 * jelennek meg jóváhagyásra. (Késobb auto-alkalmazás is bekapcsolható.)
 *
 * Hívás: GET /api/seo/audit?limit=5&start=0   (Bearer CRON_SECRET)
 *   limit = max ennyi ÚJ javaslat egy futásban
 *   start = honnan kezdje a termékek lapozását (offset)
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || 5), 15);
  const start = Number(req.nextUrl.searchParams.get("start") || 0);

  try {
    const sb = supabaseAdmin();
    const config = await getConfig();
    const token = await unasLogin();
    const products = await unasGetProducts(token, { limitNum: 30, limitStart: start });

    const persona = { name: config.agent_name, persona: config.agent_persona };
    const proposed: string[] = [];
    let processed = 0;

    for (const p of products) {
      if (proposed.length >= limit) break;
      if (processed >= limit * 2) break; // Claude-hívások felso korlátja

      // Dedup: ne javasoljunk ugyanarra a termékre kétszer.
      const { data: dup } = await sb
        .from("actions")
        .select("id")
        .eq("type", "seo_update")
        .eq("params->>product_id", p.id)
        .limit(1);
      if (dup && dup.length) continue;

      processed++;
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
      if (!seo.improve) continue;

      await sb.from("actions").insert({
        type: "seo_update",
        campaign_id: null,
        campaign_name: p.name,
        params: {
          product_id: p.id,
          product_name: p.name,
          title: seo.title,
          description: seo.description,
          keywords: seo.keywords,
        },
        reasoning: seo.reason,
        autonomous: false,
        status: "proposed",
      });
      proposed.push(p.name);
    }

    return NextResponse.json({
      ok: true,
      scanned: products.length,
      checked: processed,
      proposed: proposed.length,
      items: proposed,
      nextStart: start + products.length,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}
