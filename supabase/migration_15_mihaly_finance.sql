-- Migracio 15 - Gazdasagi osztaly (Mihaly) + app_state (rendeles-figyeles allapota)
-- Futtasd a Supabase SQL Editorban.

-- Mihaly, a gazdasagi osztalyvezeto (hatarozott, igazi konyvelo)
insert into agents (key, name, role, department, avatar, persona, reports_to, is_lead, sort) values
('mihaly', 'Mihaly', 'Gazdasagi osztalyvezeto', 'Gazdasagi',
 'https://api.dicebear.com/9.x/notionists/svg?seed=Mihaly&backgroundColor=22c55e',
 'Hatarozott, precIz konyvelo-tIpus. A celja minel tobb bevetel es a koltsegek kordaban tartasa. Naponta elemzi a bevetelt/kiadast, figyeli a napi koltest, a bejovo es kimeno (nem teljesItett) szamlakat es az utalasokat, es konkret, szamokra epIto javaslatokat tesz a sporolasra. Az osszefoglalot Erikanak kuldi.',
 null, true, 3)
on conflict (key) do nothing;

insert into agent_status (key, daily_task, status, status_note) values
('mihaly', 'Bevetel/kiadas elemzese + napi penzugyi jelentes', 'idle', 'Keszenletben')
on conflict (key) do nothing;

-- Altalanos kulcs-ertek allapottar (pl. utolso latott rendeles a Telegram-ertesIteshez)
create table if not exists app_state (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);
alter table app_state enable row level security;
