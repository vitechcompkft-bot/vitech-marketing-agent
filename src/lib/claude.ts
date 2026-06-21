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
  persona: { name: string; persona: string }
): Promise<KlariDealOut | null> {
  const anthropic = client();
  const list = products.map((p) => `- [${p.id}] ${p.name} — ${p.priceGross || "?"} Ft`).join("\n");
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
${research || "(nincs külön piaci adat — a belso ár/konfiguráció alapján válassz)"}

Válaszd ki a LEGJOBB ajánlatot, és készíts hozzá kifogástalan plakát-tartalmat.
SZABÁLYOK:
- HIBÁTLAN magyar nyelv, helyes ékezetek, NULLA elgépelés/magyartalan szó (pl. "billentyűzet", nem "billentyus").
- PONTOS, túlzásmentes ár-állítás (ne "féláron", ha csak ~15%; a "piaci ár alatt"/"átlaghoz képest" legyen egyértelmu).
- A CÍM (headline) NE tartalmazza az árat (az külön, nagyban megjelenik a plakáton)! A headline a termék + 1 ütos elony legyen (pl. "Prémium üzleti laptop, piaci ár alatt"). Ha mégis számot írsz bárhova, az ÁR és a MEGTAKARÍTÁS NE keveredjen (tilos a megtakarítást árként feltüntetni).
- Hangsúlyozd: bevizsgált, felújított, garanciás. Fiatalos, profi hangnem.
- A specs mezoket a termék nevébol töltsd ki, magyarul.

Válaszolj PONTOSAN ebben a JSON-ban, utána semmi:
{ "product_id":"a lista szerinti id", "headline":"ütos cím max ~40 karakter", "badge":"rövid kiemelés", "market_note":"1-2 mondat számokkal", "caption":"FB poszt 2-4 mondat emojikkal, vitechcompkft.hu-ra hívva", "reason":"miért ez", "specs":{"cpu":"","ram":"","storage":"","display":"","ports":"","os":"","condition":"","warranty":""}, "badges":["FELÚJÍTVA","12 HÓ GARANCIA"], "features":["Magyar billentyűzet","Bevizsgálva","Windows 11 Pro"] }`,
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

export { SMART, FAST };
