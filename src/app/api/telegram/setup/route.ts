import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Egyszeri összekötő végpont: a Vercelre beállított TELEGRAM_BOT_TOKEN alapján
 * regisztrálja a Telegram webhookot erre a deploymentre, és küld egy teszt-üzenetet.
 *
 * Hívás (a böngészőből, EGYSZER):
 *   /api/telegram/setup?key=<CRON_SECRET>
 *
 * A ?key védi, hogy csak te tudd meghívni (a token sosem kerül a böngésző URL-be).
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "Hibás vagy hiányzó key." }, { status: 401 });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token) {
    return NextResponse.json({ ok: false, error: "Hiányzik a TELEGRAM_BOT_TOKEN env." }, { status: 400 });
  }

  const webhookUrl = `${req.nextUrl.origin}/api/telegram/webhook`;

  // 1) Webhook beállítása
  const setRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secret || undefined,
      allowed_updates: ["message"],
      drop_pending_updates: true,
    }),
  });
  const setJson = await setRes.json().catch(() => ({}));

  // 2) Teszt-üzenet (ha van chat id)
  let testSent = false;
  if (chatId) {
    const msgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "✅ Szia, Luca vagyok! Sikeresen összekapcsolódtunk. Írj nekem bármit, vagy próbáld a /status parancsot. 🚀",
        parse_mode: "HTML",
      }),
    });
    testSent = msgRes.ok;
  }

  return NextResponse.json({
    ok: setJson?.ok === true,
    webhookUrl,
    telegram: setJson,
    testMessageSent: testSent,
    note: chatId ? undefined : "TELEGRAM_CHAT_ID nincs beállítva — a teszt-üzenetet kihagytam.",
  });
}
