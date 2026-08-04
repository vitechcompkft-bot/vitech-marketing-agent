import { NextRequest, NextResponse } from "next/server";
import { runAccountantRange } from "@/lib/accounting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * EGYEDI IDoSZAK számlatörténete a könyvelonek (pl. fél év).
 * ?from=YYYY-MM-DD&to=YYYY-MM-DD  → alapból CSAK összegzés (ellenorzéshez); &send=1 → email a könyvelonek.
 * &to_email=... felülírja a címzettet. Védelem: Bearer CRON_SECRET.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  const q = req.nextUrl.searchParams;
  const from = (q.get("from") || "").trim();
  const to = (q.get("to") || "").trim();
  const send = q.get("send") === "1";
  const toOverride = (q.get("to_email") || "").trim() || undefined;
  if (!from || !to) return NextResponse.json({ ok: false, error: "from és to kötelezo (YYYY-MM-DD)" }, { status: 400 });
  try {
    const result = await runAccountantRange(from, to, { send, toOverride });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
