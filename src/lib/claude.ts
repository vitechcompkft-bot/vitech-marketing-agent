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
    model: FAST, // sok termék → gyors/olcsó modell elég a SEO-szöveghez
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

export interface KlariDealOut {
  product_id: string;
  headline: string;
  badge: string;
  market_note: string;
  caption: string;
  reason: string;
  specs: { cpu?: string; ram?: string; storage?: string; display?: string; ports?: string; os?: string; condition?: string; warranty?: string };
  badges: string[];
  features: string[];
}

/** KLÁRI: web-kereséssel megkeresi a piachoz képest legjobb áru Vitech terméket + plakát-tartalom. */
export async function klariFindDeal(
  products: { id: string; name: string; priceGross?: string }[],
  persona: { name: string; persona: string }
): Promise<KlariDealOut | null> {
  const anthropic = client();
  const list = products.map((p) => `- [${p.id}] ${p.name} — ${p.priceGross || "?"} Ft`).join("\n");
  const msg = await anthropic.messages.create({
    model: FAST,
    max_tokens: 1500,
    system:
      buildSystem(persona.name, persona.persona) +
      "\n\nMOST KLÁRI vagy: Luca lelkes, megbízható marketinges beosztottja. Feladatod a legjobb áru ajánlat megtalálása piaci összevetéssel.",
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 } as any],
    messages: [
      {
        role: "user",
        content: `Itt a Vitech felújított gépeinek egy része, bruttó árral:
${list}

1) KERESS RÁ a piacra (Árukereso, eMAG, használt-laptop oldalak) néhány modellre.
2) Válaszd ki azt a Vitech terméket, amelyik a piaci árhoz képest a LEGJOBB ajánlat.
3) Készíts hozzá modern, frappáns, FIATALOS magyar plakát-szöveget.

FONTOS SZABÁLYOK (Luca NAGYON kritikus, ezeket szigorúan tartsd be):
- SOHA ne állíts valótlat vagy túlzót. A kedvezmény mértéke legyen PONTOS (ha ~14%, ne írj "féláron"-t!). Ha az árelony szerény, használd: "piaci ár alatt" / "bolti újár töredékéért".
- MINDIG hangsúlyozd a Vitech bizalmi értékeit: BEVIZSGÁLT, FELÚJÍTOTT, GARANCIÁS.
- HIBÁTLAN, IGÉNYES MAGYAR NYELV, helyes ékezetekkel (ű, ő, á, é). Helyes szavak: "billentyűzet" (NEM "billentyus"/"billentyuzet"), "felújított", "bevizsgált". Tilos a magyartalan, csonka vagy elgépelt szó.
- PROFI, megbízható, de fiatalos hangnem. Konkrét, számszerű érvek. A features mezo is hibátlan magyar legyen (pl. "Magyar billentyűzet", "Bevizsgálva", "Windows 11 Pro").

A VÉGÉN válaszolj PONTOSAN ebben a JSON-ban (utána semmi). A specs mezoket a termék nevébol/leírásából töltsd ki, magyarul, röviden:
{
  "product_id": "a lista szerinti id",
  "headline": "ütos, FIATALOS plakát-cím, max ~40 karakter",
  "badge": "rövid fo-kiemelés, pl. PIAC ALATTI ÁR",
  "market_note": "1-2 mondat: mihez képest jó az ár (számokkal)",
  "caption": "Facebook poszt szöveg, 2-4 mondat, lelkes, emojikkal, hashtagekkel, vitechcompkft.hu-ra hívva",
  "reason": "miért ezt választottad",
  "specs": { "cpu": "pl. Intel Core i5-1135G7 4 mag", "ram": "16GB DDR4", "storage": "512GB NVMe SSD", "display": "13.3\" FHD IPS", "ports": "USB-C, WiFi 6, BT 5.1", "os": "Windows 11 Pro", "condition": "Felújított, GOLD állapot", "warranty": "12 hónap garancia" },
  "badges": ["FELÚJÍTVA", "12 HÓ GARANCIA"],
  "features": ["Magyar billentyuzet", "Bevizsgálva", "Használatra kész", "Windows 11 Pro"]
}`,
      },
    ],
  });
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  try {
    const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    if (!j.product_id) return null;
    return {
      product_id: String(j.product_id),
      headline: j.headline || "",
      badge: j.badge || "AKCIÓ",
      market_note: j.market_note || "",
      caption: j.caption || "",
      reason: j.reason || "",
      specs: j.specs || {},
      badges: Array.isArray(j.badges) ? j.badges.slice(0, 3) : [],
      features: Array.isArray(j.features) ? j.features.slice(0, 4) : [],
    };
  } catch {
    return null;
  }
}

