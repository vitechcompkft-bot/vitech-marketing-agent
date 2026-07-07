import { NextRequest, NextResponse } from "next/server";
import { setPremiumStatus, publishPremiumPoster } from "@/lib/premium";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 40;

/**
 * Prémium plakát jóváhagyási muveletek a dashboardról: approve / reject / post (kiposztolás most).
 * Auth: Bearer <CRON_SECRET> VAGY a dashboard Basic Auth-ja (a böngészo-gombok miatt).
 * Body: { id, action }.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (secret && auth !== `Bearer ${secret}` && !auth.startsWith("Basic ")) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* üres */
  }
  const id = String(body?.id || "").trim();
  const action = String(body?.action || "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Hiányzó azonosító." }, { status: 400 });
  try {
    if (action === "approve") return NextResponse.json(await setPremiumStatus(id, "approved"));
    if (action === "reject") return NextResponse.json(await setPremiumStatus(id, "rejected"));
    if (action === "post") {
      const r = await publishPremiumPoster(id);
      return NextResponse.json(r);
    }
    return NextResponse.json({ ok: false, error: "Ismeretlen muvelet." }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}

export const POST = handle;
