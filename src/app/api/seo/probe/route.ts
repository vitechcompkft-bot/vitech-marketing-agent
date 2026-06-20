import { NextRequest, NextResponse } from "next/server";
import { unasLogin, unasGetProductsRaw } from "@/lib/unas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Egyszeri felderíto végpont: bejelentkezik az Unas API-ba, lekér 1 terméket,
 * és visszaadja a nyers XML eleje részét — hogy lássuk a SEO-mezok pontos nevét.
 * Védelem: Authorization: Bearer <CRON_SECRET>.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  try {
    const token = await unasLogin();
    const xml = await unasGetProductsRaw(token, { limitNum: 1, contentType: "full" });
    return NextResponse.json(
      { ok: true, tokenLen: token.length, sample: xml.slice(0, 6000) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}
