# Vitech AI Marketinges Agent 🤖

Önálló (KORLÁTOZOTT) marketing-ügynök, amely figyeli a **Google Ads** (később Meta) hirdetéseket,
riaszt, **javasol** és — a beállított autonómia + korlátok szerint — **be is avatkozik**.
Van **dashboard** felülete és **Telegram** botja a kétirányú kommunikációhoz.

## Mit tud
- ⏰ **Óránkénti figyelés** (Vercel cron) → metrikák lekérése → mentés → Claude-elemzés.
- 🛡️ **Kemény korlátok (guardrails):** max. napi keret, max. lépésközű keret-változás, kampányt SOHA nem töröl, vész-leállító.
- 🤝 **3 autonómia szint:** csak javaslat / auto kicsiben / teljesen automatikus (korlátokkal).
- 📊 **Dashboard:** élő számok, riasztások, jóváhagyandó javaslatok, teljes beavatkozás-napló.
- 💬 **Chat + Telegram:** kérdezhetsz, parancsolhatsz (`/status`, `/stop`, `/start`, `/approve_<id>`).
- 🧠 **Claude** az agy (claude-opus-4-8).

## Stack
Next.js (App Router) · Supabase (Postgres) · Anthropic SDK · google-ads-api · Telegram Bot API · Vercel.

---

## 1) Telepítés (helyi fejlesztés — mock módban azonnal fut)
```bash
cd C:\Projects\vitech-marketing-agent
npm install
copy .env.example .env.local      # töltsd ki (mock módhoz elég az ANTHROPIC_API_KEY + Supabase)
npm run dev                       # http://localhost:3000
```
> `USE_MOCK_DATA=true` esetén Google Ads token NÉLKÜL is működik, teszt-számokkal.

## 2) Supabase
1. Hozz létre egy Supabase projektet.
2. SQL Editor → futtasd a `supabase/schema.sql` teljes tartalmát.
3. A projekt **URL**-jét és **anon** + **service_role** kulcsát írd a `.env.local`-ba.

## 3) Anthropic (Claude)
- `ANTHROPIC_API_KEY` a console.anthropic.com-ról.

## 4) Telegram bot
1. [@BotFather](https://t.me/BotFather) → `/newbot` → kapsz egy **token**-t → `TELEGRAM_BOT_TOKEN`.
2. Írj a botodnak egy üzenetet, majd a chat-azonosítód: nyisd meg
   `https://api.telegram.org/bot<TOKEN>/getUpdates` → `chat.id` → `TELEGRAM_CHAT_ID`.
3. Találj ki egy `TELEGRAM_WEBHOOK_SECRET`-et.
4. Deploy után állítsd be a webhookot (egyszer):
   ```
   https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<APP>.vercel.app/api/telegram/webhook&secret_token=<WEBHOOK_SECRET>
   ```

## 5) Google Ads API (éles adat — USE_MOCK_DATA=false)
> A **fejlesztői token** jóváhagyása pár napot vehet igénybe (Google Ads → Eszközök → API Center).
1. **Developer token** a Manager (MCC) fiókból → `GOOGLE_ADS_DEVELOPER_TOKEN`.
2. Google Cloud projekt → OAuth kliens (Desktop/Web) → `CLIENT_ID`, `CLIENT_SECRET`.
3. **Refresh token** (pl. OAuth playground vagy a google-ads-api segéd) → `REFRESH_TOKEN`.
4. `GOOGLE_ADS_CUSTOMER_ID` = a hirdető fiók 10 jegyű azonosítója (kötőjel nélkül).
   `GOOGLE_ADS_LOGIN_CUSTOMER_ID` = a Manager fiók, ha van.
5. Állítsd `USE_MOCK_DATA=false`.

## 6) Vercel deploy
1. Push GitHubra → importáld Vercelbe.
2. Másold be az összes `.env` változót a Vercel projekt beállításaiba.
3. A `vercel.json` óránkénti cront állít be (`/api/cron/monitor`). Add meg a `CRON_SECRET`-et.
4. ⚠️ **Védd le a dashboardot!** (Vercel Authentication / Password, vagy építs be Supabase Auth-ot) —
   az appon belül nincs bejelentkezés, mert eredetileg egyszemélyes belső eszköz.

---

## Korlátok (alapértelmezések — a Beállításokban módosíthatók)
| Korlát | Alap | Mit véd |
|---|---|---|
| `max_daily_budget_huf` | 6000 | egy kampány napi kerete sosem lépheti túl |
| `max_budget_change_pct` | 25% | egy lépésben max ennyi a keret-változás |
| `min_data_clicks` | 30 | ennyi katt. alatt nincs „kemény" döntés |
| `allow_create_campaign` | false | új kampányt SOHA automatikusan |
| kampány törlése | — | **soha**, kódból sincs rá lehetőség |
| `agent_enabled` | true | **vész-leállító** (dashboard + `/stop`) |

## Meta (Facebook) bővítés — később
Az architektúra `channel: "google" | "meta"` mezővel készült. A Meta hozzáadásához:
`src/lib/metaAds.ts` (Marketing API kliens, ugyanaz az interfész, mint a googleAds.ts), és a
`getCampaignMetrics()` egyesíti a két csatorna adatait. A guardrails/agent/dashboard változatlanul működik.

## Biztonság
- A pénzügyi/akciós lépések mind a `guardrails.ts`-en mennek át, és **naplózódnak** (`actions` tábla).
- Service role kulcs csak szerveren. Anon kulcs a böngészőben semmihez nem fér (RLS).
- Telegram webhook + cron titokkal védett.
