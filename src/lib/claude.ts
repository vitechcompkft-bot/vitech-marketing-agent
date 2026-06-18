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
      "action": "budget_change | pause_ad | set_target_roas | note",
      "campaign_id": "a kampány id-ja vagy null",
      "campaign_name": "a kampány neve vagy null",
      "params": { "to": 6000 },        // budget_change-nél az új napi keret Ft-ban (to). set_target_roas-nál {"to": 3.5}.
      "reasoning": "rövid indoklás számokkal",
      "severity": "info | warning | critical"
    }
  ]
}

Szabályok:
- Ha minden rendben / kevés az adat: adj egyetlen "note" döntést "info" súllyal, a megfigyeléssel.
- budget_change csak akkor, ha a ROAS és a költés indokolja, és tartsd a max_keret_valtozas_pct lépésközt.
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

export { SMART, FAST };
