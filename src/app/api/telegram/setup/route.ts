import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Egyszeri összekötő + chat-ID kideríto végpont.
 *
 * Hívás (a böngészoból, EGYSZER):
 *   /api/telegram/setup?key=<CRON_SECRET>
 *
 * Mit csinál:
 *   - Ha NINCS még TELEGRAM_CHAT_ID env: NEM állít be webhookot, hanem kiolvassa
 *     a botodnak küldött legutóbbi üzenetbol a chat ID-t, és kiírja. Ezt másold a Vercelbe.
 *   - Ha MÁR van TELEGRAM_CHAT_ID env: beállítja a webhookot és küld egy teszt-üzenetet.
 *
 * A ?key védi, hogy csak te tudd meghívni (a bot token sosem kerül a böngészo URL-be).
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

  // ── 1. eset: még nincs chat ID → derítsük ki a botnak küldött üzenetbol ──
  if (!chatId) {
    // A getUpdates csak akkor muködik, ha NINCS aktív webhook → elobb töröljük.
    await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, { method: "POST" });
    const upRes = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
    const upJson = await upRes.json().catch(() => ({} as any));
    const updates: any[] = upJson?.result || [];
    const last = [...updates].reverse().find((u) => u?.message?.chat?.id);
    const foundId = last?.message?.chat?.id;
    const foundName = last?.message?.chat?.first_name || last?.message?.chat?.title || "";

    if (!foundId) {
      return NextResponse.json({
        ok: false,
        step: "chat-id-keresés",
        teendo:
          "Nyisd meg Telegramban a botodat, és küldj neki egy üzenetet (pl. „szia”), majd töltsd újra ezt az oldalt.",
      });
    }

    return NextResponse.json({
      ok: true,
      step: "chat-id-megvan",
      chatId: String(foundId),
      kinek: foundName,
      kovetkezo:
        "Másold ezt a chatId-t a Vercelbe TELEGRAM_CHAT_ID néven (mind3 környezet), majd újradeploy után töltsd újra ezt az oldalt a webhook beállításához.",
    });
  }

  // ── 2. eset: van chat ID → webhook beállítása + teszt-üzenet ──
  const webhookUrl = `${req.nextUrl.origin}/api/telegram/webhook`;
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

  const msgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: "✅ Szia, Luca vagyok! Sikeresen összekapcsolódtunk. Írj nekem bármit, vagy próbáld a /status parancsot. 🚀",
      parse_mode: "HTML",
    }),
  });

  return NextResponse.json({
    ok: setJson?.ok === true,
    step: "webhook-beállítva",
    webhookUrl,
    telegram: setJson,
    testMessageSent: msgRes.ok,
  });
}
