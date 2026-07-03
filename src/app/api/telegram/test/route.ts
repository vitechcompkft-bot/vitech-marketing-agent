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

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const hasToken = !!token;
  const hasChatId = !!process.env.TELEGRAM_CHAT_ID;
  // A sendTelegram mostantól visszaesik az agent_config-ban tárolt chat-id-re, ha nincs env CHAT_ID.
  const sent = await sendTelegram(
    `🔔 <b>Vitech teszt-értesítés</b> — ha ezt látod, a Telegram működik, és mostantól MINDEN értesítés megérkezik (Klári, Erika napi összegzés, riasztások). 👍`
  );

  // Ha nincs beállított CHAT_ID: kiolvassuk a botnak KÜLDÖTT üzenetekbol a chat-id(ke)t,
  // hogy a tulajdonos tudja, mit kell a Vercelen a TELEGRAM_CHAT_ID-hez beállítani.
  let chatIdsSeen: { id: number | string; name?: string; text?: string }[] = [];
  if (!hasChatId && token) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, { cache: "no-store" });
      const j: any = await r.json();
      const seen = new Set<string>();
      for (const u of j.result || []) {
        const c = u.message?.chat || u.channel_post?.chat;
        if (c && !seen.has(String(c.id))) {
          seen.add(String(c.id));
          chatIdsSeen.push({ id: c.id, name: c.first_name || c.title || c.username, text: u.message?.text });
        }
      }
    } catch {
      /* best-effort */
    }
  }
  return NextResponse.json({ ok: true, hasToken, hasChatId, sent, chatIdsSeen });
}

export const GET = handle;
export const POST = handle;
