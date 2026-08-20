import { supabaseAdmin } from "./supabase";
import { sendMail } from "./mailer";
import { sendTelegram } from "./telegram";
import { unasGetOrderByKey, type OrderDetail, type UnasOrderSummary } from "./unas";

/**
 * VEVoI RENDELÉS-VISSZAIGAZOLÓ EMAIL.
 * Az Unas nem küld visszaigazolót, ezért mi küldünk: a webshop-szinkron (30 percenként) elkapja az ÚJ
 * rendeléseket, és a vevonek kiküld egy szép, márkázott HTML levelet.
 *
 * Biztonsági elvek:
 *  - ELSo futáskor (aktiválás) MINDEN meglévo rendelést „elintézettnek” jelölünk → a RÉGI rendelésekre
 *    SOHA nem megy ki utólag levél. Csak az aktiválás UTÁN érkezo rendelések kapnak emailt.
 *  - Duplikáció-védelem: egy rendelésre max egyszer megy ki (sentKeys).
 *  - Saját/teszt rendelés (Vida László / tulaj e-mailjei) kimarad.
 *  - Küldési hiba esetén max 3 próbálkozás, utána Telegram-figyelmeztetés (nem küldünk kétszer a vevonek).
 */

const STATE_KEY = "order_email_state";
const LOGO = "https://vitechcompkft.hu/!common_design/custom/vitechcompkft.unas.hu/element/layout_hu_header_logo-400x120_1_default.png";
const BRAND = "#1a6dc4";
const BRAND_DARK = "#0f4c8a";
const WEB = "www.vitechcompkft.hu";
const CONTACT_EMAIL = "info@vitechcompkft.hu";
const PHONE = "+36 30 742 9555";
const MAX_PER_RUN = 5; // egy szinkron-körben max ennyi levél (burst-védelem)
const MAX_ATTEMPTS = 3;

interface State {
  activatedAt: string | null;
  sentKeys: string[];
  attempts: Record<string, number>;
}