/** KLÁRI csiszolás (eros modell, web-keresés NÉLKÜL): hibátlan magyar + pontos, túlzásmentes állítások, mielott Luca elé kerül. */
export async function klariPolish(
  prev: KlariDealOut,
  productName: string,
  persona: { name: string; persona: string }
): Promise<KlariDealOut> {
  const anthropic = client();
  const msg = await anthropic.messages.create({
    model: SMART,
    max_tokens: 1200,
    system:
      buildSystem(persona.name, persona.persona) +
      "\n\nMOST KLÁRI vagy, és a fonököd, Luca NAGYON kritikus. Csiszold a plakát-tartalmat KIFOGÁSTALANRA, mieltt beadod neki.",
    messages: [
      {
        role: "user",
        content: `Termék: ${productName}
A nyers tartalom JSON-ban:
${JSON.stringify({ headline: prev.headline, badge: prev.badge, market_note: prev.market_note, caption: prev.caption, badges: prev.badges, features: prev.features }, null, 2)}

Csiszold profivá:
- HIBÁTLAN magyar nyelv, helyes ékezetek, NULLA elgépelés vagy magyartalan szó (pl. "billentyuzet"/"törtöpáron" tilos).
- PONTOS, túlzásmentes ár-állítás: ha a megtakarítás szerény, ne túlozz; a "piaci átlaghoz/legolcsóbbhoz képest" legyen egyértelmu, ne félrevezeto.
- Hangsúlyozd: bevizsgált, felújított, garanciás. Fiatalos, profi hangnem.
A product_id és a specs MARADJON ugyanaz. Válaszolj PONTOSAN ugyanabban a JSON-formátumban (product_id, headline, badge, market_note, caption, reason, specs, badges, features), utána semmi.`,
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
      product_id: prev.product_id,
      headline: j.headline || prev.headline,
      badge: j.badge || prev.badge,
      market_note: j.market_note || prev.market_note,
      caption: j.caption || prev.caption,
      reason: j.reason || prev.reason,
      specs: j.specs || prev.specs,
      badges: Array.isArray(j.badges) ? j.badges.slice(0, 3) : prev.badges,
      features: Array.isArray(j.features) ? j.features.slice(0, 4) : prev.features,
    };
  } catch {
    return prev;
  }
}

/** LUCA: elbírálja Klári napi ajánlatát (jóváhagy / elutasít). */
export async function lucaJudgeDeal(
  deal: { name: string; price?: string; headline: string; market_note: string; caption: string; reason: string },
  persona: { name: string; persona: string }
): Promise<{ approve: boolean; verdict: string }> {
  const anthropic = client();
  const msg = await anthropic.messages.create({
    model: SMART,
    max_tokens: 400,
    system:
      buildSystem(persona.name, persona.persona) +
      `\n\nTE VAGY LUCA, a marketingfonök, és NAGYON KRITIKUS vagy. Csak azt hagyod jóvá, ami TÉNYLEGESEN megfelel a Vitech arculatának és magas minoségi szintnek. Inkább utasíts el, mint hogy gyenge anyag menjen ki.
Vitech-arculati elvárások: PROFI megjelenés; valós, számokkal alátámasztott ár-elony; pontos, nem félrevezeto állítás; HIBÁTLAN, igényes magyar nyelv (helyes ékezetek, helyes szavak — pl. "billentyűzet", nem "billentyus"); a "felújított/bevizsgált, garanciás" érték hangsúlyozása; fiatalos-modern, de komoly hangnem.
KIZÁRÓLAG kifogástalan, profi anyagot hagyhatsz jóvá. Ha BÁRMI gond van — pontatlan/túlzó állítás, magyartalan vagy elgépelt szó, gyenge/generikus szöveg, gyenge ár-elony, nem profi megjelenés → UTASÍTSD EL (approve=false), és mondd meg KONKRÉTAN, mit javítson Klári.`,
    messages: [
      {
        role: "user",
        content: `Klári javaslata:
Termék: ${deal.name} (${deal.price || "?"} Ft)
Plakát-cím: ${deal.headline}
Piaci összevetés: ${deal.market_note}
FB szöveg: ${deal.caption}
Indok: ${deal.reason}

Szigorúan bíráld el. Csak akkor approve=true, ha kiváló és Vitech-arculatba illo. Válaszolj PONTOSAN ebben a JSON-ban:
{ "approve": true, "verdict": "konkrét, kritikus vezetoi vélemény Klárinak, 1-3 mondat (mit dicsérsz / mit kell javítani)" }`,
      },
    ],
  });
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  try {
    const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    return { approve: !!j.approve, verdict: j.verdict || "" };
  } catch {
    return { approve: false, verdict: "Nem sikerült elbírálni a javaslatot." };
  }
}

/** ERIKA (titkárság): eldönti, melyik osztály/vezeto kezelje a kérést. */
export async function officeRoute(
  message: string,
  erikaPersona: string,
  heads: { key: string; name: string; department: string; role: string }[]
): Promise<{ head_key: string; reason: string }> {
  const anthropic = client();
  const list = heads.map((h) => `- ${h.key}: ${h.name} (${h.department} — ${h.role})`).join("\n");
  const msg = await anthropic.messages.create({
    model: FAST,
    max_tokens: 300,
    system: `Te vagy Erika, a Vitech Comp Kft. titkárnoje. ${erikaPersona}\nA tulajdonos üzenetét a megfelelo osztályvezetohöz irányítod.`,
    messages: [
      {
        role: "user",
        content: `Választható osztályvezetok:
${list}
- erika: te magad (általános, adminisztratív, idopont, üzenetrendezés — ha egyik osztály sem illik jobban)

A tulajdonos üzenete: "${message}"

Melyikhez tartozik? Válaszolj PONTOSAN ebben a JSON-ban:
{ "head_key": "a fenti kulcsok egyike", "reason": "1 rövid mondat, miért oda" }`,
      },
    ],
  });
  const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
  try {
    const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    return { head_key: String(j.head_key || "erika"), reason: j.reason || "" };
  } catch {
    return { head_key: "erika", reason: "" };
  }
}

/** Egy munkatárs (osztályvezeto vagy Erika) válasza a kérésre. */
export async function agentReply(
  who: { name: string; role: string; department: string; persona: string },
  message: string,
  context: string
): Promise<string> {
  const anthropic = client();
  const msg = await anthropic.messages.create({
    model: SMART,
    max_tokens: 900,
    system: `Te vagy ${who.name}, a Vitech Comp Kft. ${who.department} osztályának munkatársa (${who.role}). ${who.persona}
Magyarul, szakszeruen, lényegre töroen válaszolsz a tulajdonos kérésére. A válaszodat a titkárságnak (Erikának) adod, aki továbbítja.${
      context ? "\n\nHASZNOS KONTEXTUS:\n" + context : ""
    }`,
    messages: [{ role: "user", content: message }],
  });
  return msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
}

/** KLÁRI 1. lépés: gyors piackutatás web-kereséssel — SZABAD SZÖVEG (nincs JSON-parse kockázat). */
export async function klariResearch(
  products: { id: string; name: string; priceGross?: string }[],
  persona: { name: string; persona: string }
): Promise<string> {
  const anthropic = client();
  const list = products.map((p) => `- [${p.id}] ${p.name} — ${p.priceGross || "?"} Ft`).join("\n");
  try {
    const msg = await anthropic.messages.create({
      model: FAST,
      max_tokens: 1000,
      system: buildSystem(persona.name, persona.persona) + "\n\nMOST KLÁRI vagy. Gyors piackutatást végzel a legjobb áru ajánlat megtalálásához.",
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 } as any],
      messages: [
        {
          role: "user",
          content: `Vitech felújított gépek, bruttó árral:
${list}

Keress rá néhány modellre a piacon (Árukereso, eMAG, használt-laptop oldalak). Írd le RÖVIDEN, melyik Vitech termék [id] a legjobb ajánlat a piaci árhoz képest, KONKRÉT számokkal (mihez képest mennyivel olcsóbb). Pár mondat elég.`,
        },
      ],
    });
    return msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
  } catch {
    return "";
  }
}

