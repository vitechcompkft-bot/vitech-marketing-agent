import { NextRequest, NextResponse } from "next/server";
import { unasLogin, unasGetOrderByKey } from "@/lib/unas";
import { createInvoiceForOrder } from "@/lib/billingo";
import { sendTelegram } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ft = (n: number) => new Intl.NumberFormat("hu-HU").format(Math.round(n)) + " Ft";

/**
 * Számla KIÁLLÍTÁSA egy webshop-rendelésbol a Billingóban (jóváhagyás után hívja a UI).
 * DUPLIKÁCIÓ-VÉDETT (a már kiszámlázott rendelésre nem készít újat).
 * A dashboard Basic Auth-ja védi.
 */
export async function POST(req: NextRequest) {
  try {
    const { orderKey, edits } = await req.json();
    if (!orderKey) return NextResponse.json({ ok: false, error: "Hiányzó rendelésszám." }, { status: 400 });
    const token = await unasLogin();
    const order = await unasGetOrderByKey(token, String(orderKey));
    if (!order) return NextResponse.json({ ok: false, error: "A rendelés nem található." }, { status: 404 });

    const result = await createInvoiceForOrder(order, edits);

    if (result.ok && !result.alreadyInvoiced && result.invoiceNumber) {
      await sendTelegram(
        `🧾 *Számla kiállítva* (webshop rendelés #${order.key})\n${result.invoiceNumber} · ${ft(order.sumGross)}${result.publicUrl ? `\n${result.publicUrl}` : ""}`
      ).catch(() => {});
    }
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}
