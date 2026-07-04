import { NextRequest, NextResponse } from "next/server";
import { unasLogin, unasGetProducts } from "@/lib/unas";
import { pickLiveProducts } from "@/lib/productLive";
import { generateProductScene } from "@/lib/falai";
import { renderDealPosterOG } from "@/lib/ogPoster";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * DIAGNOSZTIKA: a KLÁRI „deal" plakát ÚJ (next/og) kinézetének elonézete — valódi ÉLO termék + Bria-jelenet
 * + overlay, POSZTOLÁS NÉLKÜL. Csak ellenorzésre. Védelem: Authorization: Bearer <CRON_SECRET>.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  try {
    const token = await unasLogin();
    const products = await unasGetProducts(token, { limitNum: 80, limitStart: 0 });
    const cand = products.filter((p) => p.priceGross && p.name && p.url && p.imageUrl);
    const live = await pickLiveProducts([...cand].sort(() => Math.random() - 0.5), 1, 16);
    const p = live[0];
    if (!p) return NextResponse.json({ ok: false, error: "nincs élo termék" });
    const scene = await generateProductScene(p.imageUrl!);
    if (!scene) return NextResponse.json({ ok: false, error: "nincs jelenet (Bria)" });
    const url = await renderDealPosterOG({
      bgUrl: scene,
      headline: "Megbízható üzleti laptop",
      priceHuf: Number(p.priceGross),
      badges: ["FELÚJÍTVA", "12 HÓ GARANCIA", "BEVIZSGÁLVA"],
    });
    return NextResponse.json({ ok: !!url, url, product: p.name, productUrl: p.url });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
