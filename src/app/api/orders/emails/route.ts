import { NextRequest, NextResponse } from "next/server";
import { fetchOrderEmails } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A Vitech Gmail-bol a rendelés-értesíto e-mailek teljes szövege — a helyi garancia-app
 * ezt olvassa (a már bekötött Gmail-bol, külön jelszó nélkül). Védelem: Bearer / ?key=CRON_SECRET.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const key = req.nextUrl.searchParams.get("key");
  if (secret && key !== secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || 15), 30);
  try {
    const emails = await fetchOrderEmails(limit);
    return NextResponse.json({ ok: true, emails });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