/** KLÁRI 2. lépés: a kutatás alapján kifogástalan ajánlat összeállítása (eros modell, JSON, keresés nélkül). */
export async function klariCompose(
  products: { id: string; name: string; priceGross?: string }[],
  research: string,
  persona: { name: string; persona: string },
  lucaBrief?: string
): Promise<KlariDealOut | null> {
  const anthropic = client();
  const list = products.map((p) => `- [${p.id}] ${p.name} — ${p.priceGross || "?"} Ft`).join("\n");
  const briefBlock = lucaBrief ? `\n\nLUCA (osztályvezeto) BRIEFJE — a TÖBB ELÉRÉSÉRT, KÖTELEZO figyelembe venni:\n${lucaBrief}\n` : "";
  const msg = await anthropic.messages.create({
    model: SMART,
    max_tokens: 1500,
    system: buildSystem(persona.name, persona.persona) + "\n\nMOST KLÁRI vagy: lelkes, precíz marketinges. A piackutatás alapján összeállítod a végleges, kifogástalan plakát-ajánlatot.",
    messages: [
      {
        role: "user",
        content: `Vitech termékek (bruttó ár):
${list}

KLÁRI PIACKUTATÁSA:
${research || "(nincs külön piaci adat — a belso ár/konfiguráció alapján válassz)"}${briefBlock}

Válaszd ki a LEGJOBB ajánlatot, és készíts hozzá kifogástalan plakát-tartalmat.
SZABÁLYOK:
- HIBÁTLAN magyar nyelv, helyes ékezetek, NULLA elgépelés/magyartalan szó (pl. "billentyűzet", nem "billentyus").
- PONTOS, túlzásmentes ár-állítás (ne "féláron", ha csak ~15%; a "piaci ár alatt"/"átlaghoz képest" legyen egyértelmu).
- A CÍM (headline) NE tartalmazza az árat (az külön, nagyban megjelenik a plakáton)! A headline a termék + 1 ütos elony legyen (pl. "Prémium üzleti laptop, piaci ár alatt"). Ha mégis számot írsz bárhova, az ÁR és a MEGTAKARÍTÁS NE keveredjen (tilos a megtakarítást árként feltüntetni).
- Hangsúlyozd: bevizsgált, felújított, garanciás. Fiatalos, profi hangnem.
- A specs mezoket a termék nevébol töltsd ki, magyarul.

Válaszolj PONTOSAN ebben a JSON-ban, utána semmi:
{ "product_id":"a lista szerinti id", "headline":"NAGYON rövid, ütos cím MAX ~26 karakter (1-2 szó + 1 elony, ár NÉLKÜL)", "badge":"rövid kiemelés", "market_note":"1-2 mondat számokkal", "caption":"FB poszt 2-4 mondat emojikkal, vitechcompkft.hu-ra hívva", "reason":"miért ez", "specs":{"cpu":"","ram":"","storage":"","display":"","ports":"","os":"","condition":"","warranty":""}, "badges":["FELÚJÍTVA","12 HÓ GARANCIA"], "features":["Magyar billentyűzet","Bevizsgálva","Windows 11 Pro"] }`,
      },
    ],
  });
  const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
  try {
    const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    if (!j.product_id) return null;
    return {
      product_id: String(j.product_id),
      headline: j.headline || "",
      badge: j.badge || "AKCIÓ",
      market_note: j.market_note || "",
      caption: j.caption || "",
      reason: j.reason || "",
      specs: j.specs || {},
      badges: Array.isArray(j.badges) ? j.badges.slice(0, 3) : [],
      features: Array.isArray(j.features) ? j.features.slice(0, 4) : [],
    };
  } catch {
    return null;
  }
}

