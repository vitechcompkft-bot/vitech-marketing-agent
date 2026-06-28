import { supabaseAdmin } from "./supabase";
import { juditWriteLinkedIn } from "./claude";
import { sendTelegram } from "./telegram";
import { getLinkedInStatus, postToLinkedIn, linkedinAutopostEnabled } from "./linkedin";
import { generateAdImage } from "./falai";

/**
 * Vida László MÁR MEGÉPÍTETT projektjei — Judit ezekrol ír esettanulmány-posztokat (naponta más).
 * Ügyfélnevek nélkül, üzleti probléma → megoldás → érték fókusszal. Bovítheto.
 */
const JUDIT_PROJECTS: { name: string; summary: string }[] = [
  { name: "Ügyviteli dashboard", summary: "Egy régi, csak LAN-on elérheto Firebird ügyviteli adatbázisból valós ideju, böngészos vezetoi dashboard — a vezetok telepítés nélkül, éloben látják a muködést (forgalom, tételek)." },
  { name: "Kereskedelmi dashboard", summary: "Egy kiskereskedelmi lánc kereskedelmi adatbázisából forgalom, készlet és toplisták egy átlátható felületen, vezetoi döntéstámogatáshoz." },
  { name: "Munkaügyi / HR dashboard", summary: "Bér- és HR-adatok (létszám, fluktuáció, bérköltség, demográfia, munkaido) 14 cégre egy helyen — a havi papír-riportok helyett, néhány kattintással." },
  { name: "HR dokumentumkezelo", summary: "Dolgozói dokumentumok digitális aláírása és naplózása; a meglévo bérrendszerbol olvas, és auditálható nyomot hagy minden aláírásról." },
  { name: "Leltározó rendszer", summary: "Elavult PSION kézi terminálok leváltása modern Android PDA-s (PWA) + webes leltárral — gyorsabb, olcsóbb, valós ideju készlet." },
  { name: "Nyomtató-flotta dashboard", summary: "Bolti és központi nyomtatók lapszámának automatikus gyujtése SNMP-vel, havi riporttal — kézi leolvasás nélkül, költségkontrollal." },
  { name: "Garancia-készíto", summary: "A beérkezo webshop-rendelésbol automatikusan garancialevél (PDF) + Excel-nyilvántartás készül, emberi munka nélkül — a bekötött e-mailbol dolgozik." },
  { name: "Belso intranet", summary: "Egy szövetkezet elavult belso intranetjének újraépítése modern stacken (Next.js + Supabase) — gyorsabb, biztonságosabb, karbantarthatóbb." },
  { name: "AI marketinges csapat", summary: "Egy teljes AI-marketingcsapat: napi kreatívok, hirdetés-figyelés, pénzügyi elemzés, uptime-felügyelet, automatikus számlázás — egy emberi ügynökség töredékáráért." },
  { name: "Webshop hirdetés-mérés", summary: "Egy felújított-laptop webshop teljes hirdetés-mérése: Google Ads konverziókövetés, Árukereso-feed, és valós ROAS egy dashboardon — végre látszik, mi térül meg." },
  { name: "Árcímke-nyomtató webapp", summary: "Árcímkék nyomtatása A4-es ívre böngészobol, közvetlenül az árukészlet-adatokból — gyors és hibamentes, sablonválasztással." },
  { name: "Fájl- és tartalomkiosztó", summary: "Fájlok és könyvjelzok központi, távoli kiosztása a bolti gépekre — egységesen, kézi telepítés nélkül." },
];

/** Judit egy LinkedIn-posztja (a marketing-csapat tartalomírója). */
export interface JuditPost {
  date: string;
  topic: string;
  hook: string;
  body: string;
  hashtags: string[];
  image?: string; // Klári által generált, a poszthoz illo AI-kép (LinkedInre is felkerül)
}

/** Judit státuszának frissítése (a „judit" sor upsert-tel jön létre, ha még nincs). */
async function setJuditStatus(status: string, note: string): Promise<void> {
  try {
    const sb = supabaseAdmin();
    await sb
      .from("agent_status")
      .upsert({ key: "judit", status, status_note: note, status_at: new Date().toISOString() }, { onConflict: "key" });
  } catch {
    /* a státusz nem kritikus */
  }
}

/** A tárolt LinkedIn-posztok (app_state.judit_posts, legújabb elöl). */
export async function getJuditPosts(): Promise<JuditPost[]> {
  try {
    const sb = supabaseAdmin();
    const { data } = await sb.from("app_state").select("value").eq("key", "judit_posts").maybeSingle();
    if (!data?.value) return [];
    return JSON.parse(data.value) as JuditPost[];
  } catch {
    return [];
  }
}

