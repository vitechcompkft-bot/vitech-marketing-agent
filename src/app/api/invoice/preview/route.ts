import { NextRequest, NextResponse } from "next/server";
import { unasLogin, unasGetOrderByKey } from "@/lib/unas";
import { buildInvoicePreview } from "@/lib/billingo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Számla-ELONÉZET egy webshop-rendeléshez (a kiállítás ELOTT, jóváhagyásra).
 * A dashboard Basic Auth-ja védi (a böngészo automatikusan küldi a hitelesítést).
 */
export async function POST(req: NextRequest) {
  try {
    const { orderKey } = await req.json();
    if (!orderKey) return NextResponse.json({ ok: false, error: "Hiányzó rendelésszám." }, { status: 400 });
    const token = await unasLogin();
    const order = await unasGetOrderByKey(token, String(orderKey));
    if (!order) return NextResponse.json({ ok: false, error: "A rendelés nem található." }, { status: 404 });
    const preview = await buildInvoicePreview(order);
    return NextResponse.json(preview);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}