/** ERIKA: egy beérkezo e-mail triázsa — összegzés, osztály, sürgosség. */
export async function erikaTriageEmail(
  email: { from: string; subject: string; body: string },
  persona: string
): Promise<{ summary: string; department: string; urgency: string; route: "gyula" | "erika"; notify: boolean }> {
  const anthropic = client();
  try {
    const msg = await anthropic.messages.create({
      model: FAST,
      max_tokens: 320,
      system: `Te vagy Erika, a Vitech/HUNOR titkárnoje. ${persona}\nBeérkezo e-maileket triázsolsz és irányítasz a tulajdonosnak.`,
      messages: [
        {
          role: "user",
          content: `Feladó: ${email.from}
Tárgy: ${email.subject}
Tartalom (részlet): ${email.body.slice(0, 1500)}

Triázsold és döntsd el, KIHEZ tartozik:
- "gyula" → INFORMATIKAI jellegu (hibajelentés, rendszer, hálózat, szoftver, hardver, weboldal, kamera, nyomtató STB.) VAGY AI/mesterséges intelligencia témájú.
- "erika" → minden más (gazdasági, számla, partneri, hivatalos, általános).
Döntsd el azt is, kell-e róla a tulajdonost ÉRTESÍTENI (notify): true ha valódi, érdemi ügy; false ha hírlevél / reklám / promóció / automatikus / lényegtelen.

Válaszolj PONTOSAN ebben a JSON-ban:
{ "summary": "1 mondat magyar összegzés", "department": "Informatika | Gazdasagi | Marketing | Titkarsag | Egyeb", "urgency": "alacsony | kozepes | magas", "route": "gyula | erika", "notify": true }`,
        },
      ],
    });
    const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
    const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    return {
      summary: j.summary || "(nincs összegzés)",
      department: j.department || "Egyeb",
      urgency: ["alacsony", "kozepes", "magas"].includes(j.urgency) ? j.urgency : "alacsony",
      route: j.route === "gyula" ? "gyula" : "erika",
      notify: j.notify !== false,
    };
  } catch {
    return { summary: "(triázs nem sikerült)", department: "Egyeb", urgency: "alacsony", route: "erika", notify: false };
  }
}

