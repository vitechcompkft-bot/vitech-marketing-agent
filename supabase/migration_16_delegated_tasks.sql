-- Migracio 16 - Luca -> Klari delegalt kreativ feladatok (tobb eleres erdekeben)
-- Futtasd a Supabase SQL Editorban.

create table if not exists delegated_tasks (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  from_key    text not null default 'luca',
  to_key      text not null default 'klari',
  title       text,
  brief       text,                 -- a kreativ irany (Klari ezt epIti be a napi plakatba)
  status      text not null default 'open'  -- open | done
);
alter table delegated_tasks enable row level security;
create index if not exists idx_delegated_open on delegated_tasks (status, created_at desc);
