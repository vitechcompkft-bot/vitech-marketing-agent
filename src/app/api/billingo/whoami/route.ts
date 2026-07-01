import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Diagnosztika: MELYIK Billingo-fiókot látja az APP kulcsa (BILLINGO_API_KEY a Vercelen)?
 * A dashboard Basic Auth-ja védi. A kulcsot NEM adja vissza, csak egy rövid ujjlenyomatot,
 * plusz az adószámot + előfizetést, hogy kiderüljön, a helyes (fizetos) fiók van-e beállítva.
 */
export async function GET() {
  const key = process.env.BILLINGO_API_KEY;
  if (!key) return NextResponse.json({ ok: false, error: "Nincs BILLINGO_API_KEY beállítva a Vercelen." });
  try {
    const res = await fetch("https://api.billingo.hu/v3/organization", {
      headers: { "X-API-KEY": key, Accept: "application/json" },
      cache: "no-store",
    });
    const body: any = await res.json().catch(() => null);
    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      keyHint: key.slice(0, 4) + "…" + key.slice(-4),
      tax_code: body?.tax_code ?? null,
      subscription: body?.subscription ?? null,
      has_nav_connection: body?.has_nav_connection ?? null,
      raw: res.ok ? undefined : body,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "hiba" });
  }
}
