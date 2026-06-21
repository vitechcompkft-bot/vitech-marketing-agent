-- Migracio 06 - Klari arckep + szemelyiseg (Luca beosztottja)
-- Futtasd a Supabase SQL Editorban.

alter table agent_config add column if not exists klari_avatar text
  default 'https://api.dicebear.com/9.x/lorelei/svg?seed=Klari&backgroundColor=1a73e8';
alter table agent_config add column if not exists klari_persona text
  default 'Verbeli, lelkes marketinges. Megbizhato, lenduletes, fiatalos es nagyon kreativ. Imadja a jo ajanlatokat es az utos plakatokat. Luca beosztottja, mindig neki jelent.';
