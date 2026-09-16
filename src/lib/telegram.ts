/** Telegram bot — kimenő üzenet küldése.
 *  A tulajdonos kérésére (2026-09) a Telegram-értesítések ALAPBÓL KI vannak kapcsolva — helyettük
 *  REGGELI E-MAIL megy az előző napi beszámolókkal (lásd agent.ts → sendDailyReport).
 *  Visszakapcsolható: a Vercel env-ben TELEGRAM_ENABLED=true beállításával. */
export async function sendTelegram(text: string, chatIdOverride?: string): Promise<boolean> {
  if (process.env.TELEGRAM_ENABLED !== "true") return false; // Telegram kikapcsolva → e-mailben jelentünk
  const token = process.env.TELEGRAM_BOT_TOKEN;
  let chatId = chatIdOverride || process.env.TELEGRAM_CHAT_ID;
  // Ha nincs env CHAT_ID, essünk vissza az agent_config-ban tárolt értékre (a bot a tulajdonos
  // üzenetébol mentette a webhookon). Így MINDEN értesítés a muködo chat-id-t használja.
  if (!chatId) {
    try {
      const { supabaseAdmin } = await import("./supabase");
      const { data } = await supabaseAdmin().from("agent_config").select("telegram_chat_id").eq("id", 1).single();
      if (data?.telegram_chat_id) chatId = String(data.telegram_chat_id);
    } catch {
      /* best-effort */
    }
  }
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
