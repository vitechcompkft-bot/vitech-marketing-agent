import { getCampaignMetrics, isMock } from "./googleAds";
import { supabaseAdmin } from "./supabase";
import { getOrderStats, type OrderStats } from "./orders";
import type { AgentStatusRow } from "./team";
import type { AgentAction, AgentConfig, Alert, CampaignMetric } from "./types";

export interface KlariPost {
  id: number;
  created_at: string;
  product_name: string;
  product_url: string | null;
  image_url: string | null;
  price_huf: number | null;
  market_note: string | null;
  headline: string | null;
  caption: string | null;
  poster_svg: string | null;
  luca_verdict: string | null;
  status: string;
}

export interface EmailRow {
  id: number;
  from_addr: string | null;
  subject: string | null;
  date: string | null;
  summary: string | null;
  department: string | null;
  urgency: string | null;
}

export interface OrgAgent {
  key: string;
  name: string;
  role: string;
  department: string;
  avatar: string | null;
  is_lead: boolean;
}

export interface DashboardData {
  metrics: CampaignMetric[];
  actions: AgentAction[];
  alerts: Alert[];
  config: AgentConfig | null;
  klari: KlariPost[];
  agents: OrgAgent[];
  statuses: AgentStatusRow[];
  emails: EmailRow[];
  orders: OrderStats;
  supabaseReady: boolean;
  mock: boolean;
}

/** Robusztus betöltés: a számok mockból is jönnek; a Supabase hiánya nem dönti el az oldalt. */
export async function loadDashboard(): Promise<DashboardData> {
  let metrics: CampaignMetric[] = [];
  try {
    metrics = await getCampaignMetrics();
  } catch {
    metrics = [];
  }

  const orders = await getOrderStats();

  let actions: AgentAction[] = [];
  let alerts: Alert[] = [];
  let config: AgentConfig | null = null;
  let klari: KlariPost[] = [];
  let agents: OrgAgent[] = [];
  let statuses: AgentStatusRow[] = [];
  let emails: EmailRow[] = [];
  let supabaseReady = false;

  try {
    const sb = supabaseAdmin();
    const [a, al, c, k, ag, st, em] = await Promise.all([
      sb.from("actions").select("*").order("created_at", { ascending: false }).limit(20),
      sb.from("alerts").select("*").order("created_at", { ascending: false }).limit(10),
      sb.from("agent_config").select("*").eq("id", 1).single(),
      sb.from("klari_posts").select("*").order("created_at", { ascending: false }).limit(4),
      sb.from("agents").select("key,name,role,department,avatar,is_lead").eq("active", true).order("sort", { ascending: true }),
      sb.from("agent_status").select("*"),
      sb.from("emails").select("id,from_addr,subject,date,summary,department,urgency").order("date", { ascending: false }).limit(8),
    ]);
    actions = (a.data as AgentAction[]) || [];
    alerts = (al.data as Alert[]) || [];
    config = (c.data as AgentConfig) || null;
    klari = (k.data as KlariPost[]) || [];
    agents = (ag.data as OrgAgent[]) || [];
    statuses = (st.data as AgentStatusRow[]) || [];
    emails = (em.data as EmailRow[]) || [];
    supabaseReady = !c.error;
  } catch {
    supabaseReady = false;
  }

  return { metrics, actions, alerts, config, klari, agents, statuses, emails, orders, supabaseReady, mock: isMock };
}
