import { NextRequest, NextResponse } from "next/server";
import { renderLifestylePosterPng, getLastLifestyleRenderError } from "@/lib/poster";
import { addPremiumPoster } from "@/lib/premium";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 40;

/**
 * Egy PRÉMIUM (kézzel generált) jelenet-képre ráteszi a Vitech-brandet (gradiens + focím + alcím + logó + CTA)
 * a saját next/og renderelovel. A prémium lifestyle-plakát-rendszer alapja. Védelem: Bearer <CRON_SECRET>.
 * Body/query: bg (kép URL), headline, sub.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  const q = req.nextUrl.searchParams;
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* query-bol is mehet */
  }
  const bg = body.bg || q.get("bg") || "";
  const headline = body.headline || q.get("headline") || "";
  const sub = body.sub || q.get("sub") || "";
  if (!bg) return NextResponse.json({ ok: false, error: "hiányzó bg kép-URL" }, { status: 400 });
  const url = await renderLifestylePosterPng({ bgUrl: bg, headline, sub });
  if (!url) return NextResponse.json({ ok: false, error: getLastLifestyleRenderError() });
  // A kész, rámárkázott plakát felkerül JÓVÁHAGYÁSRA a /plakatok oldalra (kivéve, ha addToApproval=false).
  let added: string | undefined;
  if (body.addToApproval !== false && q.get("addToApproval") !== "0") {
    const caption = body.caption || q.get("caption") || "";
    const p = await addPremiumPoster({ url, headline, sub, caption }).catch(() => null);
    added = p?.id;
  }
  return NextResponse.json({ ok: true, url, added });
}

export const GET = handle;
export const POST = handle;
