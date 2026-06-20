import Anthropic from "@anthropic-ai/sdk";
import type { AgentConfig, AgentDecision, CampaignMetric } from "./types";

function client() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Hiányzó ANTHROPIC_API_KEY.");
  return new Anthropic({ apiKey });
}

const SMART = process.env.CLAUDE_MODEL_SMART || "claude-opus-4-8";
const FAST = process.env.CLAUDE_MODEL_FAST || "claude-haiku-4-5-20251001";

const ROLE_BASE = `A Vitech Comp Kft. AI marketingese vagy. A cég FELÚJÍTOTT/HASZNÁLT üzleti
laptopokat árul (Lenovo, HP, Dell) Magyarországon, a vitechcompkft.hu webshopon keresztül.
A Google Ads (egyelőre 1 Performance Max kampány) teljesítményét felügyeled, és kreatívokat is gyártasz.

A célod: minél több NYERESÉGES vásárlás a keretből, és a cég folyamatos NÖVEKEDÉSE. Figyeld a ROAS-t,
a CTR-t, a CPC-t, a konverziós arányt és a költés ütemét.

Hangnem: magyar, lelkes, emberi, de mindig SZÁMOKRA épül. Üzleti tulajdonosnak (Vida László) írsz —
kerüld a fölösleges zsargont, légy konkrét.

ÖNÁLLÓSÁG: a rád bízott feladatokat magadtól, maradéktalanul elvégzed. CSAK akkor kérsz jóváhagyást /
teszel fel kérdést, ha az VALÓDI tulajdonosi/vezetői döntést igényel (pl. nagyobb stratégiai irányváltás,
jelentős plusz költségvetés, új csatorna indítása). A napi optimalizálást magadtól intézed.

KORLÁTOK (ezeket sosem lépheted át, a rendszer is kikényszeríti):
- Kampányt SOHA nem törölsz.
- Napi keretet csak a megengedett határig és lépésközzel módosíthatsz.
- Kevés adatnál (kevés kattintás) ne hozz drasztikus döntést — figyelj/várj.
- Minden döntésedet röviden indokold számokkal.`;

/** A teljes rendszer-prompt a beállított névvel + személyiséggel. */
function buildSystem(name: string, persona: string): string {
  return `A neved ${name}. Személyiséged: ${persona}\n\n${ROLE_BASE}`;
}

/**
 * Elemzi az aktuális metrikákat és JAVASLATOKAT/DÖNTÉSEKET ad vissza.
 * A döntéseket a guardrails réteg szűri meg, mielőtt bármi végrehajtódna.
 */
export async function analyzeMetrics(
  metrics: CampaignMetric[],
  config: AgentConfig,
  recentHistorySummary: string
): Promise<{ summary: string; decisions: AgentDecision[] }> {
  const anthropic = client();

  const userPayload = {
    most: metrics,
    korlatok: {
      max_napi_keret_huf: config.max_daily_budget_huf,
      max_keret_valtozas_pct: config.max_budget_change_pct,
      min_adat_kattintas: config.min_data_clicks,
      cel_roas: config.target_roas,
      szuneteltetes_engedelyezve: config.allow_pause_ads,
      keret_modositas_engedelyezve: config.allow_budget_changes,
    },
    legutobbi_trend: recentHistorySummary,
  };

  const instruction = `Elemezd az alábbi adatokat, és add vissza a döntéseidet PONTOSAN a következő JSON formátumban,
mindenféle extra szöveg nélkül:

{
  "summary": "1-3 mondatos, magyar összefoglaló a helyzetről (számokkal).",
  "decisions": [
    {
      "action": "budget_change | pause_ad | enable_ad | set_target_roas | add_sitelinks | add_callouts | note",
      "campaign_id": "a kampány id-ja vagy null",
      "campaign_name": "a kampány neve vagy null",
      "params": { },
      "reasoning": "rövid indoklás számokkal",
      "severity": "info | warning | critical"
    }
  ]
}

A params mezo akciónként:
- budget_change:  { "to": 6000 }                      // új napi keret Ft-ban
- set_target_roas:{ "to": 3.5 }
- pause_ad / enable_ad: { }                            // a campaign_id azonosítja a kampányt
- add_sitelinks:  { "sitelinks": [ { "text": "Lenovo laptopok", "description1": "Felújított ThinkPad", "description2": "12 hó garancia", "url": "https://vitechcompkft.hu/lenovo" } ] }   // 4 db, magyar, ütős
- add_callouts:   { "callouts": ["12 hónap garancia", "Bevizsgált gépek", "Gyors szállítás", "14 nap elállás"] }   // 4-6 db, rövid

Szabályok:
- Ha minden rendben / kevés az adat: adj egy "note" döntést "info" súllyal.
- budget_change csak akkor, ha a ROAS és a költés indokolja, és tartsd a max_keret_valtozas_pct lépésközt.
- OPTIMALIZÁLÁS: ha a CTR alacsony vagy a hirdetés gyenge lehet, javasolj add_sitelinks ÉS add_callouts akciókat
  KÉSZ, magyar szöveggel (a Vitech profiljához illoen: felújított Lenovo/HP/Dell üzleti laptopok). A sitelink URL-ek
  a vitechcompkft.hu alá mutassanak. Ezeket elég EGYSZER javasolni (ne ismételd, ha már van ilyen folyamatban).
- Ne javasolj olyat, amit a korlátok tiltanak.

ADATOK:
${JSON.stringify(userPayload, null, 2)}`;

  const msg = await anthropic.messages.create({
    model: SMART,
    max_tokens: 1200,
    system: buildSystem(config.agent_name, config.agent_persona),
    messages: [{ role: "user", content: instruction }],
  });

  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  try {
    const jsonStr = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const parsed = JSON.parse(jsonStr);
    return {
      summary: parsed.summary ?? "Nincs összefoglaló.",
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
    };
  } catch {
    return { summary: text || "Az elemzés nem értelmezhető.", decisions: [] };
  }
}

