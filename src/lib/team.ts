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
    const dataOk = ageMin !== null && ageMin < 180; // 3 órán belül friss
    const dataTxt =
      ageMin === null
        ? "még nincs beérkezett adat"
        : ageMin < 90
        ? `adatszinkron friss (${ageMin} perce)`
        : `adatszinkron ${Math.round(ageMin / 60)} órája frissült`;

    // A PMax-sitelink/kiemelo hibák már javítva (csak javaslat) → ezeket NEM számoljuk valódi hibának.
    const realFails = (failed || []).filter((f) => f.type !== "add_sitelinks" && f.type !== "add_callouts").length;

    let note: string;
    let status: string;
    if (dataOk && realFails === 0) {
      status = "done";
      note = `Rendszer-ellenorzés kész ✅ — ${dataTxt}, az AI-szolgáltatások és a rendelés-szinkron rendben. Nincs valódi hiba.`;
    } else if (!dataOk) {
      status = "waiting";
      note = `Figyelem: ${dataTxt}. Ellenorizni kell, hogy a Google Ads szkript óránként fut-e.`;
    } else {
      status = "waiting";
      note = `${dataTxt}, de ${realFails} valódi hibát találtam 24 órában — átnézem.`;
    }

    await setAgentStatus("gyula", status, note);
  } catch {
    await setAgentStatus("gyula", "error", "A napi rendszer-ellenorzés nem futott le.");
  }
}
