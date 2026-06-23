-- Migracio 13 - Klari ketlepcsos futas (Vercel Hobby 60s limit miatt)
-- A szoveg-fazis ide menti a kep-fazishoz szukseges renderelesi adatokat (specs/badges/features).
-- A status uj erteke: 'pending_image' (szoveg kesz, kep meg keszul).
-- Futtasd a Supabase SQL Editorban.

alter table klari_posts add column if not exists render_data jsonb;
