-- Migracio 11 - Beérkezo e-mailek (Erika triazsa: osszegzes, osztaly, surgosseg)
-- Futtasd a Supabase SQL Editorban.

create table if not exists emails (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  uid         text unique,            -- IMAP egyedi azonosito (dedup)
  from_addr   text,
  subject     text,
  date        timestamptz,
  snippet     text,                   -- a level rovid kivonata
  summary     text,                   -- Erika osszegzese
  department  text,                   -- Informatika | Gazdasagi | Marketing | Titkarsag | Egyeb
  urgency     text,                   -- alacsony | kozepes | magas
  handled     boolean not null default false
);

create index if not exists idx_emails_date on emails (date desc);
alter table emails enable row level security;
