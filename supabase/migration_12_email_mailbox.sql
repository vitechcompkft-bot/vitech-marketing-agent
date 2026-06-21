-- Migracio 12 - melyik postaladabol jott a level (tobb fiok: HUNOR + Vitech Gmail)
-- Futtasd a Supabase SQL Editorban.

alter table emails add column if not exists mailbox text;
