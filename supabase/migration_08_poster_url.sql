-- Migracio 08 - Klari rendered (PNG) plakat URL tarolasa
-- Futtasd a Supabase SQL Editorban.

alter table klari_posts add column if not exists poster_url text;
