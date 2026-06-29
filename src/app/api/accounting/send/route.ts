import { NextRequest, NextResponse } from "next/server";
import { runAccountantEmail } from "@/lib/accounting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Mihály havi könyveloi-emailje (elozo havi számlatörténet XLSX + kivonat PDF a könyvelonek).
 * A monitor cron hívja minden hónap 4-én. Kézi/teszt: ?force=1. Védelem: Bearer CRON_SECRET.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  try {
    const force = req.nextUrl.searchParams.get("force") === "1";
    const result = await runAccountantEmail({ force });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
