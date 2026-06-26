import { NextRequest, NextResponse } from "next/server";
import { unasLogin, unasGetOrdersRaw } from "@/lib/unas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * ÁTMENETI felderíto végpont: egy rendelés NYERS Unas XML-je (a számlázáshoz a mezok feltérképezéséhez).
 * Védelem: ?key=CRON_SECRET. A feltérképezés után törlendo.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.nextUrl.searchParams.get("key") !== secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Jogosulatlan" }, { status: 401 });
  }
  try {
    const token = await unasLogin();
    const limit = Number(req.nextUrl.searchParams.get("n") || 1);
    const xml = await unasGetOrdersRaw(token, { limitNum: limit });
    return new NextResponse(xml, { headers: { "content-type": "text/plain; charset=utf-8" } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "hiba" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
