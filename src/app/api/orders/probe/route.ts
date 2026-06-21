import { NextRequest, NextResponse } from "next/server";
import { unasLogin, unasGetOrdersRaw } from "@/lib/unas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Felderíto végpont: lekér néhány rendelést az Unasból, és visszaadja a nyers XML
 * lecsupaszított elejét + a tag-neveket, hogy lássuk a rendelés-mezok szerkezetét.
 * Védelem: Authorization: Bearer <CRON_SECRET>.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  try {
    const token = await unasLogin();
    const xml = await unasGetOrdersRaw(token, { limitNum: 2 });
    const trimmed = xml
      .replace(/<Items>[\s\S]*?<\/Items>/g, "<Items>…</Items>")
      .replace(/<History>[\s\S]*?<\/History>/g, "<History>…</History>");
    const tags = Array.from(new Set((trimmed.match(/<([A-Za-z_]+)>/g) || []).map((t) => t.replace(/[<>]/g, ""))));
    return NextResponse.json(
      { ok: true, tags, sample: trimmed.slice(0, 6000) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}
