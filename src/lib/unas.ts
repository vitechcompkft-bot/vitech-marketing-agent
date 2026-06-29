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

export interface BlogPostInput {
  title: string;
  sefUrl: string;
  lead: string; // bevezető (a blog-listán látszik)
  bodyHtml: string; // teljes tartalom (HTML)
  metaTitle: string;
  metaDescription: string;
  metaKeywords?: string;
  authorName?: string;
  pageId?: string; // melyik oldalon (menüpont) jelenjen meg — a Blog oldal Id-ja
}

/** Meglévő tartalmi elem (blog) hozzárendelése egy oldalhoz (menüponthoz) — setPageContent modify. */
export async function unasSetBlogPostPage(token: string, id: string, pageId: string): Promise<{ ok: boolean; message: string }> {
  const body =
    `<?xml version="1.0" encoding="UTF-8" ?>\n` +
    `<PageContents><PageContent><Action>modify</Action><Id>${id}</Id>` +
    `<Pages><Page><Id>${pageId}</Id></Page></Pages>` +
    `</PageContent></PageContents>`;
  const res = await fetch(`${API_BASE}/setPageContent`, {
    method: "POST",
    headers: { "Content-Type": "application/xml", Authorization: `Bearer ${token}` },
    body,
  });
  const text = await res.text();
  const status = (text.match(/<Status>([\s\S]*?)<\/Status>/) || [])[1];
  if (status && /ok/i.test(status)) return { ok: true, message: "Hozzárendelve a Blog oldalhoz." };
  return { ok: false, message: "Unas modify hiba: " + text.slice(0, 300) };
}

/** Blog bejegyzés létrehozása az Unas setPageContent (Type=blog) végponton — ÉLESBEN (Published=yes). */
export async function unasCreateBlogPost(
  token: string,
  p: BlogPostInput
): Promise<{ ok: boolean; id?: string; message: string }> {
  const body =
    `<?xml version="1.0" encoding="UTF-8" ?>\n` +
    `<PageContents><PageContent>` +
    `<Action>add</Action>` +
    `<Title>${cdata(p.title)}</Title>` +
    `<Type>blog</Type>` +
    (p.authorName ? `<Author><Name>${cdata(p.authorName)}</Name></Author>` : "") +
    `<BlogContent>` +
    `<Lead>${cdata(p.lead)}</Lead><LeadIsHTML>no</LeadIsHTML>` +
    `<Text>${cdata(p.bodyHtml)}</Text><ContentIsHTML>yes</ContentIsHTML>` +
    `</BlogContent>` +
    `<Published>yes</Published>` +
    `<Explicit>no</Explicit>` +
    `<CommentAllowed>no</CommentAllowed>` +
    `<SefUrl>${cdata(p.sefUrl)}</SefUrl>` +
    `<Meta>` +
    `<Title>${cdata(p.metaTitle)}</Title>` +
    `<Description>${cdata(p.metaDescription)}</Description>` +
    `<Keywords>${cdata(p.metaKeywords ?? "")}</Keywords>` +
    `</Meta>` +
    (p.pageId ? `<Pages><Page><Id>${p.pageId}</Id></Page></Pages>` : "") +
    `</PageContent></PageContents>`;
  const res = await fetch(`${API_BASE}/setPageContent`, {
    method: "POST",
    headers: { "Content-Type": "application/xml", Authorization: `Bearer ${token}` },
    body,
  });
  const text = await res.text();
  const id = (text.match(/<Id>(\d+)<\/Id>/) || [])[1];
  const status = (text.match(/<Status>([\s\S]*?)<\/Status>/) || [])[1];
  if (id && status && /ok/i.test(status)) return { ok: true, id, message: "Blog közzétéve." };
  return { ok: false, message: "Unas setPageContent hiba: " + text.slice(0, 300) };
}

export interface UnasOrder {
  key: string;
  date: string; // "2026.06.04 18:07:59"
  status: string;
  statusType: string;
  sumGross: number;
}

