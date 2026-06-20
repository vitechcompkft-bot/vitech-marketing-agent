export type AutonomyLevel = "suggest" | "auto_small" | "auto_guardrails";

export interface AgentConfig {
  id: number;
  agent_name: string;
  agent_avatar: string;
  agent_persona: string;
  agent_enabled: boolean;
  autonomy_level: AutonomyLevel;
  max_daily_budget_huf: number;
  max_budget_change_pct: number;
  min_data_clicks: number;
  target_roas: number;
  allow_pause_ads: boolean;
  allow_budget_changes: boolean;
  allow_create_campaign: boolean;
  telegram_chat_id: string | null;
  updated_at: string;
}

export interface CampaignMetric {
  channel: "google" | "meta";
  campaign_id: string;
  campaign_name: string;
  status: string;
  impressions: number;
  clicks: number;
  cost_huf: number;
  conversions: number;
  conv_value_huf: number;
  ctr: number;
  avg_cpc_huf: number;
  roas: number;
  budget_huf: number;
}

export type ActionType =
  | "budget_change"
  | "pause_ad"
  | "enable_ad"
  | "set_target_roas"
  | "add_sitelinks"
  | "add_callouts"
  | "note";

export type ActionStatus =
  | "proposed"
  | "approved"
  | "executed"
  | "rejected"
  | "failed"
  | "blocked";

export interface AgentAction {
  id?: number;
  type: ActionType;
  channel: "google" | "meta";
  campaign_id: string | null;
  campaign_name: string | null;
  params: Record<string, unknown>;
  reasoning: string;
  autonomous: boolean;
  status: ActionStatus;
  result?: string | null;
  created_at?: string;
  executed_at?: string | null;
}

export interface Alert {
  id?: number;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  channel: "google" | "meta";
  campaign_id: string | null;
  acknowledged?: boolean;
  created_at?: string;
}

export type CreativeKind =
  | "google_landscape"
  | "google_square"
  | "fb_square"
  | "fb_landscape"
  | "story_poster";

export interface Creative {
  id?: number;
  created_at?: string;
  kind: CreativeKind;
  topic: string;
  headline: string;
  subhead: string;
  badge: string;
  cta: string;
  svg: string;
  created_by?: "agent" | "user";
}

/** Az Agent egy döntése (Claude kimenete), mielőtt a guardrails megszűri. */
export interface AgentDecision {
  action: ActionType;
  campaign_id: string | null;
  campaign_name: string | null;
  params: Record<string, unknown>;
  reasoning: string;
  severity?: "info" | "warning" | "critical";
}