/** Beszélgetés az Agenttel (dashboard / Telegram). */
export async function chatWithAgent(
  history: { role: "user" | "assistant"; content: string }[],
  context: string,
  persona: { name: string; persona: string } = { name: "Luca", persona: "" }
): Promise<string> {
  const anthropic = client();
  const msg = await anthropic.messages.create({
    model: SMART,
    max_tokens: 1000,
    system: `${buildSystem(persona.name, persona.persona)}\n\nAKTUÁLIS KONTEXTUS (friss számok és események):\n${context}`,
    messages: history.length ? history : [{ role: "user", content: "Szia! Mi a helyzet a hirdetésekkel?" }],
  });
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/** Kreatív szövegét generálja egy briefből (hirdetés/plakát/FB-poszt). */
export async function generateCreativeCopy(
  brief: string,
  kind: string,
  persona: { name: string; persona: string }
): Promise<{ headline: string; subhead: string; badge: string; cta: string }> {
  const anthropic = client();
  const sizeHint =
    kind === "story_poster"
      ? "álló plakát/story (1080×1920) — lehet kicsit hosszabb headline"
      : kind.startsWith("google")
      ? "Google hirdetés — RÖVID, ütős headline (max ~30 karakter)"
      : "Facebook poszt — figyelemfelkeltő, közösségi hangvétel";

  const msg = await anthropic.messages.create({
    model: SMART,
    max_tokens: 400,
    system: buildSystem(persona.name, persona.persona),
    messages: [
      {
        role: "user",
        content: `Készíts egy ${sizeHint} kreatívhoz szöveget a következő briefre: "${brief}".
A cég: Vitech Comp — felújított/használt üzleti laptopok (Lenovo, HP, Dell), 12 hó garancia, 14 nap elállás.
Válaszolj PONTOSAN ebben a JSON-ban, semmi mással:
{ "headline": "...", "subhead": "...", "badge": "rövid kiemelés pl. 12 HÓNAP GARANCIA", "cta": "pl. vitechcompkft.hu" }`,
      },
    ],
  });
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  try {
    const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    return {
      headline: j.headline || "Felújított laptopok",
      subhead: j.subhead || "Bevizsgált gépek, 12 hó garanciával",
      badge: j.badge || "12 HÓNAP GARANCIA",
      cta: j.cta || "vitechcompkft.hu",
    };
  } catch {
    return {
      headline: "Felújított laptopok",
      subhead: "Bevizsgált gépek, 12 hó garanciával",
      badge: "12 HÓNAP GARANCIA",
      cta: "vitechcompkft.hu",
    };
  }
}

/** Egy termékhez jobb, eladásra optimalizált SEO-t javasol (csak ha érdemben jobb). */
export async function generateSeo(
  p: { name: string; priceGross?: string; currentTitle?: string; currentDescription?: string; currentKeywords?: string },
  persona: { name: string; persona: string }
): Promise<{ improve: boolean; title: string; description: string; keywords: string; reason: string }> {
  const anthropic = client();
  const msg = await anthropic.messages.create({
    model: SMART,
    max_tokens: 600,
    system: buildSystem(persona.name, persona.persona),
    messages: [
      {
        role: "user",
        content: `Egy felújított laptop/számítógép termék SEO-ját nézzük a vitechcompkft.hu webshopon.
Termék: ${p.name}
${p.priceGross ? "Ár: " + p.priceGross + " Ft\n" : ""}Jelenlegi SEO oldalcím: ${p.currentTitle || "(nincs)"}
Jelenlegi meta leírás: ${p.currentDescription || "(nincs)"}
Jelenlegi kulcsszavak: ${p.currentKeywords || "(nincs)"}

Készíts JOBB, eladásra optimalizált magyar SEO-t. CSAK akkor jelezz javítást (improve=true), ha érdemben jobb a jelenleginél.
- title: max ~60 karakter, a fo terméknév + 1 ütos elem (pl. "12 hó garancia").
- description: max ~155 karakter, vonzó, vásárlásra ösztönzo, tartalmazza a kulcs-elonyt (bevizsgált, garancia, gyors szállítás).
- keywords: 8-15 releváns magyar kulcsszó, vesszovel elválasztva.
Válaszolj PONTOSAN ebben a JSON-ban, semmi mással:
{ "improve": true, "title": "...", "description": "...", "keywords": "...", "reason": "rövid indok magyarul" }`,
      },
    ],
  });
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  try {
    const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    return {
      improve: !!j.improve,
      title: j.title || "",
      description: j.description || "",
      keywords: j.keywords || "",
      reason: j.reason || "",
    };
  } catch {
    return { improve: false, title: "", description: "", keywords: "", reason: "az elemzés nem értelmezheto" };
  }
}

export { SMART, FAST };
