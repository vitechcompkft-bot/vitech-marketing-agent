-- Migracio 03 - VALOS adatok fogadasa Google Ads Scriptbol
-- Futtasd a Supabase SQL Editorban (a 01 es 02 utan).
--
-- A Google Ads szkript orankent ide tolti a kampanyok AKTUALIS (mai) szamait.
-- Kampanyonkent egy sor (campaign_id = kulcs), minden futaskor felulirva.

create table if not exists live_metrics (
  campaign_id    text primary key,
  channel        text not null default 'google',
  campaign_name  text,
  status         text,
  impressions    bigint  default 0,
  clicks         bigint  default 0,
  cost_huf       numeric default 0,
  conversions    numeric default 0,
  conv_value_huf numeric default 0,
  ctr            numeric default 0,
  avg_cpc_huf    numeric default 0,
  roas           numeric default 0,
  budget_huf     numeric default 0,
  updated_at     timestamptz not null default now()
);

alter table live_metrics enable row level security;
