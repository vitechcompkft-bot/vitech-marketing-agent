import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { runErikaAudit } from "@/lib/erika";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Erika napi FELÜGYELET-auditja. A monitor-cron indítja (napi), de kézzel is hívható.
 * Alapból AZONNAL válaszol, a munkát waitUntil-lel a háttérben futtatja (saját 60s budget),
 * és körönként ÚJRA hívja önmagát, amíg minden feladat el nem készül (vagy max. kör után riaszt).
 * ?sync=1 → szinkron egy kört lefuttat és visszaadja az eredményt (kézi teszt).
 * Védelem: Authorization: Bearer <CRON_SECRET>.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* üres body → 1. kör */
  }
  const round = Number(body?.round) || 1;

  if (req.nextUrl.searchParams.get("sync") === "1") {
    const r = await runErikaAudit(round);
    return NextResponse.json(r);
  }

  waitUntil(runErikaAudit(round).catch(() => {}));
  return NextResponse.json({ ok: true, accepted: true, round });
}

export const GET = handle;
export const POST = handle;
