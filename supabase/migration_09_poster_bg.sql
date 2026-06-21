-- Migracio 09 - AI-generalt plakat-hattérkepek keszlete
-- Futtasd a Supabase SQL Editorban.

create table if not exists poster_backgrounds (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  url        text not null
);

alter table poster_backgrounds enable row level security;