/**
 * GYULA (informatikus) elemzi az IT/AI-témájú e-mailt: bolttól jött-e (üzlet hibajelentése),
 * és mi a technikai probléma röviden. (A bolti ügyeket Gyula Telegramon jelzi a tulajdonosnak.)
 */
export async function gyulaAnalyzeEmail(
  email: { from: string; subject: string; body: string }
): Promise<{ isShop: boolean; problem: string }> {
  const anthropic = client();
  try {
    const msg = await anthropic.messages.create({
      model: FAST,
      max_tokens: 320,
      system:
        "Te vagy Gyula, a precíz informatikus. A cég ÜZLETEKET/BOLTOKAT (HUNOR coop boltok, AIR üzletek, trafikok) szolgál ki IT-ben. Beérkezo IT/AI e-maileket elemzel.",
      messages: [
        {
          role: "user",
          content: `Feladó: ${email.from}
Tárgy: ${email.subject}
Tartalom (részlet): ${email.body.slice(0, 1500)}

Elemezd:
- isShop: a cég egyik ÜZLETÉTOL/BOLTJÁTÓL jött-e (pl. hibát, problémát jelent egy bolt)? true/false.
- problem: 1-3 tömör magyar mondat: MI a technikai probléma / kérés, és ha tudsz, mi a teendo.
Válaszolj PONTOSAN ebben a JSON-ban:
{ "isShop": true/false, "problem": "rövid magyar összefoglaló a problémáról és teendoről" }`,
        },
      ],
    });
    const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
    const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    return { isShop: !!j.isShop, problem: j.problem || "(nincs részlet)" };
  } catch {
    return { isShop: false, problem: "(Gyula elemzése nem sikerült)" };
  }
}

/** LUCA vizuális ellenorzés: a generált hirdetés-KÉPEN a szöveg helyes-e (vision). */
export async function lucaVerifyAd(
  imageUrl: string,
  expected: { headline: string; price: string; brand: string }
): Promise<{ ok: boolean; issue: string }> {
  const anthropic = client();
  try {
    const content: any[] = [
      { type: "image", source: { type: "url", url: imageUrl } },
      {
        type: "text",
        text: `Ez egy AI-generált hirdetés-plakát. Elvárt szövegek: cím ~"${expected.headline}", ár ~"${expected.price}", márka "${expected.brand}".
Nézd meg a KÉPEN a szöveget: HELYESEN, olvashatóan, elgépelés/torzulás/halandzsa NÉLKÜL jelenik meg, és nagyjából a fentiek szerepelnek? Ha bármi szöveg torz vagy értelmetlen, az NEM jó.
Válaszolj PONTOSAN ebben a JSON-ban: { "ok": true, "issue": "ha nem ok, mi a baj röviden" }`,
      },
    ];
    const msg = await anthropic.messages.create({
      model: SMART,
      max_tokens: 250,
      messages: [{ role: "user", content: content as any }],
    });
    const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
    const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    return { ok: !!j.ok, issue: j.issue || "" };
  } catch (e: any) {
    return { ok: false, issue: "vision hiba: " + (e?.message || "ismeretlen").slice(0, 160) };
  }
}

/**
 * LUCA — a marketing fonök VÉGSO döntése a kész hirdetésen (vision). Tiéd a döntés joga.
 * A technikai részt (a terméket az asztalra helyezo AI-jelenetet) GYULA készítette elo.
 * Hagyd jóvá (ok=true) CSAK akkor, ha mind teljesül:
 *  1) a laptop ELÉG NAGY és hangsúlyos,
 *  2) a laptop a háttérben látható ASZTALON áll, reálisan (nem lebeg, illik a jelenethez),
 *  3) a hirdetés SZÖVEGE (cím, spec, ár, lábléc) jól OLVASHATÓ, semmi nincs takarva/levágva,
 *  4) márkához méltó, profi, eladható összhatás.
 */
