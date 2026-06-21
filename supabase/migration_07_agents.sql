-- Migracio 07 - AI-ceg szervezet: munkatarsak (Erika titkarsag, Gyula informatika)
-- Futtasd a Supabase SQL Editorban.

create table if not exists agents (
  key         text primary key,         -- 'erika','gyula','luca','klari'
  name        text not null,
  role        text not null,            -- rovid szerepkor
  department  text not null,            -- 'Titkarsag','Marketing','Informatika','Gazdasagi'
  avatar      text,
  persona     text,
  reports_to  text,                     -- kinek jelent (null = tulajdonos)
  is_lead     boolean default false,    -- osztalyvezeto?
  sort        int default 0,
  active      boolean default true,
  updated_at  timestamptz not null default now()
);

alter table agents enable row level security;

insert into agents (key, name, role, department, avatar, persona, reports_to, is_lead, sort) values
('erika', 'Erika', 'Titkarno', 'Titkarsag',
 'https://api.dicebear.com/9.x/lorelei/svg?seed=Erika&backgroundColor=11243f',
 'Lojalis, rendkivul rendszereto titkarno. Minden uzenetet o fogad es a megfelelo osztalyhoz iranyit, rendszerezi es osszefogva jelenti a tulajdonosnak. Udvarias, precIz, naprakesz, diszkret.',
 null, true, 1),
('gyula', 'Gyula', 'Informatikai osztalyvezeto', 'Informatika',
 'https://api.dicebear.com/9.x/notionists/svg?seed=Gyula&backgroundColor=1a73e8',
 'PrecIz, alapos informatikus osztalyvezeto - igazi "kocka". A vegletekig megold minden problemat, folyamatosan automatizal es egyszerusIt. Rovid, lenyegre toro feljegyzeseket kuld Erikanak.',
 null, true, 2)
on conflict (key) do nothing;
