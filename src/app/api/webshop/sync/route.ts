import { NextRequest, NextResponse } from "next/server";
import { syncWebshopOrders } from "@/lib/webshop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Webshop-rendelések frissítése az Unasból. A helyi health-agent 2 percenként hívja, de a throttle
 * miatt csak 30 percenként fut le ténylegesen (force=1 megkerüli). Védelem: Bearer <CRON_SECRET>.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  // Elfogadjuk: (a) a helyi agent/cron Bearer titkát, VAGY (b) a dashboardból jövo, Basic Auth-tal
  // hitelesített böngészo-hívást (a „Frissítés most" gomb). Titok hiányában nyitva (önkizárás-védelem).
  const allowed = !secret || auth === `Bearer ${secret}` || auth.startsWith("Basic ");
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  try {
    const force = req.nextUrl.searchParams.get("force") === "1";
    const r = await syncWebshopOrders(force);
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
