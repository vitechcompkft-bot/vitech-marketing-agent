import { NextRequest, NextResponse } from "next/server";
import { unasLogin, unasGetOrdersRaw } from "@/lib/unas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 40;

/**
 * DIAGNOSZTIKA: honnan derül ki, hogy egy rendelés SZÁMLÁZVA lett?
 * (a) Unas rendelés nyers XML-je (van-e rajta számla-szám/flag),
 * (b) Billingo dokumentumok (hordozzák-e a rendelésszámot / hogyan köthetok a rendeléshez).
 * Védelem: Bearer <CRON_SECRET>.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (secret && auth !== `Bearer ${secret}` && !auth.startsWith("Basic ")) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  const out: any = {};

  // (a) Unas — egy legutóbbi rendelés teljes nyers XML-je (a számla-mezok felderítéséhez).
  try {
    const token = await unasLogin();
    const raw = await unasGetOrdersRaw(token, { limitNum: 1 });
    out.unasOrderRaw = raw.slice(0, 6000);
    // számla-gyanús tag-ek keresése
    out.unasInvoiceTags = (raw.match(/<[^>]*[Ii]nvoic[^>]*>/g) || []).slice(0, 40);
  } catch (e: any) {
    out.unasError = e?.message || "hiba";
  }

  // (b) Billingo — legutóbbi számlák (bármely státusz), a mezok + rendelés-kötés vizsgálatához.
  try {
    const key = process.env.BILLINGO_API_KEY;
    if (!key) {
      out.billingo = "nincs BILLINGO_API_KEY";
    } else {
      const res = await fetch("https://api.billingo.hu/v3/documents?type=invoice&per_page=10", {
        headers: { "X-API-KEY": key, Accept: "application/json" },
        cache: "no-store",
      });
      const j = await res.json();
      const docs = j?.data || [];
      out.billingoCount = docs.length;
      out.billingoFirstFull = docs[0] || null; // TELJES elso dokumentum (settings/partner/tags megtekintéshez)
      out.billingoSample = docs.slice(0, 8).map((d: any) => ({
        invoice_number: d.invoice_number,
        partner: d.partner?.name,
        gross_total: d.gross_total,
        invoice_date: d.invoice_date,
        settings: d.settings,
        tags: d.tags,
      }));
    }
  } catch (e: any) {
    out.billingoError = e?.message || "hiba";
  }

  return NextResponse.json({ ok: true, ...out });
}

export const GET = handle;
export const POST = handle;
