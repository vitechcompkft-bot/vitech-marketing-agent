-- ════════════════════════════════════════════════════════════════
--  Vitech AI Marketinges Agent — Supabase séma
--  Futtasd a Supabase SQL Editorban (egyben).
-- ════════════════════════════════════════════════════════════════

-- ── Konfiguráció + KORLÁTOK (guardrails) — egy sor (id = 1) ──────
create table if not exists agent_config (
  id                      int primary key default 1,
  agent_enabled           boolean not null default true,   -- VÉSZ-LEÁLLÍTÓ: false = nem nyúl semmihez
  autonomy_level          text    not null default 'auto_guardrails', -- 'suggest' | 'auto_small' | 'auto_guardrails'
  -- Korlátok:
  max_daily_budget_huf    int     not null default 6000,   -- egy kampány napi kerete sosem lépheti túl
  max_budget_change_pct   int     not null default 25,      -- egy lépésben max ennyi %-kal módosíthat büdzsét
  min_data_clicks         int     not null default 30,      -- ennyi kattintás alatt nem hoz "kemény" döntést
  target_roas             numeric not null default 0,       -- 0 = még nincs ROAS-cél (tanulási fázis)
  allow_pause_ads         boolean not null default true,    -- gyengén teljesítő asset/kampány szüneteltetése
  allow_budget_changes    boolean not null default true,
  allow_create_campaign   boolean not null default false,   -- új kampányt SOHA automatikusan (alapból tilt)
  -- Telegram:
  telegram_chat_id        text,
  -- napló:
  updated_at              timestamptz not null default now()
);
insert into agent_config (id) values (1) on conflict (id) do nothing;

-- ── Metrika-pillanatképek (kampányonként, időbélyeggel) ─────────
create table if not exists metric_snapshots (
  id            bigint generated always as identity primary key,
  captured_at   timestamptz not null default now(),
  channel       text not null default 'google',  -- 'google' | 'meta'
  campaign_id   text not null,
  campaign_name text,
  status        text,
  impressions   bigint default 0,
  clicks        bigint default 0,
  cost_huf      numeric default 0,
  conversions   numeric default 0,
  conv_value_huf numeric default 0,
  ctr           numeric default 0,   -- %
  avg_cpc_huf   numeric default 0,
  roas          numeric default 0,   -- conv_value / cost
  budget_huf    numeric default 0    -- aktuális napi keret
);
create index if not exists idx_snap_campaign_time on metric_snapshots (campaign_id, captured_at desc);

-- ── Riasztások ──────────────────────────────────────────────────
create table if not exists alerts (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  severity      text not null default 'info',  -- 'info' | 'warning' | 'critical'
  title         text not null,
  message       text not null,
  channel       text default 'google',
  campaign_id   text,
  acknowledged  boolean not null default false
);
create index if not exists idx_alerts_time on alerts (created_at desc);

-- ── Akciók (az Agent döntései/beavatkozásai — TELJES NAPLÓ) ─────
create table if not exists actions (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  type          text not null,   -- 'budget_change' | 'pause_ad' | 'enable_ad' | 'set_target_roas' | 'note'
  channel       text default 'google',
  campaign_id   text,
  campaign_name text,
  params        jsonb default '{}'::jsonb,   -- pl. { "from": 5000, "to": 6000 }
  reasoning     text,                        -- az Agent indoklása (Claude)
  autonomous    boolean not null default true,
  status        text not null default 'proposed', -- 'proposed' | 'approved' | 'executed' | 'rejected' | 'failed' | 'blocked'
  result        text,                        -- végrehajtás eredménye / hibaüzenet
  executed_at   timestamptz
);
create index if not exists idx_actions_time on actions (created_at desc);

-- ── Chat (dashboard + Telegram, kétirányú) ──────────────────────
create table if not exists chat_messages (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  role          text not null,   -- 'user' | 'agent'
  content       text not null,
  channel       text not null default 'dashboard'  -- 'dashboard' | 'telegram'
);
create index if not exists idx_chat_time on chat_messages (created_at desc);

-- ── RLS: a szerver a service-role kulccsal ír/olvas (megkerüli az RLS-t).
--    A böngészőből csak a szerver API-kon át megy minden, így bekapcsoljuk az RLS-t,
--    de policy nélkül (anon nem fér hozzá közvetlenül).
alter table agent_config     enable row level security;
alter table metric_snapshots enable row level security;
alter table alerts           enable row level security;
alter table actions          enable row level security;
alter table chat_messages    enable row level security;
