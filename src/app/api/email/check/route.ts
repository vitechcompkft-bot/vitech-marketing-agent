import { NextRequest, NextResponse } from "next/server";
import { checkInbox } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Erika beolvassa az új e-maileket (IMAP, csak olvasás) és triázsolja.
 * GET /api/email/check?key=<CRON_SECRET>  (vagy Bearer)
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const key = req.nextUrl.searchParams.get("key");
  const auth = req.headers.get("authorization");
  if (secret && key !== secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || 3), 4);
  const result = await checkInbox(limit);
  return NextResponse.json(result);
}
