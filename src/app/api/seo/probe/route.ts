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
    // A nagy blokkokat kivágjuk, hogy a SEO/Meta mezok láthatóak legyenek.
    const trimmed = xml
      .replace(/<Description>[\s\S]*?<\/Description>/g, "<Description>…</Description>")
      .replace(/<Params>[\s\S]*?<\/Params>/g, "<Params>…</Params>")
      .replace(/<Images>[\s\S]*?<\/Images>/g, "<Images>…</Images>")
      .replace(/<History>[\s\S]*?<\/History>/g, "<History>…</History>")
      .replace(/<Stocks>[\s\S]*?<\/Stocks>/g, "<Stocks>…</Stocks>");
    // A SEO-szempontból érdekes tag-neveket is kigyujtjük.
    const tagNames = Array.from(new Set((trimmed.match(/<([A-Za-z_]+)>/g) || []).map((t) => t.replace(/[<>]/g, ""))));
    return NextResponse.json(
      { ok: true, tokenLen: token.length, tags: tagNames, sample: trimmed.slice(0, 7000) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}