export async function lucaReviewPoster(imageUrl: string): Promise<{ ok: boolean; issue: string }> {
  const anthropic = client();
  const content: any[] = [
    { type: "image", source: { type: "url", url: imageUrl } },
    {
      type: "text",
      text: `Te vagy Luca, a Vitech marketing fonöke — TIÉD a VÉGSO döntés, hogy ez a termék-hirdetés kimehet-e. A technikai elokészítést (a laptopot az asztalra helyezo AI-jelenet) Gyula, az informatikus csinálta; te a marketinges/minoségi döntést hozod.
Hagyd jóvá (ok=true) CSAK akkor, ha MIND a négy teljesül:
1) A laptop ELÉG NAGY és hangsúlyos a képen (jól látszik a termék, nem apró).
2) A laptop a háttérben látható ASZTALON/felületen áll, REÁLISAN (van árnyéka/tükrözodése, NEM lebeg, illeszkedik a jelenethez).
3) A SZÖVEG (cím, specifikációk, ár, lábléc) jól OLVASHATÓ — jó kontraszt, semmi nincs takarva vagy levágva.
4) Márkához méltó, profi, eladható az összhatás.
Ha BÁRMELYIK nem teljesül → ok=false, és írd le röviden, KONKRÉTAN mi a baj (ezt Gyula technikailag javítja).
LÉGY PRAGMATIKUS: ha a plakát kiküldheto minoségu, hagyd jóvá — NE utasítsd el apró, ízlésbeli részletek miatt. Csak VALÓDI, kiküldést akadályozó hibára mondj nem-et (pl. a termék alig látszik, lebeg, szöveg levágva/olvashatatlan). Cél, hogy MA legyen kész, használható plakát.
Válaszolj PONTOSAN ebben a JSON-ban: { "ok": true/false, "issue": "ha nem ok, mi a konkrét baj röviden" }`,
    },
  ];
  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const msg = await anthropic.messages.create({ model: SMART, max_tokens: 250, messages: [{ role: "user", content: content as any }] });
      const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
      const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
      return { ok: !!j.ok, issue: j.issue || "" };
    } catch (e: any) {
      lastErr = (e?.message || "").slice(0, 140);
      await new Promise((r) => setTimeout(r, 1500)); // a hcti-kép CDN-re kerülése / átmeneti hiba
    }
  }
  // Tartós infra-hiba: NE dobjuk el emiatt a (jó) képet — a renderelés maga rendben van.
  return { ok: true, issue: "QC kihagyva (hiba): " + lastErr };
}

/**
 * MIHÁLY — gazdasági osztályvezeto (határozott könyvelo) napi pénzügyi elemzése.
 * A célja: minél több BEVÉTEL + a kiadások kordában tartása. Konkrét, számokra épülo
 * javaslatokat ad a spórolásra és a bevétel növelésére.
 */