/** JUDIT napi feladata: egy ÚJ, változatos LinkedIn-poszt az AI-ügynökségrol → mentés + Telegram. */
export async function runJuditDaily(
  opts?: { force?: boolean }
): Promise<{ ok: boolean; post?: JuditPost; reason?: string; linkedin?: { posted: boolean; url?: string; error?: string } }> {
  const existing = await getJuditPosts();
  const dateLabel = new Intl.DateTimeFormat("hu-HU", { timeZone: "Europe/Budapest", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  // NAPONTA EGY poszt: ha ma már volt, kihagyjuk (kivéve force) — így a cron + kézi futás nem duplázza.
  if (!opts?.force && existing[0]?.date === dateLabel) {
    await setJuditStatus("done", `Mai poszt már kész: ${existing[0].topic}`);
    return { ok: true, post: existing[0], reason: "Ma már készült poszt — kihagyva." };
  }
  await setJuditStatus("working", "LinkedIn-poszt írása…");
  const recentTopics = existing.slice(0, 8).map((p) => p.topic).filter(Boolean);

  // A MAI projekt kiválasztása: a közelmúltban bemutatottakat kihagyjuk, forgó sorrendben.
  const used = new Set(recentTopics.map((t) => t.toLowerCase()));
  const freshProjects = JUDIT_PROJECTS.filter((p) => !used.has(p.name.toLowerCase()));
  const pickPool = freshProjects.length ? freshProjects : JUDIT_PROJECTS;
  const dayIdx = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest", day: "numeric" }).format(new Date()));
  const project = pickPool[dayIdx % pickPool.length];

  await setJuditStatus("working", `LinkedIn-poszt írása: ${project.name}…`);
  const w = await juditWriteLinkedIn(project, recentTopics);
  if (!w) {
    await setJuditStatus("error", "A LinkedIn-poszt most nem készült el.");
    return { ok: false, reason: "Judit most nem tudott posztot írni." };
  }

  // KLÁRI készít egy a poszthoz illo AI-képet (a LinkedInre is felkerül). Hiba esetén kép nélkül megy.
  await setJuditStatus("working", `Klári képet készít a poszthoz: ${project.name}…`);
  let imageUrl: string | undefined;
  try {
    const imgPrompt = `Professional modern concept illustration for a B2B LinkedIn post about: ${project.name}. Theme: ${project.summary} Corporate tech, clean editorial or isometric style, navy and bright blue brand colors, high quality, uncluttered. ABSOLUTELY NO text, NO words, NO letters, NO numbers, NO logos, NO watermark.`;
    imageUrl = (await generateAdImage(imgPrompt)) || undefined;
  } catch {
    /* kép nélkül is mehet */
  }

  const post: JuditPost = { date: dateLabel, topic: w.topic, hook: w.hook, body: w.body, hashtags: w.hashtags, image: imageUrl };
  const next = [post, ...existing].slice(0, 12);

  try {
    const sb = supabaseAdmin();
    await sb.from("app_state").upsert({ key: "judit_posts", value: JSON.stringify(next), updated_at: new Date().toISOString() });
  } catch {
    /* mentés nem kritikus a Telegram-küldéshez */
  }

  const tags = w.hashtags.join(" ");
  const fullText = `${w.body}${tags ? `\n\n${tags}` : ""}`;

  // AUTO-POSZT a LinkedInre, ha össze van kötve és nincs kikapcsolva.
  let liNote = "";
  let posted = false;
  let liUrl: string | undefined;
  let liError: string | undefined;
  try {
    const li = await getLinkedInStatus();
    if (li.connected && !li.expired && linkedinAutopostEnabled()) {
      const r = await postToLinkedIn(fullText, imageUrl);
      if (r.ok) {
        posted = true;
        liUrl = r.url;
        liNote = `\n\n✅ Kiposztolva a LinkedInre${r.url ? `: ${r.url}` : ""}`;
      } else {
        liError = r.error;
        liNote = `\n\n⚠️ LinkedIn-poszt nem ment ki: ${r.error}`;
      }
    } else if (li.connected && li.expired) {
      liError = "token lejárt";
      liNote = "\n\n⚠️ A LinkedIn token lejárt — kösd újra (Marketing oldal → LinkedIn összekötése).";
    }
  } catch {
    /* az auto-poszt hibája ne döntse el a futást */
  }

  await setJuditStatus("done", `Mai LinkedIn-poszt kész: ${w.topic}${posted ? " (kiposztolva)" : ""}`);
  await sendTelegram(`📝 *Judit — mai LinkedIn-poszt* (${w.topic})\n\n${fullText}${liNote}`).catch(() => {});

  return { ok: true, post, linkedin: { posted, url: liUrl, error: liError } };
}
