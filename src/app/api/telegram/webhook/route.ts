import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendTelegram } from "@/lib/telegram";
import { chatWithAgent } from "@/lib/claude";
import { execute, getConfig } from "@/lib/agent";
import { buildContext } from "@/lib/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Telegram webhook. Beérkező üzenetek és parancsok:
 *   /status              – pillanatnyi helyzet
 *   /stop                – Agent KIKAPCSOLÁSA (vész-leállító)
 *   /start               – Agent bekapcsolása
 *   /approve_<id>        – egy javasolt akció jóváhagyása + végrehajtása
 *   bármi más szöveg     – beszélgetés az Agenttel
 */
export async function POST(req: NextRequest) {
  // Webhook titok ellenőrzése
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret) {
    const got = req.headers.get("x-telegram-bot-api-secret-token");
    if (got !== secret) return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = await req.json().catch(() => null);
  const msg = update?.message;
  const text: string = msg?.text?.trim() || "";
  const chatId: string | undefined = msg?.chat?.id ? String(msg.chat.id) : undefined;
  if (!text || !chatId) return NextResponse.json({ ok: true });

  const sb = supabaseAdmin();

  try {
    // ── Parancsok ──
    if (text === "/start" || text === "/resume") {
      await sb.from("agent_config").update({ agent_enabled: true, telegram_chat_id: chatId, updated_at: new Date().toISOString() }).eq("id", 1);
      await sendTelegram("✅ Az AI Marketinges <b>bekapcsolva</b>. Figyelem a hirdetéseket.", chatId);
      return NextResponse.json({ ok: true });
    }
    if (text === "/stop" || text === "/pause") {
      await sb.from("agent_config").update({ agent_enabled: false, updated_at: new Date().toISOString() }).eq("id", 1);
      await sendTelegram("⛔ Az AI Marketinges <b>kikapcsolva</b> (vész-leállító). Nem nyúlok semmihez, csak mérek. Visszakapcsolás: /start", chatId);
      return NextResponse.json({ ok: true });
    }
    if (text === "/status") {
      const ctx = await buildContext();
      const cfg = await getConfig();
      const reply = await chatWithAgent([{ role: "user", content: "Foglald össze röviden a jelenlegi helyzetet." }], ctx, { name: cfg.agent_name, persona: cfg.agent_persona });
      await sendTelegram(reply, chatId);
      return NextResponse.json({ ok: true });
    }
    if (text.startsWith("/approve_")) {
      const id = Number(text.replace("/approve_", ""));
      const { data: action } = await sb.from("actions").select("*").eq("id", id).single();
      if (!action) {
        await sendTelegram("Nem találom ezt a javaslatot.", chatId);
        return NextResponse.json({ ok: true });
      }
      if (action.status !== "proposed") {
        await sendTelegram(`Ez a javaslat már „${action.status}" állapotú.`, chatId);
        return NextResponse.json({ ok: true });
      }
      const config = await getConfig();
      const res = await execute(action.type, action.campaign_id, action.params, config);
      await sb.from("actions").update({
        status: res.ok ? "executed" : "failed",
        result: res.message,
        executed_at: new Date().toISOString(),
      }).eq("id", id);
      await sendTelegram(res.ok ? `✅ Jóváhagyva és végrehajtva: ${res.message}` : `⚠️ Hiba: ${res.message}`, chatId);
      return NextResponse.json({ ok: true });
    }

    // ── Sima beszélgetés ──
    await sb.from("chat_messages").insert({ role: "user", content: text, channel: "telegram" });
    const ctx = await buildContext();
    const cfg = await getConfig();
    const reply = await chatWithAgent([{ role: "user", content: text }], ctx, { name: cfg.agent_name, persona: cfg.agent_persona });
    await sb.from("chat_messages").insert({ role: "agent", content: reply, channel: "telegram" });
    await sendTelegram(reply, chatId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    await sendTelegram("Hiba történt: " + (e?.message ?? "ismeretlen"), chatId);
    return NextResponse.json({ ok: true });
  }
}
