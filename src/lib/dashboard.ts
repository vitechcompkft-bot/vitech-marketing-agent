import { getCampaignMetrics, isMock } from "./googleAds";
import { supabaseAdmin } from "./supabase";
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

export interface DashboardData {
  metrics: CampaignMetric[];
  actions: AgentAction[];
  alerts: Alert[];
  config: AgentConfig | null;
  klari: KlariPost[];
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

  let actions: AgentAction[] = [];
  let alerts: Alert[] = [];
  let config: AgentConfig | null = null;
  let klari: KlariPost[] = [];
  let supabaseReady = false;

  try {
    const sb = supabaseAdmin();
    const [a, al, c, k] = await Promise.all([
      sb.from("actions").select("*").order("created_at", { ascending: false }).limit(20),
      sb.from("alerts").select("*").order("created_at", { ascending: false }).limit(10),
      sb.from("agent_config").select("*").eq("id", 1).single(),
      sb.from("klari_posts").select("*").order("created_at", { ascending: false }).limit(4),
    ]);
    actions = (a.data as AgentAction[]) || [];
    alerts = (al.data as Alert[]) || [];
    config = (c.data as AgentConfig) || null;
    klari = (k.data as KlariPost[]) || [];
    supabaseReady = !c.error;
  } catch {
    supabaseReady = false;
  }

  return { metrics, actions, alerts, config, klari, supabaseReady, mock: isMock };
}
