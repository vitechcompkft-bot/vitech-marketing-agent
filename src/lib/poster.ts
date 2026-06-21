/**
 * Prémium plakát HTML/CSS sablon → éles PNG a htmlcsstoimage.com-mal.
 * Ha nincs HCTI kulcs, a hívó visszaesik az SVG-re (creatives.buildDealPoster).
 */

export interface PosterData {
  imageUrl?: string;
  cutout?: string; // háttér nélküli termék (data URI) — ha van, EZT használjuk
  bgUrl?: string; // AI-generált jelenet-háttér (URL) — ha van, EZ a háttér
  productName: string;
  headline: string;
  priceHuf?: number;
  badges?: string[];
  features?: string[];
  specs?: { cpu?: string; ram?: string; storage?: string; display?: string; ports?: string; os?: string; condition?: string; warranty?: string };
}

const LOGO_URL = "https://vitech-marketing-agent.vercel.app/avatars/vitech-logo.png";
const esc = (s: string) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function buildPosterHtml(o: PosterData): { html: string; css: string } {
  const price = o.priceHuf ? new Intl.NumberFormat("hu-HU").format(Math.round(o.priceHuf)) + " Ft" : "";
  const badges = (o.badges && o.badges.length ? o.badges : ["FELÚJÍTVA", "12 HÓ GARANCIA"]).slice(0, 3);
  const specRows: [string, string][] = [
    ["⚙️", o.specs?.cpu],
    ["📊", o.specs?.ram],
    ["💾", o.specs?.storage],
    ["🖥️", o.specs?.display],
    ["🔌", o.specs?.ports],
    ["🪟", o.specs?.os],
    ["✅", o.specs?.condition],
    ["🛡️", o.specs?.warranty],
  ].filter((r) => r[1]) as [string, string][];

  const html = `
  <div class="poster">
    ${
      o.bgUrl
        ? `<img class="scene" src="${esc(o.bgUrl)}"/><div class="scene-shade"></div>`
        : `<div class="glow glow-a"></div><div class="glow glow-b"></div><div class="grid"></div><div class="desk"></div>`
    }

    <div class="top">
      <div class="logo"><img src="${LOGO_URL}"/></div>
      <div class="badges">${badges.map((b) => `<span>${esc(b)}</span>`).join("")}</div>
    </div>

    <div class="headline">${esc(o.headline)}</div>
    <div class="accent"></div>

    <div class="body">
      <ul class="specs">
        ${specRows.slice(0, 7).map(([ic, t]) => `<li><i>${ic}</i><span>${esc(t)}</span></li>`).join("")}
      </ul>
      <div class="product">
        ${
          o.cutout
            ? `<div class="shadow"></div><img class="cut" src="${o.cutout}"/>`
            : o.imageUrl
            ? `<div class="pedestal"></div><img src="${esc(o.imageUrl)}"/>`
            : ""
        }
      </div>
    </div>

    <div class="foot">
      <div class="foot-left">
        <div class="pname">${esc(o.productName).slice(0, 60)}</div>
        <div class="contact">vitechcompkft.hu · Bevizsgált, felújított gépek — garanciával</div>
      </div>
      ${price ? `<div class="price">${esc(price)}</div>` : ""}
    </div>
  </div>`;

  const css = `
  * { margin:0; padding:0; box-sizing:border-box; }
  body { margin:0; }
  .poster {
    position:relative; width:1200px; height:800px; overflow:hidden;
    font-family:'Montserrat',system-ui,Arial,sans-serif; color:#fff;
    background:
      radial-gradient(900px 600px at 88% 8%, rgba(255,244,214,.22) 0%, transparent 55%),
      linear-gradient(150deg,#081730 0%, #0c2350 48%, #11356e 100%);
  }
  /* iroda-környezet: meleg ablakfény + hideg bokeh + asztal-sík */
  .glow { position:absolute; border-radius:50%; filter:blur(80px); }
  .glow-a { width:520px; height:520px; right:-120px; top:-180px; background:rgba(255,236,196,.45); }
  .glow-b { width:460px; height:460px; left:-140px; top:120px; background:rgba(40,130,255,.40); }
  .desk { position:absolute; left:0; right:0; bottom:0; height:300px;
    background:linear-gradient(0deg, rgba(8,18,38,.96) 0%, rgba(12,32,72,.55) 55%, transparent 100%); }
  .grid { position:absolute; inset:0; opacity:.05;
    background-image:linear-gradient(#9cc4ff 1px,transparent 1px),linear-gradient(90deg,#9cc4ff 1px,transparent 1px);
    background-size:48px 48px; }
  /* AI jelenet-háttér + sötétíto réteg a szöveg olvashatóságáért (bal+alsó sötétebb) */
  .scene { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
  .scene-shade { position:absolute; inset:0;
    background:
      linear-gradient(90deg, rgba(5,14,33,.94) 0%, rgba(5,14,33,.80) 36%, rgba(5,14,33,.40) 68%, rgba(5,14,33,.30) 100%),
      linear-gradient(0deg, rgba(5,14,33,.90) 0%, rgba(5,14,33,.0) 42%); }
  .top { position:absolute; top:36px; left:44px; right:44px; display:flex; justify-content:space-between; align-items:flex-start; }
  .logo { background:#fff; border-radius:16px; padding:12px 18px; box-shadow:0 12px 30px rgba(0,0,0,.35); }
  .logo img { height:86px; display:block; }
  .badges { display:flex; gap:10px; }
  .badges span {
    font-weight:800; font-size:17px; letter-spacing:.3px; padding:10px 16px; border-radius:24px;
    color:#06122b; background:linear-gradient(135deg,#5cc8ff,#2f8cff); box-shadow:0 6px 20px rgba(47,140,255,.5);
  }
  .headline { position:absolute; top:210px; left:48px; right:560px; font-weight:900; font-size:50px; line-height:1.05; }
  .accent { position:absolute; top:320px; left:50px; width:120px; height:7px; border-radius:4px; background:linear-gradient(90deg,#5cc8ff,#2f8cff); }
  .body { position:absolute; top:360px; left:48px; right:44px; display:flex; }
  .specs { list-style:none; width:560px; }
  .specs li { display:flex; align-items:center; gap:16px; margin-bottom:18px; }
  .specs li i { font-size:26px; font-style:normal; width:34px; text-align:center; }
  .specs li span { font-size:25px; font-weight:600; color:#e9f2ff; }
  .product { position:absolute; right:10px; top:-10px; width:560px; height:430px; }
  /* háttér nélküli (kivágott) termék: nincs fehér doboz, csak lágy árnyék az "asztalon" */
  .product .cut { position:relative; max-width:560px; max-height:400px; display:block; margin:0 auto;
    filter:drop-shadow(0 30px 34px rgba(0,0,0,.55)); }
  .product .shadow { position:absolute; left:50%; bottom:14px; width:430px; height:54px; transform:translateX(-50%);
    background:radial-gradient(ellipse at center, rgba(0,0,0,.55) 0%, transparent 70%); filter:blur(6px); }
  /* fallback (ha nincs kivágás): light pedestal a fehér hátteru fotóhoz */
  .pedestal { position:absolute; left:50%; top:50%; width:520px; height:300px; transform:translate(-50%,-45%);
    background:radial-gradient(ellipse at center, rgba(220,235,255,.95) 0%, rgba(220,235,255,.35) 42%, transparent 70%); filter:blur(2px); }
  .product img:not(.cut) { position:relative; max-width:520px; max-height:380px; display:block; margin:0 auto; filter:drop-shadow(0 24px 40px rgba(0,0,0,.45)); }
  .foot { position:absolute; left:0; right:0; bottom:0; height:104px; padding:0 44px; display:flex; align-items:center; justify-content:space-between;
    background:linear-gradient(0deg, rgba(3,10,26,.92), rgba(3,10,26,.55)); }
  .pname { font-size:24px; font-weight:700; }
  .contact { font-size:17px; color:#a9c8ff; margin-top:4px; }
  .price { font-size:62px; font-weight:900; color:#fff; text-shadow:0 4px 24px rgba(92,200,255,.6); }
  `;

  return { html, css };
}

/** Renderelés PNG-vé a htmlcsstoimage.com-mal. Kulcs hiányában null (a hívó SVG-re esik vissza). */
export async function renderPosterPng(o: PosterData): Promise<string | null> {
  const uid = process.env.HCTI_USER_ID;
  const key = process.env.HCTI_API_KEY;
  if (!uid || !key) return null;
  try {
    const { html, css } = buildPosterHtml(o);
    const res = await fetch("https://hcti.io/v1/image", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + Buffer.from(`${uid}:${key}`).toString("base64"),
      },
      body: JSON.stringify({
        html,
        css,
        google_fonts: "Montserrat:wght@400;600;700;800;900",
        viewport_width: 1200,
        viewport_height: 800,
        device_scale: 2,
      }),
    });
    const j = await res.json();
    return j?.url || null;
  } catch {
    return null;
  }
}
