import { NextRequest, NextResponse } from "next/server";
import { markOrdersInvoiced } from "@/lib/billingo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Rendelések KÉZI megjelölése „számlázottként" (külso/korábbi számlák) — zöld jelzés a dashboardon,
 * újraszámlázás letiltva. NEM hoz létre Billingo-számlát. Védelem: ?key=CRON_SECRET.
 * Body: { keys: ["64089-100006", ...] }  vagy  { entries: [{ key, invoiceNumber?, invoiceId?, publicUrl? }] }
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.nextUrl.searchParams.get("key") !== secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const entries =
      Array.isArray(body?.entries) && body.entries.length
        ? body.entries
        : Array.isArray(body?.keys)
        ? body.keys.map((k: string) => ({ key: String(k) }))
        : [];
    if (!entries.length) return NextResponse.json({ ok: false, error: "Nincs megjelölendo rendelés (keys/entries)." }, { status: 400 });
    const res = await markOrdersInvoiced(entries);
    return NextResponse.json(res);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
