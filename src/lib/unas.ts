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
