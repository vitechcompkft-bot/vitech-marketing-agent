-- ════════════════════════════════════════════════════════════════
--  02 migráció — személyiség (név, avatar) + kreatív-generálás
--  Futtasd a Supabase SQL Editorban a 01 (schema.sql) UTÁN.
-- ════════════════════════════════════════════════════════════════

-- Személyiség mezők az agent_config-ba
alter table agent_config add column if not exists agent_name   text not null default 'Luca';
alter table agent_config add column if not exists agent_avatar text not null default '/avatars/luca-1.svg';
alter table agent_config add column if not exists agent_persona text not null default
  'Kreatív, lendületes, kicsit túlbuzgó marketinges — de minden feladatot maradéktalanul elvégez. Mindig a cég növekedése lebeg a szeme előtt. Önálló: csak valódi vezetői döntésnél kérdez.';

-- Generált kreatívok (hirdetés / plakát / FB-poszt)
create table if not exists creatives (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  kind        text not null,          -- 'google_landscape' | 'google_square' | 'fb_square' | 'fb_landscape' | 'story_poster'
  topic       text,                   -- a brief, amire készült
  headline    text,
  subhead     text,
  badge       text,
  cta         text,
  svg         text not null,          -- a kész vektorgrafika (böngészőben renderel, PNG-be menthető)
  created_by  text not null default 'agent'  -- 'agent' | 'user'
);
create index if not exists idx_creatives_time on creatives (created_at desc);
alter table creatives enable row level security;
