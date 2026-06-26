/**
 * Prémium plakát HTML/CSS sablon → éles PNG a htmlcsstoimage.com-mal.
 * Ha nincs HCTI kulcs, a hívó visszaesik az SVG-re (creatives.buildDealPoster).
 */

export interface PosterData {
  imageUrl?: string;
  cutout?: string; // háttér nélküli termék (data URI) — ha van, EZT használjuk
  bgUrl?: string; // AI-generált jelenet-háttér (URL) — ha van, EZ a háttér
  productInScene?: boolean; // ha a háttérben MÁR benne van a laptop → ne tegyünk rá külön terméket
  productName: string;
  headline: string;
  priceHuf?: number;
  badges?: string[];
  features?: string[];
  specs?: { cpu?: string; ram?: string; storage?: string; display?: string; ports?: string; os?: string; condition?: string; warranty?: string };
  dateLabel?: string; // „melyik nap készült" — a plakátra kerülo dátum-bélyeg
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
        ? `<img class="scene" src="${esc(o.bgUrl)}"/><div class="scene-shade"></div>${
            o.productInScene ? "" : `<div class="deskband"></div><div class="deskedge"></div>`
          }`
        : `<div class="glow glow-a"></div><div class="glow glow-b"></div><div class="grid"></div><div class="desk"></div>`
    }

    <div class="top">
      <div class="logo"><img src="${LOGO_URL}"/></div>
      <div class="badges">${badges.map((b) => `<span>${esc(b)}</span>`).join("")}</div>
    </div>

    ${o.dateLabel ? `<div class="datestamp">📅 ${esc(o.dateLabel)}</div>` : ""}

    <div class="headline">${esc(o.headline)}</div>
    <div class="accent"></div>

    <div class="body">
      <ul class="specs">
        ${specRows.slice(0, 7).map(([ic, t]) => `<li><i>${ic}</i><span>${esc(t)}</span></li>`).join("")}
      </ul>
    </div>

    <div class="product">
      ${
        o.productInScene
          ? "" /* a laptop már a fal.ai jelenetben van → nincs külön termék-overlay */
          : o.cutout
          ? `<div class="floor"></div><div class="shadow"></div><img class="cut" src="${o.cutout}"/><div class="reflbox"><img src="${o.cutout}"/></div>`
          : o.imageUrl
          ? `<div class="pedestal"></div><img src="${esc(o.imageUrl)}"/>`
          : ""
      }
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
      linear-gradient(90deg, rgba(5,14,33,.92) 0%, rgba(5,14,33,.74) 32%, rgba(5,14,33,.24) 64%, rgba(5,14,33,.10) 100%),
      linear-gradient(0deg, rgba(5,14,33,.88) 0%, rgba(5,14,33,.0) 40%); }
  /* tiszta, fényes ELOTÉR-ASZTAL az iroda alsó sávjára → a termék EZEN áll (az iroda felül látszik).
     NINCS z-index → a DOM-sorrend miatt a háttér fölött, de a szöveg/termék/lábléc MÖGÖTT marad. */
  .deskband { position:absolute; left:0; right:0; bottom:0; height:235px;
    background:linear-gradient(0deg, rgba(7,14,30,.97) 0%, rgba(9,18,38,.82) 46%, rgba(11,22,46,.42) 80%, transparent 100%); }
  .deskedge { position:absolute; left:0; right:0; bottom:214px; height:2px;
    background:linear-gradient(90deg, transparent 4%, rgba(140,185,255,.30) 28%, rgba(150,195,255,.5) 50%, rgba(140,185,255,.30) 72%, transparent 96%); }
  .top { position:absolute; top:36px; left:44px; right:44px; display:flex; justify-content:space-between; align-items:flex-start; }
  /* Logó háttér NÉLKÜL, fehér változatban (jól látszik a sötét jeleneten) */
  .logo img { height:92px; display:block; filter: brightness(0) invert(1) drop-shadow(0 2px 5px rgba(0,0,0,.55)); }
  .badges { display:flex; gap:10px; }
  .badges span {
    font-weight:800; font-size:17px; letter-spacing:.3px; padding:10px 16px; border-radius:24px;
    color:#06122b; background:linear-gradient(135deg,#5cc8ff,#2f8cff); box-shadow:0 6px 20px rgba(47,140,255,.5);
  }
  /* dátum-bélyeg: melyik nap készült a kreatív (a logó alatt, a cím fölött) */
  .datestamp { position:absolute; top:140px; left:50px; font-size:18px; font-weight:700; color:#cfe0ff;
    background:rgba(5,14,33,.5); padding:5px 13px; border-radius:20px; letter-spacing:.3px; }
  .headline { position:absolute; top:208px; left:48px; right:650px; font-weight:900; font-size:40px; line-height:1.08;
    display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; max-height:92px; }
  .accent { position:absolute; top:320px; left:50px; width:120px; height:7px; border-radius:4px; background:linear-gradient(90deg,#5cc8ff,#2f8cff); }
  .body { position:absolute; top:360px; left:48px; right:44px; display:flex; }
  .specs { list-style:none; width:560px; }
  .specs li { display:flex; align-items:center; gap:16px; margin-bottom:18px; }
  .specs li i { font-size:26px; font-style:normal; width:34px; text-align:center; }
  .specs li span { font-size:25px; font-weight:600; color:#e9f2ff; }
  /* a termék egy FÉNYES FELÜLETEN áll: pódium-fény + valódi tükrözodés + kontakt-árnyék → nem lebeg.
     Abszolút pozicionálás, a "kontakt-vonal" (talp) ~104px a .product aljától. Nagyobb, arányos termék. */
  /* középpont változatlan (right:30 + width:620 → ugyanaz a középvonal, mint korábban) → a gép nem mozdul el,
     csak NAGYOBB lesz (a talp-vonalról felfelé no). */
  .product { position:absolute; right:30px; bottom:110px; width:620px; height:560px; }
  /* fényes felület-folt a talp körül (foként a stúdió-háttérhez) */
  .product .floor { position:absolute; left:50%; bottom:60px; width:600px; height:150px; transform:translateX(-50%); z-index:0;
    background:radial-gradient(ellipse 74% 58% at 50% 42%, rgba(120,165,245,.18) 0%, rgba(120,165,245,.05) 48%, transparent 74%); }
  /* eros kontakt-árnyék a talp alatt (az asztalon) → nem lebeg */
  .product .shadow { position:absolute; left:50%; bottom:96px; width:545px; height:60px; transform:translateX(-50%); z-index:1;
    background:radial-gradient(ellipse at center, rgba(0,0,0,.72) 0%, rgba(0,0,0,.34) 44%, transparent 72%); filter:blur(11px); }
  /* termék: a talpa a ~214px-es asztal-él vonalán (.cut bottom 104 + .product bottom 110), NAGYOBB max-méret */
  .product .cut { position:absolute; left:0; right:0; bottom:104px; margin:0 auto; max-width:600px; max-height:435px;
    display:block; z-index:3; filter:drop-shadow(0 18px 18px rgba(0,0,0,.45)); }
  /* valódi tükrözodés az asztalon: levágott, halványuló doboz a talp ALATT */
  .product .reflbox { position:absolute; left:0; right:0; bottom:8px; margin:0 auto; width:600px; height:98px; overflow:hidden; z-index:2;
    -webkit-mask-image:linear-gradient(to bottom, rgba(0,0,0,.5) 0%, transparent 86%);
            mask-image:linear-gradient(to bottom, rgba(0,0,0,.5) 0%, transparent 86%); }
  .product .reflbox img { width:auto; max-width:600px; max-height:435px; display:block; margin:0 auto;
    transform:scaleY(-1); transform-origin:top center; opacity:.45; }
  /* fallback (ha nincs kivágás): light pedestal a fehér hátteru fotóhoz */
  .pedestal { position:absolute; left:50%; top:50%; width:520px; height:300px; transform:translate(-50%,-45%);
    background:radial-gradient(ellipse at center, rgba(220,235,255,.95) 0%, rgba(220,235,255,.35) 42%, transparent 70%); filter:blur(2px); }
  .product img:not(.cut) { position:relative; max-width:520px; max-height:380px; display:block; margin:0 auto; filter:drop-shadow(0 24px 40px rgba(0,0,0,.45)); }
  .foot { position:absolute; left:0; right:0; bottom:0; height:104px; padding:0 44px; display:flex; align-items:center; justify-content:space-between; gap:24px;
    background:linear-gradient(0deg, rgba(3,10,26,.92), rgba(3,10,26,.55)); }
  .foot-left { flex:1; min-width:0; }
  .pname { font-size:18px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .contact { font-size:15px; color:#a9c8ff; margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .price { flex-shrink:0; font-size:60px; font-weight:900; color:#fff; text-shadow:0 4px 24px rgba(92,200,255,.6); }
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
