-- Migracio 14 - E-mail routing (Erika -> Gyula/Erika) + Telegram ertesites nyomon kovetese
-- route: 'gyula' (IT/AI) vagy 'erika' (minden mas)
-- gyula_note: Gyula technikai elemzese (ha hozza tartozik)
-- is_shop: bolttol jott-e (Gyula szerint)
-- notified: kuldtunk-e mar rola Telegram osszefoglalot
-- Futtasd a Supabase SQL Editorban.

alter table emails add column if not exists route     text;
alter table emails add column if not exists gyula_note text;
alter table emails add column if not exists is_shop   boolean not null default false;
alter table emails add column if not exists notified  boolean not null default false;
