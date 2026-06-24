import { supabaseAdmin } from "./supabase";

export type AgentStatusKey = "luca" | "klari" | "gyula" | "erika" | "mihaly";

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

/** GYULA napi rendszer-ellenorzése: adatfrissesség + valódi hibák (a már javított PMax-sitelink nélkül). */
export async function gyulaDailyCheck(): Promise<void> {
  try {
    const sb = supabaseAdmin();
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [{ data: live }, { data: failed }] = await Promise.all([
      sb.from("live_metrics").select("updated_at").order("updated_at", { ascending: false }).limit(1),
      sb.from("actions").select("type").eq("status", "failed").gte("created_at", dayAgo).limit(50),
    ]);

    const lastData = live && live[0]?.updated_at ? new Date(live[0].updated_at) : null;
    const ageMin = lastData ? Math.round((Date.now() - lastData.getTime()) / 60000) : null;
    const adsOk = ageMin !== null && ageMin < 180; // 3 órán belül friss

    // KAPCSOLATOK pingelése: Unas (login) + e-mail (friss levél az elmúlt ~24h-ban).
    const { unasLogin } = await import("./unas");
    let unasOk = false;
    try {
      await unasLogin();
      unasOk = true;
    } catch {
      unasOk = false;
    }

    const { data: lastEmail } = await sb.from("emails").select("date").order("date", { ascending: false }).limit(1);
    const emailConfigured = !!(process.env.IMAP_HOST || process.env.GMAIL_USER);
    const emailAgeH = lastEmail && lastEmail[0]?.date ? (Date.now() - new Date(lastEmail[0].date).getTime()) / 3600000 : null;
    const emailOk = emailConfigured && (emailAgeH === null || emailAgeH < 48);

    // A PMax-sitelink/kiemelo hibák már javítva (csak javaslat) → ezeket NEM számoljuk valódi hibának.
    const realFails = (failed || []).filter((f) => f.type !== "add_sitelinks" && f.type !== "add_callouts").length;

    const conn = [
      `Unas ${unasOk ? "✅" : "❌"}`,
      `Google Ads ${adsOk ? "✅" : "⚠️"}`,
      `E-mail ${emailOk ? "✅" : emailConfigured ? "⚠️" : "—"}`,
    ].join(" · ");

    const allOk = unasOk && adsOk && emailOk && realFails === 0;
    let status: string;
    let note: string;
    if (allOk) {
      status = "done";
      note = `Kapcsolatok rendben ✅ — ${conn}. Nincs valódi hiba.`;
    } else {
      status = "waiting";
      const issues: string[] = [];
      if (!unasOk) issues.push("Unas nem elérheto");
      if (!adsOk) issues.push("Google Ads adat nem friss (fut-e a szkript óránként?)");
      if (!emailOk) issues.push("e-mail csatorna gyanús");
      if (realFails > 0) issues.push(`${realFails} valódi hiba 24h-ban`);
      note = `Kapcsolatok: ${conn}. Teendo: ${issues.join("; ")}.`;
    }

    await setAgentStatus("gyula", status, note);
  } catch {
    await setAgentStatus("gyula", "error", "A napi rendszer-ellenorzés nem futott le.");
  }
}
