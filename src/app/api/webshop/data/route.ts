import { NextRequest, NextResponse } from "next/server";
import { getWebshopData } from "@/lib/webshop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** A Webshop-oldal adatai JSON-ban (ellenorzéshez/integrációhoz). Védelem: Bearer <CRON_SECRET> vagy Basic Auth. */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  const d = await getWebshopData();
  return NextResponse.json({
    ok: d.ok,
    lastSyncAt: d.lastSyncAt,
    kpis: d.kpis,
    ordersSample: d.orders.slice(0, 5),
    customersSample: d.customers.slice(0, 5),
  });
}

export const GET = handle;
export const POST = handle;
