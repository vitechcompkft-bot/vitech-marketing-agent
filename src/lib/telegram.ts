/** Telegram bot — kimenő üzenet küldése. */
export async function sendTelegram(text: string, chatIdOverride?: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = chatIdOverride || process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn("[telegram] hiányzó TELEGRAM_BOT_TOKEN vagy CHAT_ID — kihagyom a küldést.");
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    return res.ok;
  } catch (e) {
    console.error("[telegram] küldési hiba:", e);
    return false;
  }
}
