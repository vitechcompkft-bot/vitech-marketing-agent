-- Migracio 17 - Gyula altal felugyelt oldalak allapota (uptime)
-- Futtasd a Supabase SQL Editorban.

create table if not exists site_health (
  id          text primary key,     -- site azonosito
  name        text,
  url         text,
  scope       text,                 -- public | lan
  status      text default 'unknown', -- up | down | unknown
  http_code   int,
  latency_ms  int,
  note        text,
  checked_at  timestamptz
);
alter table site_health enable row level security;
