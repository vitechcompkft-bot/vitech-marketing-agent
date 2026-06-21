-- Migracio 10 - Munkatarsak napi feladata + elo statusza (dashboard + Erika napi jelentes)
-- Futtasd a Supabase SQL Editorban.

create table if not exists agent_status (
  key         text primary key,            -- luca, klari, erika, gyula
  daily_task  text,
  status      text default 'idle',         -- idle | working | waiting | done | error
  status_note text,
  status_at   timestamptz not null default now()
);

alter table agent_status enable row level security;

insert into agent_status (key, daily_task, status, status_note) values
('luca',  'Hirdetesek + SEO figyelese, optimalizalas',          'idle', 'Keszenletben'),
('klari', 'Napi legjobb ajanlat felkutatasa + plakat keszitese', 'idle', 'Keszenletben'),
('gyula', 'Rendszer-ellenorzes + automatizalasi otletek',        'idle', 'Keszenletben'),
('erika', 'Uzenetek rendezese + napi osszegzes a tulajdonosnak', 'idle', 'Keszenletben')
on conflict (key) do nothing;
