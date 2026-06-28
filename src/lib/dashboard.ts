import { getCampaignMetrics, isMock } from "./googleAds";
import { supabaseAdmin } from "./supabase";
import { getOrderStats, type OrderStats } from "./orders";
import { getBillingoSummary, getInvoicedOrders, type BillingoSummary, type InvoicedRecord } from "./billingo";
import { getBankSnapshot, type BankSnapshot } from "./bank";
import { getSiteHealth, type SiteHealthRow } from "./health";
import { getJuditPosts, type JuditPost } from "./judit";
import { getLinkedInStatus, type LinkedInStatus } from "./linkedin";
import { getMetaStatus, type MetaStatus } from "./meta";
import { getFacebookStatus, type FacebookStatus } from "./facebook";
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
  mailbox: string | null;
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

export interface MihalyReport {
  summary: string;
  suggestions: string[];
  spendingReview: { item: string; amount: number; verdict: string; note: string }[];
  outByParty: { party: string; total: number; count: number }[];
  asOf: string | null;
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
  billingo: BillingoSummary;
  bank: BankSnapshot;
  lucaReach: string;
  klariBrief: string;
  mihalyReport: MihalyReport | null;
  invoicedOrders: Record<string, InvoicedRecord>;
  juditPosts: JuditPost[];
  linkedin: LinkedInStatus;
  meta: MetaStatus | null;
  facebook: FacebookStatus;
  sites: SiteHealthRow[];
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
  const billingo = await getBillingoSummary().catch(
    () => ({ ok: false, outCount: 0, outTotalHuf: 0, outExpired: 0, out: [], inCount: 0, inTotalHuf: 0, inExpired: 0, in: [] }) as BillingoSummary
  );
  const sites = await getSiteHealth().catch(() => []);
  const invoicedOrders = await getInvoicedOrders().catch(() => ({}));
  const juditPosts = await getJuditPosts().catch(() => []);
  const linkedin = await getLinkedInStatus().catch(() => ({ configured: false, connected: false }) as LinkedInStatus);
  const meta = await getMetaStatus().catch(() => null);
  const facebook = await getFacebookStatus().catch(() => ({ configured: false, connected: false }) as FacebookStatus);
  const bank = await getBankSnapshot().catch(
    () => ({ ok: false, connected: false, balance: null, currency: "HUF", in30: 0, out30: 0, recent: [], outByParty: [], asOf: null }) as BankSnapshot
  );

  let actions: AgentAction[] = [];
  let alerts: Alert[] = [];
  let config: AgentConfig | null = null;
  let klari: KlariPost[] = [];
  let agents: OrgAgent[] = [];
  let statuses: AgentStatusRow[] = [];
  let emails: EmailRow[] = [];
  let lucaReach = "";
  let klariBrief = "";
  let mihalyReport: MihalyReport | null = null;
  let supabaseReady = false;

  try {
    const sb = supabaseAdmin();
    const [a, al, c, k, ag, st, em, rs, dt, mr] = await Promise.all([
      sb.from("actions").select("*").order("created_at", { ascending: false }).limit(20),
      sb.from("alerts").select("*").order("created_at", { ascending: false }).limit(10),
      sb.from("agent_config").select("*").eq("id", 1).single(),
      sb.from("klari_posts").select("*").order("created_at", { ascending: false }).limit(4),
      sb.from("agents").select("key,name,role,department,avatar,is_lead").eq("active", true).order("sort", { ascending: true }),
      sb.from("agent_status").select("*"),
      sb.from("emails").select("id,mailbox,from_addr,subject,date,summary,department,urgency").order("date", { ascending: false }).limit(10),
      sb.from("app_state").select("value").eq("key", "luca_reach_summary").maybeSingle(),
      sb.from("delegated_tasks").select("brief").eq("to_key", "klari").eq("status", "open").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("app_state").select("value").eq("key", "mihaly_report").maybeSingle(),
    ]);
    actions = (a.data as AgentAction[]) || [];
    alerts = (al.data as Alert[]) || [];
    config = (c.data as AgentConfig) || null;
    klari = (k.data as KlariPost[]) || [];
    agents = (ag.data as OrgAgent[]) || [];
    statuses = (st.data as AgentStatusRow[]) || [];
    emails = (em.data as EmailRow[]) || [];
    lucaReach = (rs?.data as any)?.value || "";
    klariBrief = (dt?.data as any)?.brief || "";
    try {
      const mv = (mr?.data as any)?.value;
      if (mv) mihalyReport = JSON.parse(mv) as MihalyReport;
    } catch {
      mihalyReport = null;
    }
    supabaseReady = !c.error;
  } catch {
    supabaseReady = false;
  }

  return { metrics, actions, alerts, config, klari, agents, statuses, emails, orders, billingo, bank, lucaReach, klariBrief, mihalyReport, invoicedOrders, juditPosts, linkedin, meta, facebook, sites, supabaseReady, mock: isMock };
}
