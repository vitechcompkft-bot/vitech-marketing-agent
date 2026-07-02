import { NextRequest, NextResponse } from "next/server";
import { sendTelegram } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Teszt-ping: küld egy Telegram-üzenetet, hogy azonnal ellenorizheto legyen, muködik-e a csatorna
 * (a BILLINGO/CRON-tól függetlenül). NEM indít el egyetlen ügynököt sem.
 * Védelem: CRON_SECRET (Authorization: Bearer <...> vagy ?key=<...>).
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authed =
    !secret ||
    req.headers.get("authorization") === `Bearer ${secret}` ||
    req.nextUrl.searchParams.get("key") === secret;
  if (!authed) return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });

  const hasToken = !!process.env.TELEGRAM_BOT_TOKEN;
  const hasChatId = !!process.env.TELEGRAM_CHAT_ID;
  const sent = await sendTelegram(
    `🔔 <b>Vitech teszt-értesítés</b> — ha ezt látod, a Telegram működik, és ma este jönni fog az <b>Erika napi összegzés</b> is. 👍`
  );
  return NextResponse.json({ ok: true, hasToken, hasChatId, sent });
}

export const GET = handle;
export const POST = handle;
