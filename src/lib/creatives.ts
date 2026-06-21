import type { CreativeKind } from "./types";

const DIMS: Record<CreativeKind, { w: number; h: number; label: string }> = {
  google_landscape: { w: 1200, h: 628, label: "Google banner (fekvő 1.91:1)" },
  google_square: { w: 1200, h: 1200, label: "Google banner (négyzet 1:1)" },
  fb_landscape: { w: 1200, h: 630, label: "Facebook link-poszt (1.91:1)" },
  fb_square: { w: 1080, h: 1080, label: "Facebook feed-poszt (1:1)" },
  story_poster: { w: 1080, h: 1920, label: "Story / Plakát (9:16)" },
};

export function creativeLabel(kind: CreativeKind) {
  return DIMS[kind].label;
}
export const CREATIVE_KINDS = Object.keys(DIMS) as CreativeKind[];

const esc = (s: string) =>
  (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function wrap(text: string, maxChars: number): string[] {
  const words = (text || "").split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars && cur) {
      lines.push(cur.trim());
      cur = w;
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 4);
}

/** Márkás, letisztult kreatív SVG-ként. Böngészőben renderel; PNG-be menthető. */
export function buildCreativeSVG(
  kind: CreativeKind,
  copy: { headline: string; subhead: string; badge: string; cta: string }
): string {
  const { w, h } = DIMS[kind];
  const cx = w / 2;
  const base = Math.min(w, h);

  const fontFamily = `'Segoe UI', 'Helvetica Neue', Arial, sans-serif`;
  const hSize = Math.round(base * (kind === "story_poster" ? 0.085 : 0.105));
  const subSize = Math.round(base * 0.04);
  const badgeSize = Math.round(base * 0.035);
  const ctaSize = Math.round(base * 0.042);
  const logoR = Math.round(base * 0.05);

  const hlLines = wrap(copy.headline, kind === "story_poster" ? 16 : 14);
  // függőleges középre igazítás a headline-blokkra
  const blockMid = h * (kind === "story_poster" ? 0.5 : 0.52);
  const lineGap = hSize * 1.12;
  const startY = blockMid - ((hlLines.length - 1) * lineGap) / 2;

  const headlineTspans = hlLines
    .map(
      (ln, i) =>
        `<text x="${cx}" y="${startY + i * lineGap}" text-anchor="middle" font-family="${fontFamily}" font-weight="800" font-size="${hSize}" fill="#ffffff">${esc(ln)}</text>`
    )
    .join("");

  // badge pill méretezés
  const badgeText = esc(copy.badge);
  const badgeW = Math.max(badgeText.length * badgeSize * 0.62 + badgeSize * 1.6, base * 0.3);
  const badgeY = startY + hlLines.length * lineGap + base * 0.02;
  const badgeH = badgeSize * 2.1;

  const subY = badgeY + badgeH + base * 0.07;
  const ctaY = h - base * 0.09;

  // logó "V"
  const logoY = h * (kind === "story_poster" ? 0.16 : 0.17);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#08163a"/>
      <stop offset="1" stop-color="#123a6a"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="38%" r="60%">
      <stop offset="0" stop-color="#2e86ff" stop-opacity="0.30"/>
      <stop offset="1" stop-color="#2e86ff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>

  <!-- logó V -->
  <g transform="translate(${cx},${logoY})">
    <rect x="${-logoR}" y="${-logoR}" width="${logoR * 2}" height="${logoR * 2}" rx="${logoR * 0.32}" fill="#1A73E8"/>
    <text x="0" y="${logoR * 0.38}" text-anchor="middle" font-family="${fontFamily}" font-weight="900" font-size="${logoR * 1.25}" fill="#ffffff">V</text>
  </g>
  <text x="${cx}" y="${logoY + logoR * 1.9}" text-anchor="middle" font-family="${fontFamily}" font-weight="700" font-size="${base * 0.028}" fill="#aebed4" letter-spacing="2">VITECH COMP</text>

  <!-- headline -->
  ${headlineTspans}

  <!-- piros akcentvonal -->
  <rect x="${cx - base * 0.06}" y="${startY + hlLines.length * lineGap - hSize * 0.55}" width="${base * 0.12}" height="${Math.max(4, base * 0.008)}" rx="3" fill="#E8232F"/>

  <!-- badge -->
  <g transform="translate(${cx - badgeW / 2},${badgeY})">
    <rect width="${badgeW}" height="${badgeH}" rx="${badgeH / 2}" fill="#1A73E8"/>
    <text x="${badgeW / 2}" y="${badgeH * 0.66}" text-anchor="middle" font-family="${fontFamily}" font-weight="700" font-size="${badgeSize}" fill="#ffffff">${badgeText}</text>
  </g>

  <!-- subhead -->
  ${wrap(copy.subhead, 38)
    .map(
      (ln, i) =>
        `<text x="${cx}" y="${subY + i * subSize * 1.3}" text-anchor="middle" font-family="${fontFamily}" font-weight="400" font-size="${subSize}" fill="#cfd9ea">${esc(ln)}</text>`
    )
    .join("")}

  <!-- CTA -->
  <text x="${cx}" y="${ctaY}" text-anchor="middle" font-family="${fontFamily}" font-weight="700" font-size="${ctaSize}" fill="#ffffff">${esc(copy.cta)} →</text>
</svg>`;
}

const APP_URL = "https://vitech-marketing-agent.vercel.app";
const LOGO_URL = `${APP_URL}/avatars/vitech-logo.png`;

/**
 * Klári napi ajánlat-plakátja — gazdag, fiatalos Vitech stílus:
 * fejléc a Vitech logóval + termékcím, jelvények, feature-sáv, spec-lista ikonokkal,
 * termékfotó, alul ár + elérhetoség. 1200×800 (FB feed / link-poszt).
 */
export function buildDealPoster(o: {
  imageUrl?: string;
  productName: string;
  headline: string;
  priceHuf?: number;
  badges?: string[];
  features?: string[];
  specs?: { cpu?: string; ram?: string; storage?: string; display?: string; ports?: string; os?: string; condition?: string; warranty?: string };
}): string {
  const w = 1200,
    h = 800;
  const ff = `'Segoe UI','Helvetica Neue',Arial,sans-serif`;
  const NAVY = "#11243f",
    BLUE = "#1a73e8";
  const priceTxt = o.priceHuf ? new Intl.NumberFormat("hu-HU").format(Math.round(o.priceHuf)) + " Ft" : "";

  // Spec-sorok (csak a kitöltöttek)
  const specRows = [
    ["🧠", o.specs?.cpu],
    ["📊", o.specs?.ram],
    ["💾", o.specs?.storage],
    ["🖥", o.specs?.display],
    ["🔌", o.specs?.ports],
    ["🪟", o.specs?.os],
    ["✅", o.specs?.condition],
    ["🛡", o.specs?.warranty],
  ].filter((r) => r[1]) as [string, string][];

  const specStartY = 360;
  const specGap = 50;
  const specSvg = specRows
    .slice(0, 7)
    .map(
      ([ic, txt], i) =>
        `<text x="56" y="${specStartY + i * specGap}" font-family="${ff}" font-size="25">${ic}</text>` +
        `<text x="100" y="${specStartY + i * specGap}" font-family="${ff}" font-weight="600" font-size="25" fill="${NAVY}">${esc(txt).slice(0, 42)}</text>`
    )
    .join("");

  // Felso jelvény-chipek (jobb felül, a fejlécben)
  const badges = (o.badges && o.badges.length ? o.badges : ["FELÚJÍTVA", "GARANCIA"]).slice(0, 3);
  let bx = w - 40;
  const badgeSvg = badges
    .slice()
    .reverse()
    .map((b) => {
      const bw = esc(b).length * 12 + 34;
      bx -= bw + 10;
      return `<g transform="translate(${bx},44)"><rect width="${bw}" height="38" rx="19" fill="${BLUE}"/><text x="${bw / 2}" y="25" text-anchor="middle" font-family="${ff}" font-weight="800" font-size="17" fill="#ffffff">${esc(b)}</text></g>`;
    })
    .join("");

  // Cím a fejléc ALATT (nincs átfedés), max 2 sor
  const hlLines = wrap(o.headline, 40).slice(0, 2);
  const hlStartY = 250;

  // Termékfotó tiszta FEHÉR háttéren (a fehér hátteru termékkép így "háttér nélkülinek" hat)
  const photo = o.imageUrl
    ? `<image href="${esc(o.imageUrl)}" x="650" y="330" width="500" height="360" preserveAspectRatio="xMidYMid meet"/>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="navybar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#0a1b34"/>
      <stop offset="1" stop-color="#15315c"/>
    </linearGradient>
  </defs>
  <!-- TISZTA FEHÉR háttér → a termékfotó fehér háttere belesimul -->
  <rect width="${w}" height="${h}" fill="#ffffff"/>

  <!-- fejléc: nagy logó + jelvények -->
  <image href="${LOGO_URL}" x="40" y="34" width="250" height="150" preserveAspectRatio="xMidYMid meet"/>
  ${badgeSvg}
  <rect x="0" y="196" width="${w}" height="3" fill="#e3e9f2"/>

  <!-- cím (a fejléc alatt, átfedés nélkül) -->
  ${hlLines
    .map(
      (ln, i) =>
        `<text x="50" y="${hlStartY + i * 50}" font-family="${ff}" font-weight="800" font-size="42" fill="${NAVY}">${esc(ln)}</text>`
    )
    .join("")}
  <rect x="52" y="${hlStartY + hlLines.length * 50 - 4}" width="110" height="6" rx="3" fill="${BLUE}"/>

  <!-- spec-lista -->
  ${specSvg}

  <!-- termékfotó -->
  ${photo}

  <!-- alsó sáv: ár + elérhetoség -->
  <rect x="0" y="${h - 96}" width="${w}" height="96" fill="url(#navybar)"/>
  <text x="40" y="${h - 54}" font-family="${ff}" font-weight="700" font-size="23" fill="#ffffff">${esc(o.productName).slice(0, 50)}</text>
  <text x="40" y="${h - 26}" font-family="${ff}" font-size="17" fill="#aecbff">vitechcompkft.hu · Bevizsgált, felújított gépek — garanciával</text>
  ${priceTxt ? `<text x="${w - 40}" y="${h - 34}" text-anchor="end" font-family="${ff}" font-weight="900" font-size="58" fill="#ffffff">${priceTxt}</text>` : ""}
</svg>`;
}
