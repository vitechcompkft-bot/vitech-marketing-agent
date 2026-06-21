import { supabaseAdmin } from "./supabase";

export type AgentStatusKey = "luca" | "klari" | "gyula" | "erika";

export interface AgentStatusRow {
  key: string;
  daily_task: string | null;
  status: string; // idle | working | waiting | done | error
  status_note: string | null;
  status_at: string;
}

/** Egy munkatárs élo státuszának frissítése. */
export async function setAgentStatus(
  key: AgentStatusKey,
  status: string,
  note?: string,
  dailyTask?: string
): Promise<void> {
  try {
    const sb = supabaseAdmin();
    const patch: Record<string, unknown> = { status, status_at: new Date().toISOString() };
    if (note !== undefined) patch.status_note = note;
    if (dailyTask !== undefined) patch.daily_task = dailyTask;
    await sb.from("agent_status").update(patch).eq("key", key);
  } catch {
    // némán (a státusz nem kritikus a fo folyamathoz)
  }
}

/** Minden munkatárs státusza (dashboardhoz + Erika jelentéséhez). */
export async function getAgentStatuses(): Promise<AgentStatusRow[]> {
  try {
    const sb = supabaseAdmin();
    const { data } = await sb.from("agent_status").select("*");
    return (data as AgentStatusRow[]) || [];
  } catch {
    return [];
  }
}

/** GYULA napi rendszer-ellenorzése: adatfrissesség, rendelés-szinkron, hibák. */
export async function gyulaDailyCheck(): Promise<void> {
  try {
    const sb = supabaseAdmin();
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [{ data: live }, { data: failed }, { count: ordersToday }] = await Promise.all([
      sb.from("live_metrics").select("updated_at").order("updated_at", { ascending: false }).limit(1),
      sb.from("actions").select("id", { count: "exact", head: false }).eq("status", "failed").gte("created_at", dayAgo).limit(20),
      sb.from("klari_posts").select("id", { count: "exact", head: true }).gte("created_at", dayAgo),
    ]);

    const lastData = live && live[0]?.updated_at ? new Date(live[0].updated_at) : null;
    const ageMin = lastData ? Math.round((Date.now() - lastData.getTime()) / 60000) : null;
    const dataOk = ageMin !== null && ageMin < 180; // 3 órán belül friss
    const failCount = (failed || []).length;

    const parts: string[] = [];
    parts.push(dataOk ? `Adatszinkron OK (friss: ${ageMin} perce)` : "⚠️ Az adatszinkron elavult (a Google Ads szkript fut-e óránként?)");
    if (failCount > 0) parts.push(`${failCount} sikertelen muvelet 24h-ban`);
    else parts.push("nincs hibás muvelet");

    await setAgentStatus("gyula", dataOk && failCount === 0 ? "done" : "waiting", parts.join(" · "));
  } catch {
    await setAgentStatus("gyula", "error", "A rendszer-ellenorzés nem futott le.");
  }
}