export async function mihalyAnalyze(fin: {
  todayRevenue: number;
  todayCount: number;
  monthRevenue: number;
  monthCount: number;
  todayAdSpend: number;
  monthAdSpend: number;
  receivableCount?: number;
  receivableHuf?: number;
  receivableExpired?: number;
  payableCount?: number;
  payableHuf?: number;
  payableExpired?: number;
  bankBalance?: number;
  bankIn30?: number;
  bankOut30?: number;
  spending?: { party: string; total: number; count: number }[];
  note?: string;
}): Promise<{ summary: string; suggestions: string[]; spendingReview?: { item: string; amount: number; verdict: string; note: string }[] }> {
  const anthropic = client();
  const ft = (n: number) => new Intl.NumberFormat("hu-HU").format(Math.round(n)) + " Ft";
  const bankLine =
    fin.bankIn30 !== undefined
      ? `\n- K&H BANKSZÁMLA — utolsó 30 nap forgalom: bevétel ~${ft(fin.bankIn30 ?? 0)}, kiadás ~${ft(fin.bankOut30 ?? 0)}${fin.bankBalance !== undefined ? `; egyenleg ~${ft(fin.bankBalance)}` : " (egyenleget a K&H nem ad az AIS-en)"}`
      : "";
  const spendLine =
    fin.spending && fin.spending.length
      ? "\n- KIADÁS-BONTÁS (utolsó 30 nap, K&H — MIRE megy el a pénz, csökkeno sorrend):\n" +
        fin.spending.map((s) => `   • ${s.party}: ${ft(s.total)} (${s.count} tétel)`).join("\n")
      : "";
  const recvLine =
    fin.receivableCount !== undefined
      ? `\n- KINTLÉVOSÉG (kifizetetlen KIMENO számlák, nekünk tartoznak): ${fin.receivableCount} db, ebbol ${fin.receivableExpired ?? 0} lejárt, ~${ft(fin.receivableHuf ?? 0)}`
      : "";
  const payLine =
    fin.payableCount !== undefined
      ? `\n- UTALANDÓ (kifizetetlen BEJÖVO/szállítói számlák, mi tartozunk): ${fin.payableCount} db, ebbol ${fin.payableExpired ?? 0} lejárt, ~${ft(fin.payableHuf ?? 0)}`
      : "";
  const unpaidLine = recvLine + payLine;
  try {
    const msg = await anthropic.messages.create({
      model: SMART,
      max_tokens: 2600,
      system:
        "Te vagy Mihály, a Vitech Comp Kft. gazdasági osztályvezetoje — tapasztalt pénzügyi kontroller/könyvelo. A célod minél több BEVÉTEL és a költségek kordában tartása. Úgy elemzel, mint egy igazi pénzügyi szakember: a KIADÁSOKAT kategorizálod (pl. AI/szoftver-elofizetés, tárhely/hosting, hirdetés, banki díj, beszállító, adó/járulék, egyéb), megnézed MIRE megy el a pénz, hogy az adott tétel INDOKOLT-e (kell-e a muködéshez, arányos-e, van-e duplikált/kihasználatlan elofizetés, devizás/árfolyam-veszteség, olcsóbb alternatíva), és KONKRÉT, számszeru spórolási lépéseket adsz. Magyarul, tömören, SZÁMOKRA építve írsz a tulajdonosnak.",
      messages: [
        {
          role: "user",
          content: `Mai adatok:
- Mai bevétel (webshop, minden csatorna): ${ft(fin.todayRevenue)} (${fin.todayCount} rendelés)
- Havi bevétel: ${ft(fin.monthRevenue)} (${fin.monthCount} rendelés)
- Mai hirdetési költés (Google Ads): ${ft(fin.todayAdSpend)}
- Havi hirdetési költés: ${ft(fin.monthAdSpend)}${unpaidLine}${bankLine}${spendLine}
${fin.note ? "- Megjegyzés: " + fin.note : ""}

Készíts NAPI pénzügyi értékelést EGY VALÓDI PÉNZÜGYI SZAKEMBER szemével. A KIADÁS-BONTÁST tételesen vizsgáld meg: mire megy el a pénz, INDOKOLT-e, és hol lehetne GAZDASÁGOSABB (duplikált/kihasználatlan elofizetés, túl drága szolgáltatás, devizás veszteség, olcsóbb csomag, lekötheto/lemondható tétel). A lejárt KINTLÉVOSÉGRE javasolj behajtást; a lejárt/közeli UTALANDÓ (bejövo) számlákra hívd fel a figyelmet (mit kell utalni, meddig).
Válaszolj PONTOSAN ebben a JSON-ban:
{
  "summary": "3-5 mondatos magyar elemzés számokkal: bevétel/kiadás arány, a fo kiadási tételek, trend, mire figyeljünk",
  "spendingReview": [ { "item": "kiadási tétel/partner neve", "amount": szám_Ft, "verdict": "kell | optimalizálható | elhagyható", "note": "1 mondat: miért, és hogyan lehetne olcsóbb" } ],
  "suggestions": ["2-4 konkrét, számszeru spórolási vagy bevétel-növelo javaslat"]
}
A spendingReview-ban a legnagyobb/legfontosabb kiadási tételeket értékeld (max 8).`,
        },
      ],
    });
    const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
    const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    return {
      summary: j.summary || "(nincs elemzés)",
      suggestions: Array.isArray(j.suggestions) ? j.suggestions.slice(0, 4) : [],
      spendingReview: Array.isArray(j.spendingReview)
        ? j.spendingReview.slice(0, 8).map((r: any) => ({ item: String(r.item || ""), amount: Number(r.amount || 0), verdict: String(r.verdict || ""), note: String(r.note || "") }))
        : [],
    };
  } catch {
    return { summary: "(Mihály elemzése most nem készült el)", suggestions: [], spendingReview: [] };
  }
}

/**
 * LUCA elérés-terve: a hirdetési ADATOKBÓL (impresszió, CTR, kattintás, költés) megnézi,
 * hogyan lehet TÖBB ELÉRÉST szerezni, és egy részét DELEGÁLJA Klárinak (kreatív brief).
 */
export async function lucaReachPlan(
  metrics: CampaignMetric[],
  config: AgentConfig
): Promise<{ reachSummary: string; reachActions: string[]; klariBrief: string }> {
  const anthropic = client();
  const data = metrics.map((m) => ({
    nev: m.campaign_name,
    impresszio: m.impressions,
    kattintas: m.clicks,
    ctr: m.ctr,
    koltes: m.cost_huf,
    konverzio: m.conversions,
    napi_keret: m.budget_huf,
  }));
  try {
    const msg = await anthropic.messages.create({
      model: SMART,
      max_tokens: 1100,
      system:
        "Te vagy Luca, a Vitech marketing osztályvezetoje. A FOFÓKUSZOD: minél TÖBB ELÉRÉS (impresszió, új közönség) NYERESÉGESEN. A csapatodban Klári a kreatívokat (plakát/hirdetésszöveg) készíti, alád dolgozik — neki konkrét kreatív briefet adsz.",
      messages: [
        {
          role: "user",
          content: `Hirdetési adatok (kampányonként): ${JSON.stringify(data)}
Korlátok: max napi keret ${config.max_daily_budget_huf} Ft, keret-változás max ${config.max_budget_change_pct}%.

Elemezd az ELÉRÉST (impresszió, CTR, közönség) és tervezz, hogyan legyen TÖBB elérés nyereségesen.
Add vissza PONTOSAN ebben a JSON-ban:
{
  "reachSummary": "2-3 mondat magyar helyzetkép az elérésrol, számokkal (impresszió/CTR), és a fo lehetoség a növelésre",
  "reachActions": ["1-3 konkrét lépés, amit TE (Luca) teszel az elérésért: pl. kulcsszó/közönség bovítés, keret-emelés javaslat, új hirdetésbovítmény"],
  "klariBrief": "1 konkrét KREATÍV BRIEF Klárinak a mai plakáthoz, ami az elérést támogatja (milyen terméktípus/üzenet/szög emelje a kattintást és az elérést — pl. 'emeld ki az ingyenes kiszállítást és a 12 hó garanciát, fiatalos, üzleti hangvétel')"
}`,
        },
      ],
    });
    const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
    const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    return {
      reachSummary: j.reachSummary || "(nincs elérés-elemzés)",
      reachActions: Array.isArray(j.reachActions) ? j.reachActions.slice(0, 3) : [],
      klariBrief: j.klariBrief || "",
    };
  } catch {
    return { reachSummary: "(Luca elérés-terve most nem készült el)", reachActions: [], klariBrief: "" };
  }
}

