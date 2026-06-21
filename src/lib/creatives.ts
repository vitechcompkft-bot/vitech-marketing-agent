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

/**
 * Klári napi ajánlat-plakátja: termék FOTÓVAL + ütos cím + ár + Vitech arculat.
 * 1080×1080 (Facebook feed). A fotó URL-rol töltodik (kliensoldali render / PNG).
 */
export function buildDealPoster(o: {
  imageUrl?: string;
  headline: string;
  badge: string;
  priceHuf?: number;
}): string {
  const w = 1080,
    h = 1080,
    cx = w / 2;
  const ff = `'Segoe UI','Helvetica Neue',Arial,sans-serif`;
  const imgH = 600; // felso fotó-sáv
  const priceTxt = o.priceHuf ? new Intl.NumberFormat("hu-HU").format(Math.round(o.priceHuf)) + " Ft" : "";
  const hlLines = wrap(o.headline, 22).slice(0, 2);
  const hlY = imgH + 120;
  const hlSize = 64;

  const imageTag = o.imageUrl
    ? `<image href="${esc(o.imageUrl)}" x="0" y="0" width="${w}" height="${imgH}" preserveAspectRatio="xMidYMid slice" clip-path="url(#imgclip)"/>`
    : `<rect width="${w}" height="${imgH}" fill="#0f2a52"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <clipPath id="imgclip"><rect x="0" y="0" width="${w}" height="${imgH}"/></clipPath>
    <linearGradient id="dbg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0a1b40"/>
      <stop offset="1" stop-color="#13396b"/>
    </linearGradient>
    <linearGradient id="ishade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.6" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#0a1b40" stop-opacity="0.95"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#dbg)"/>
  ${imageTag}
  <rect x="0" y="0" width="${w}" height="${imgH}" fill="url(#ishade)"/>

  <!-- badge -->
  <g transform="translate(40,40)">
    <rect width="${Math.max(esc(o.badge).length * 22 + 60, 220)}" height="64" rx="32" fill="#E8232F"/>
    <text x="${Math.max(esc(o.badge).length * 22 + 60, 220) / 2}" y="42" text-anchor="middle" font-family="${ff}" font-weight="800" font-size="30" fill="#ffffff">${esc(o.badge)}</text>
  </g>

  <!-- Vitech logó -->
  <g transform="translate(${w - 96},44)">
    <rect width="56" height="56" rx="14" fill="#1A73E8"/>
    <text x="28" y="42" text-anchor="middle" font-family="${ff}" font-weight="900" font-size="40" fill="#ffffff">V</text>
  </g>

  <!-- headline -->
  ${hlLines
    .map(
      (ln, i) =>
        `<text x="60" y="${hlY + i * hlSize * 1.1}" font-family="${ff}" font-weight="800" font-size="${hlSize}" fill="#ffffff">${esc(ln)}</text>`
    )
    .join("")}

  <!-- ár -->
  ${
    priceTxt
      ? `<text x="60" y="${hlY + hlLines.length * hlSize * 1.1 + 90}" font-family="${ff}" font-weight="900" font-size="92" fill="#36d399">${priceTxt}</text>`
      : ""
  }

  <!-- piros akcentvonal -->
  <rect x="60" y="${imgH + 50}" width="120" height="8" rx="4" fill="#E8232F"/>

  <!-- CTA -->
  <text x="60" y="${h - 60}" font-family="${ff}" font-weight="700" font-size="38" fill="#aebed4">vitechcompkft.hu — Bevizsgált gépek, 12 hó garancia</text>
</svg>`;
}