/** Rendelések értelmezett formában (minden státusz, a lezártakat is). */
export async function unasGetOrders(token: string, opts?: { limitNum?: number }): Promise<UnasOrder[]> {
  const xml = await unasGetOrdersRaw(token, { limitNum: opts?.limitNum ?? 1000 });
  const blocks = xml.match(/<Order>[\s\S]*?<\/Order>/g) || [];
  return blocks
    .map((b): UnasOrder => ({
      key: field(b, "Key") || "",
      date: field(b, "Date") || "",
      status: field(b, "Status") || "",
      statusType: field(b, "StatusType") || "",
      sumGross: Number(field(b, "SumPriceGross") || 0),
    }))
    .filter((o) => o.key);
}

/** Nyers rendelés-XML lekérés (a mezok felderítéséhez / bevétel-statisztikához / számlázáshoz). */
export async function unasGetOrdersRaw(
  token: string,
  opts?: { limitNum?: number; dateStart?: string; dateEnd?: string; key?: string }
): Promise<string> {
  const body =
    `<?xml version="1.0" encoding="UTF-8" ?>\n` +
    `<Params>` +
    `<Format>xml</Format>` +
    `<ContentType>full</ContentType>` +
    (opts?.key ? `<Key>${opts.key}</Key>` : "") +
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

export interface OrderItem {
  name: string;
  sku?: string;
  quantity: number;
  unitNet: number; // nettó EGYSÉGár
  unitGross: number; // bruttó EGYSÉGár
  vat: string; // pl. "27%"
}

export interface OrderDetail {
  key: string;
  date: string;
  status: string;
  email?: string;
  customerName?: string;
  phone?: string;
  invoice: { name?: string; zip?: string; city?: string; street?: string; country?: string; countryCode?: string; taxNumber?: string };
  payment: { name?: string; type?: string };
  items: OrderItem[];
  sumGross: number;
}

/** Egy rendelés TELJES adatai (vevo + tételek) számlázáshoz, Key alapján. */
export async function unasGetOrderByKey(token: string, key: string): Promise<OrderDetail | null> {
  const xml = await unasGetOrdersRaw(token, { limitNum: 1, key });
  const block = (xml.match(/<Order>[\s\S]*?<\/Order>/) || [])[0];
  if (!block) return null;

  const customer = (block.match(/<Customer>([\s\S]*?)<\/Customer>/) || [])[1] || "";
  const contact = (customer.match(/<Contact>([\s\S]*?)<\/Contact>/) || [])[1] || "";
  const addresses = (customer.match(/<Addresses>([\s\S]*?)<\/Addresses>/) || [])[1] || "";
  const inv = (addresses.match(/<Invoice>([\s\S]*?)<\/Invoice>/) || [])[1] || "";
  const payment = (block.match(/<Payment>([\s\S]*?)<\/Payment>/) || [])[1] || "";
  const itemsBlock = (block.match(/<Items>([\s\S]*?)<\/Items>/) || [])[1] || "";

  const items: OrderItem[] = (itemsBlock.match(/<Item>[\s\S]*?<\/Item>/g) || []).map((it) => ({
    name: field(it, "Name") || "",
    sku: field(it, "Sku"),
    quantity: Number(field(it, "Quantity") || 1),
    unitNet: Number(field(it, "PriceNet") || 0),
    unitGross: Number(field(it, "PriceGross") || 0),
    vat: field(it, "Vat") || "27%",
  }));

  return {
    key: field(block, "Key") || key,
    date: field(block, "Date") || "",
    status: field(block, "Status") || "",
    email: field(customer, "Email"),
    customerName: field(contact, "Name"),
    phone: field(contact, "Phone"),
    invoice: {
      name: field(inv, "Name"),
      zip: field(inv, "ZIP"),
      city: field(inv, "City"),
      street: field(inv, "Street"),
      country: field(inv, "Country"),
      countryCode: field(inv, "CountryCode"),
      taxNumber: field(inv, "TaxNumber"),
    },
    payment: { name: field(payment, "Name"), type: field(payment, "Type") },
    items,
    sumGross: Number(field(block, "SumPriceGross") || 0),
  };
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
