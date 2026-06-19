import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Egyszeri összeköto végpont: beállítja a Telegram webhookot erre a deploymentre.
 *
 * Hívás (a böngészoból, EGYSZER):
 *   /api/telegram/setup?key=<CRON_SECRET>
 *
 * A webhook beállítása után, amikor írsz a botnak, a webhook automatikusan
 * eltárolja a chat-azonosítód az agent_config-ban — neked semmit nem kell kimásolni.
 * A ?key védi, hogy csak te tudd meghívni (a bot token sosem kerül a böngészo URL-be).
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "Hibás vagy hiányzó key." }, { status: 401 });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token) {
    return NextResponse.json({ ok: false, error: "Hiányzik a TELEGRAM_BOT_TOKEN env." }, { status: 400 });
  }

  const noCache = { "Cache-Control": "no-store, max-age=0" };
  const webhookUrl = `${req.nextUrl.origin}/api/telegram/webhook`;

  // Melyik bothoz tartozik a token? (visszajelzésnek)
  const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const meJson = await meRes.json().catch(() => ({} as any));
  const botUsername = meJson?.result?.username;

  // Webhook beállítása (a régi függoben lévo üzeneteket eldobjuk, hogy ne válaszoljon mindre).
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
  const setJson = await setRes.json().catch(() => ({} as any));

  return NextResponse.json(
    {
      ok: setJson?.ok === true,
      step: "webhook-beállítva",
      bot: botUsername ? `@${botUsername}` : "(ismeretlen — hibás token?)",
      webhookUrl,
      telegram: setJson,
      kovetkezo:
        "Kész! Most nyisd meg Telegramban a fenti botot, és írj neki egy üzenetet (pl. „szia”). Luca válaszolni fog, és automatikusan megjegyzi a chat-azonosítód.",
    },
    { headers: noCache },
  );
}
