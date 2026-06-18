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
