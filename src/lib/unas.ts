/**
 * Unas API kliens — bejelentkezés + termék lekérés/írás.
 * Az UNAS_API_KEY-bol szerez egy ideiglenes tokent, azzal hívja az XML API-t.
 * Docs: az Unas API XML-alapú; végpont: https://api.unas.hu/shop/<metódus>
 */
const API_BASE = "https://api.unas.hu/shop";

function pick(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : undefined;
}

/** Bejelentkezés → ideiglenes token. */
export async function unasLogin(): Promise<string> {
  const key = process.env.UNAS_API_KEY;
  if (!key) throw new Error("Hiányzó UNAS_API_KEY env.");
  const body = `<?xml version="1.0" encoding="UTF-8" ?>\n<Params><ApiKey>${key}</ApiKey></Params>`;
  const res = await fetch(`${API_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/xml" },
    body,
  });
  const text = await res.text();
  const token = pick(text, "Token");
  if (!token) throw new Error("Unas login sikertelen: " + text.slice(0, 400));
  return token;
}

export interface UnasProduct {
  id: string;
  sku?: string;
  name: string;
  url?: string;
  imageUrl?: string;
  priceGross?: string;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
}

/** CDATA-t és sima szöveget is kezelo mezo-kiolvasás egy XML blokkból. */
function field(block: string, tag: string): string | undefined {
  const m = block.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`));
  return m ? m[1].trim() : undefined;
}

function cdata(s: string | undefined): string {
  return `<![CDATA[${s ?? ""}]]>`;
}

/** Termékek lekérése értelmezett formában (SEO-mezokkel együtt). */
export async function unasGetProducts(
  token: string,
  opts?: { limitNum?: number; limitStart?: number }
): Promise<UnasProduct[]> {
  const xml = await unasGetProductsRaw(token, {
    limitNum: opts?.limitNum ?? 30,
    limitStart: opts?.limitStart ?? 0,
    contentType: "full",
  });
  const blocks = xml.match(/<Product>[\s\S]*?<\/Product>/g) || [];
  return blocks
    .map((b): UnasProduct => {
      const meta = (b.match(/<Meta>([\s\S]*?)<\/Meta>/) || [])[1] || "";
      const priceBlock = (b.match(/<Price>([\s\S]*?)<\/Price>/) || [])[1] || "";
      const imagesBlock = (b.match(/<Images>([\s\S]*?)<\/Images>/) || [])[1] || "";
      const imgMatch = imagesBlock.match(/<Medium>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/Medium>/);
      return {
        id: (b.match(/<Id>(\d+)<\/Id>/) || [])[1] || "",
        sku: field(b, "Sku"),
        name: field(b, "Name") || "",
        url: field(b, "Url"),
        imageUrl: imgMatch ? imgMatch[1].trim() : undefined,
        priceGross: field(priceBlock, "Gross"),
        metaTitle: field(meta, "Title"),
        metaDescription: field(meta, "Description"),
        metaKeywords: field(meta, "Keywords"),
      };
    })
    .filter((p) => p.id);
}

/** Egy termék SEO-mezoinek (Meta Title/Description/Keywords) frissítése. */
export async function unasSetProductSeo(
  token: string,
  id: string,
  seo: { title?: string; description?: string; keywords?: string }
): Promise<{ ok: boolean; message: string }> {
  const fields: string[] = [];
  if (seo.title !== undefined) fields.push(`<Title>${cdata(seo.title)}</Title>`);
  if (seo.description !== undefined) fields.push(`<Description>${cdata(seo.description)}</Description>`);
  if (seo.keywords !== undefined) fields.push(`<Keywords>${cdata(seo.keywords)}</Keywords>`);

  const body =
    `<?xml version="1.0" encoding="UTF-8" ?>\n` +
    `<Products><Product><Action>modify</Action><Id>${id}</Id>` +
    `<Meta>${fields.join("")}</Meta>` +
    `</Product></Products>`;

  const res = await fetch(`${API_BASE}/setProduct`, {
    method: "POST",
    headers: { "Content-Type": "application/xml", Authorization: `Bearer ${token}` },
    body,
  });
  const text = await res.text();
  if (/<Error/i.test(text) || /hiba/i.test(text)) {
    return { ok: false, message: "Unas setProduct hiba: " + text.slice(0, 300) };
  }
  return { ok: true, message: "SEO frissítve az Unasban." };
}

/** Nyers rendelés-XML lekérés (a mezok felderítéséhez / bevétel-statisztikához). */
export async function unasGetOrdersRaw(
  token: string,
  opts?: { limitNum?: number; dateStart?: string; dateEnd?: string }
): Promise<string> {
  const body =
    `<?xml version="1.0" encoding="UTF-8" ?>\n` +
    `<Params>` +
    `<Format>xml</Format>` +
    `<ContentType>full</ContentType>` +
    (opts?.dateStart ? `<DateStart>${opts.dateStart}</DateStart>` : "") +
    (opts?.dateEnd ? `<DateEnd>${opts.dateEnd}</DateEnd>` : "") +
    `<LimitNum>${opts?.limitNum ?? 5}</LimitNum>` +
    `</Params>`;
  const res = await fetch(`${API_BASE}/getOrder`, {
    method: "POST",
    headers: { "Content-Type": "application/xml", Authorization: `Bearer ${token}` },
    body,
  });
  return await res.text();
}

/** Nyers termék-XML lekérés (a SEO-mezok felderítéséhez / olvasáshoz). */
export async function unasGetProductsRaw(
  token: string,
  opts?: { limitNum?: number; limitStart?: number; contentType?: string }
): Promise<string> {
  const body =
    `<?xml version="1.0" encoding="UTF-8" ?>\n` +
    `<Params>` +
    `<Format>xml</Format>` +
    `<ContentType>${opts?.contentType || "full"}</ContentType>` +
    `<LimitNum>${opts?.limitNum ?? 1}</LimitNum>` +
    `<LimitStart>${opts?.limitStart ?? 0}</LimitStart>` +
    `</Params>`;
  const res = await fetch(`${API_BASE}/getProduct`, {
    method: "POST",
    headers: { "Content-Type": "application/xml", Authorization: `Bearer ${token}` },
    body,
  });
  return await res.text();
}
