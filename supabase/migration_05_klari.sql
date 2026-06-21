-- Migracio 05 - Klari (Luca beosztottja) napi ajanlat-posztjai
-- Futtasd a Supabase SQL Editorban.

create table if not exists klari_posts (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  product_id   text,
  product_name text,
  product_url  text,
  image_url    text,
  price_huf    numeric,
  market_note  text,        -- Klari piaci osszevetese (miert jo ar)
  headline     text,
  caption      text,        -- Facebook poszt szoveg
  poster_svg   text,        -- a plakat SVG-je
  luca_verdict text,        -- Luca velemenye/jovahagyasa
  status       text not null default 'proposed', -- proposed|approved|rejected|posted
  posted_at    timestamptz
);

alter table klari_posts enable row level security;