const ft = (n: number) => new Intl.NumberFormat("hu-HU").format(Math.round(n || 0)) + " Ft";
const esc = (s: string) =>
  (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Tulajdonos saját/teszt rendelése — ne menjen rá vevoi visszaigazoló. */
function isOwnerOrder(o: UnasOrderSummary): boolean {
  const n = (o.customerName || o.invoiceName || "").toLowerCase();
  if (n.includes("vida") && n.includes("lászló")) return true;
  if (n.includes("vida") && n.includes("laszlo")) return true;
  if (n.includes("vitech")) return true;
  const email = (o.email || "").toLowerCase().trim();
  return email === "vitechcompkft@gmail.com" || email === "v.laszlo@hunorcoop.hu";
}

async function loadState(): Promise<State> {
  try {
    const { data } = await supabaseAdmin().from("app_state").select("value").eq("key", STATE_KEY).maybeSingle();
    if (data?.value) {
      const j = JSON.parse(data.value);
      return {
        activatedAt: j.activatedAt || null,
        sentKeys: Array.isArray(j.sentKeys) ? j.sentKeys : [],
        attempts: j.attempts && typeof j.attempts === "object" ? j.attempts : {},
      };
    }
  } catch {
    /* elso futás */
  }
  return { activatedAt: null, sentKeys: [], attempts: {} };
}

async function saveState(s: State): Promise<void> {
  await supabaseAdmin()
    .from("app_state")
    .upsert({ key: STATE_KEY, value: JSON.stringify(s), updated_at: new Date().toISOString() });
}

/** A szép HTML visszaigazoló levél (tételekkel, ha van OrderDetail). */
export function buildOrderEmail(
  summary: UnasOrderSummary,
  detail: OrderDetail | null
): { subject: string; html: string; text: string } {
  const name = (detail?.customerName || summary.customerName || summary.invoiceName || "Vásárló").trim();
  const orderNo = summary.key;
  const date = summary.date || "";
  const total = detail?.sumGross || summary.sumGross || 0;
  const payment = detail?.payment?.name || "";
  const items = detail?.items || [];

  // Tétel-sorok
  const rows =
    items.length > 0
      ? items
          .map((it) => {
            const line = (it.unitGross || 0) * (it.quantity || 1);
            return `<tr>
              <td style="padding:10px 12px;border-bottom:1px solid #eef1f4;font-size:14px;color:#233;">${esc(it.name)}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #eef1f4;font-size:14px;color:#233;text-align:center;white-space:nowrap;">${it.quantity || 1} db</td>
              <td style="padding:10px 12px;border-bottom:1px solid #eef1f4;font-size:14px;color:#233;text-align:right;white-space:nowrap;">${ft(line)}</td>
            </tr>`;
          })
          .join("")
      : `<tr><td colspan="3" style="padding:10px 12px;border-bottom:1px solid #eef1f4;font-size:14px;color:#233;">${esc(
          summary.firstItem || "Megrendelt termékek"
        )}${summary.itemCount > 1 ? ` <span style="color:#889;">és még ${summary.itemCount - 1} tétel</span>` : ""}</td></tr>`;

  const paymentRow = payment
    ? `<tr><td style="padding:6px 0;color:#667;font-size:14px;">Fizetési mód</td><td style="padding:6px 0;color:#233;font-size:14px;text-align:right;font-weight:600;">${esc(payment)}</td></tr>`
    : "";

  const html = `<!doctype html><html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rendelés visszaigazolása</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Köszönjük a rendelésed a Vitech Comp Kft.-nél! Rendelésszám: ${esc(orderNo)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(20,40,80,0.06);">
        <!-- Fejléc -->
        <tr><td style="background:#ffffff;padding:22px 28px 10px;border-bottom:3px solid ${BRAND};" align="center">
          <img src="${LOGO}" alt="Vitech Comp Kft." width="200" style="display:block;max-width:200px;height:auto;">
        </td></tr>
        <!-- Zöld visszaigazoló sáv -->
        <tr><td style="padding:26px 28px 6px;" align="center">
          <div style="width:56px;height:56px;line-height:56px;border-radius:50%;background:#e8f6ee;color:#1a9e56;font-size:30px;margin:0 auto 12px;">&#10004;</div>
          <h1 style="margin:0;font-size:22px;color:#16324f;">Köszönjük a rendelésed!</h1>
          <p style="margin:8px 0 0;font-size:15px;color:#5a6b7b;">Megkaptuk a megrendelésedet, és hamarosan feldolgozzuk.</p>
        </td></tr>
        <!-- Megszólítás -->
        <tr><td style="padding:18px 28px 0;">
          <p style="margin:0;font-size:15px;color:#233;">Kedves <strong>${esc(name)}</strong>!</p>
          <p style="margin:10px 0 0;font-size:15px;color:#3a4a5a;line-height:1.55;">Köszönjük, hogy a <strong>Vitech Comp Kft.</strong>-t választottad. Az alábbiakban összefoglaljuk a rendelésed részleteit. Amint feldolgoztuk és feladtuk a csomagot, errol külön értesítünk.</p>
        </td></tr>
        <!-- Rendelés-adatok -->
        <tr><td style="padding:18px 28px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f9fb;border:1px solid #eef1f4;border-radius:10px;">
            <tr>
              <td style="padding:12px 16px;font-size:13px;color:#667;">Rendelésszám<br><span style="font-size:16px;color:${BRAND_DARK};font-weight:700;">${esc(orderNo)}</span></td>
              <td style="padding:12px 16px;font-size:13px;color:#667;text-align:right;">Dátum<br><span style="font-size:15px;color:#233;font-weight:600;">${esc(date)}</span></td>
            </tr>
          </table>
        </td></tr>
        <!-- Tételek -->
        <tr><td style="padding:18px 28px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eef1f4;border-radius:10px;overflow:hidden;">
            <tr style="background:${BRAND};">
              <td style="padding:10px 12px;color:#fff;font-size:13px;font-weight:700;">Termék</td>
              <td style="padding:10px 12px;color:#fff;font-size:13px;font-weight:700;text-align:center;">Menny.</td>
              <td style="padding:10px 12px;color:#fff;font-size:13px;font-weight:700;text-align:right;">Ár</td>
            </tr>
            ${rows}
            <tr>
              <td colspan="2" style="padding:14px 12px;font-size:15px;color:#16324f;font-weight:700;">Összesen (bruttó)</td>
              <td style="padding:14px 12px;font-size:17px;color:${BRAND_DARK};font-weight:800;text-align:right;white-space:nowrap;">${ft(total)}</td>
            </tr>
          </table>
        </td></tr>
        ${paymentRow ? `<tr><td style="padding:12px 28px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${paymentRow}</table></td></tr>` : ""}
        <!-- Következo lépések -->
        <tr><td style="padding:18px 28px 0;">
          <div style="background:#eef5fd;border-radius:10px;padding:14px 16px;font-size:14px;color:#2c4a66;line-height:1.55;">
            <strong>Mi történik most?</strong><br>
            Csapatunk ellenorzi és feldolgozza a rendelésed. Ha bármilyen kérdésed van, válaszolj erre a levélre, vagy keress minket az alábbi elérhetoségeken.
          </div>
        </td></tr>
        <!-- Kapcsolat -->
        <tr><td style="padding:20px 28px 4px;" align="center">
          <p style="margin:0;font-size:14px;color:#5a6b7b;">Kérdésed van? Szívesen segítünk:</p>
          <p style="margin:8px 0 0;font-size:14px;color:#233;">
            &#9742; <a href="tel:${PHONE.replace(/\s/g, "")}" style="color:${BRAND_DARK};text-decoration:none;">${PHONE}</a> &nbsp;•&nbsp;
            &#9993; <a href="mailto:${CONTACT_EMAIL}" style="color:${BRAND_DARK};text-decoration:none;">${CONTACT_EMAIL}</a>
          </p>
          <p style="margin:6px 0 0;font-size:14px;"><a href="https://${WEB}" style="color:${BRAND};text-decoration:none;font-weight:600;">${WEB}</a></p>
        </td></tr>
        <!-- Lábléc -->
        <tr><td style="padding:22px 28px 26px;" align="center">
          <div style="border-top:1px solid #eef1f4;padding-top:16px;font-size:12px;color:#9aa7b3;line-height:1.6;">
            <strong style="color:#67788a;">Vitech Comp Kft.</strong><br>
            Felújított és használt informatikai eszközök &middot; ${WEB}<br>
            Ezt a visszaigazolást a rendelésed miatt kaptad.
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  // Sima-szöveges fallback
  const textLines = [
    `Kedves ${name}!`,
    ``,
    `Köszönjük a rendelésed a Vitech Comp Kft.-nél!`,
    `Rendelésszám: ${orderNo}`,
    `Dátum: ${date}`,
    ``,
    `Tételek:`,
    ...(items.length
      ? items.map((it) => `- ${it.name} (${it.quantity || 1} db) — ${ft((it.unitGross || 0) * (it.quantity || 1))}`)
      : [`- ${summary.firstItem || "Megrendelt termékek"}${summary.itemCount > 1 ? ` és még ${summary.itemCount - 1} tétel` : ""}`]),
    ``,
    `Összesen (bruttó): ${ft(total)}`,
    payment ? `Fizetési mód: ${payment}` : ``,
    ``,
    `Hamarosan feldolgozzuk a rendelésed. Kérdés esetén válaszolj erre a levélre, vagy hívj: ${PHONE}.`,
    ``,
    `Üdvözlettel,`,
    `Vitech Comp Kft. — ${WEB}`,
  ].filter((l) => l !== undefined);

  return {
    subject: `Rendelésed visszaigazolása – Vitech Comp Kft. (#${orderNo})`,
    html,
    text: textLines.join("\n"),
  };
}

/**
 * Az ÚJ rendelésekre visszaigazoló levelet küld. A webshop-szinkronból hívjuk (a friss Unas-listával + tokennel).
 * Elso futáskor csak AKTIVÁL (a meglévoket elintézettnek jelöli), nem küld historikus levelet.
 */
export async function notifyNewOrders(
  token: string,
  fetched: UnasOrderSummary[]
): Promise<{ sent: number; skipped: number; activated?: boolean }> {
  const state = await loadState();

  // ELSo futás → aktiválás: minden jelenlegi rendelést elintézettnek jelölünk, nem küldünk visszamenoleg.
  if (!state.activatedAt) {
    state.activatedAt = new Date().toISOString();
    state.sentKeys = fetched.map((o) => o.key).filter(Boolean);
    await saveState(state);
    return { sent: 0, skipped: fetched.length, activated: true };
  }

  const sent = new Set(state.sentKeys);
  const newOnes = fetched.filter((o) => o.key && !sent.has(o.key));
  let sentCount = 0;
  let skipped = 0;

  for (const o of newOnes) {
    if (sentCount >= MAX_PER_RUN) break;
    if (isOwnerOrder(o)) {
      sent.add(o.key);
      skipped++;
      continue;
    }
    if (!o.email) {
      sent.add(o.key); // nincs email — nem tudunk küldeni, de ne próbálgassuk újra
      skipped++;
      continue;
    }
    if ((state.attempts[o.key] || 0) >= MAX_ATTEMPTS) {
      skipped++;
      continue;
    }

    let detail: OrderDetail | null = null;
    try {
      detail = await unasGetOrderByKey(token, o.key);
    } catch {
      /* a részletes tételek nélkül is megy a levél */
    }
    const mail = buildOrderEmail(o, detail);
    const r = await sendMail({
      to: o.email,
      fromName: "Vitech Comp Kft.",
      replyTo: CONTACT_EMAIL,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });

    if (r.ok) {
      sent.add(o.key);
      sentCount++;
    } else {
      state.attempts[o.key] = (state.attempts[o.key] || 0) + 1;
      if (state.attempts[o.key] >= MAX_ATTEMPTS) {
        await sendTelegram(
          `⚠️ *Vevoi visszaigazoló email NEM ment ki* (${MAX_ATTEMPTS} próba után)\nRendelés: ${o.key} · ${o.email}\nOk: ${r.error || "ismeretlen"}`
        ).catch(() => {});
      }
    }
  }

  state.sentKeys = [...sent].slice(-3000); // ne nojön korlátlanul
  await saveState(state);
  return { sent: sentCount, skipped };
}