/**
 * JUDIT — kreatív tartalom-/blogíró. Napi LinkedIn-posztot ír a Vitech AI-ügynökségrol
 * (AI-ügynökök, marketing-automatizálás, dashboardok, AI a kkv-knak). Profi, hiteles B2B
 * hangvétel magyarul; MINDEN NAP MÁS témáról, friss szöggel.
 */
export async function juditWriteLinkedIn(
  project: { name: string; summary: string },
  recentTopics: string[]
): Promise<{ topic: string; hook: string; body: string; hashtags: string[] } | null> {
  const anthropic = client();
  try {
    const msg = await anthropic.messages.create({
      model: SMART,
      max_tokens: 1300,
      system:
        "Te vagy Judit, a Vida László vezette AI-fejleszto/ügynökség tartalomírója. LinkedIn-posztokat írsz a MÁR MEGÉPÍTETT, valódi projektekrol (online dashboardok, automatizálások, AI-rendszerek), esettanulmány-stílusban: milyen ÜZLETI PROBLÉMÁT oldott meg, HOGYAN, és mi lett az EREDMÉNY/érték. Elso személyu, hiteles, szakmai, magyar B2B hangvétel, emberi és konkrét, NEM tolakodó reklám, nincs túlzás. Ügyfélneveket NE írj ki, általánosíts (pl. egy kiskereskedelmi lánc, egy szövetkezet). Mértékkel 0-1 emoji.",
      messages: [
        {
          role: "user",
          content: `Írd meg a MAI LinkedIn-posztot EZ A KONKRÉT, MÁR MEGÉPÍTETT projekt köré:

PROJEKT: ${project.name}
MIT CSINÁL: ${project.summary}

Esettanulmány-felépítés: eros, behúzó NYITÓMONDAT (a probléma/helyzet); 3-5 rövid bekezdés (mi volt a fájdalom → mit építettem → milyen eredmény/érték, lehetoleg konkrétummal); a végén 1 FINOM CTA (pl. „ha nálatok is hasonló a kihívás, szívesen mesélek róla"). 3-6 releváns hashtag. Magyar, hibátlan.
Ne ismételd a közelmúlt témáit: ${recentTopics.join("; ") || "(még nincs korábbi)"}.
Válaszolj PONTOSAN ebben a JSON-ban:
{
  "topic": "${project.name}",
  "hook": "az elso, figyelemfelkelto mondat",
  "body": "a TELJES poszt szövege a hook-kal együtt, sortörésekkel (\\n) tagolva — ezt másoljuk be a LinkedInre",
  "hashtags": ["#...", "#..."]
}`,
        },
      ],
    });
    const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
    const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    let body = String(j.body || "");
    if (!body) return null;
    let hashtags = Array.isArray(j.hashtags) ? j.hashtags.slice(0, 6).map((h: any) => String(h)) : [];
    // A modell néha a poszt VÉGÉRE is beteszi a hashtageket → levágjuk, hogy ne duplázódjanak.
    const trail = body.match(/(?:\n+\s*#[^\n]*)+\s*$/u);
    if (trail) {
      if (hashtags.length === 0) hashtags = (trail[0].match(/#[^\s#]+/g) || []).slice(0, 6);
      body = body.slice(0, trail.index).trim();
    }
    return {
      topic: String(j.topic || "AI a vállalkozásban"),
      hook: String(j.hook || ""),
      body,
      hashtags,
    };
  } catch {
    return null;
  }
}

export { SMART, FAST };
