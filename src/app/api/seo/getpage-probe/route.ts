import { NextRequest, NextResponse } from "next/server";
import { unasLogin } from "@/lib/unas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UNAS = "https://api.unas.hu/shop";

/**
 * IDEIGLENES Unas-felderíto (a blog oldalhoz kapcsolásához, setPage szerkezet megtalálása).
 * mode=pagelist  → getPage lista
 * mode=page&id=X → getPage teljes
 * mode=contents  → getPageContent lista (blog tartalmi elemek + Id-k)
 * mode=setpage&id=PAGE&link=CONTENTID&fmt=1|2|3 → setPage próba (nyers válasz)
 * Védelem: CRON_SECRET (?key=...).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.nextUrl.searchParams.get("key") !== secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  try {
    const token = await unasLogin();
    const sp = req.nextUrl.searchParams;
    const mode = sp.get("mode") || "pagelist";
    const auth = { "Content-Type": "application/xml", Authorization: `Bearer ${token}` };

    let ep = "getPage";
    let body = `<?xml version="1.0" encoding="UTF-8" ?>\n<Params><ContentType>minimal</ContentType></Params>`;

    if (mode === "page") {
      body = `<?xml version="1.0" encoding="UTF-8" ?>\n<Params><Id>${sp.get("id")}</Id><ContentType>full</ContentType></Params>`;
    } else if (mode === "contents") {
      ep = "getPageContent";
      body = `<?xml version="1.0" encoding="UTF-8" ?>\n<Params><ContentType>minimal</ContentType></Params>`;
    } else if (mode === "setpage") {
      ep = "setPage";
      const page = sp.get("id") || "";
      const link = sp.get("link") || "";
      const fmt = sp.get("fmt") || "1";
      const type = sp.get("type") || "normal";
      const content =
        fmt === "2"
          ? `<Content>${link}</Content>`
          : fmt === "3"
          ? `<PageContent><Id>${link}</Id></PageContent>`
          : fmt === "4"
          ? `<Content><Id>${link}</Id><Order>1</Order></Content>`
          : `<Content><Id>${link}</Id></Content>`;
      const ident = `<Lang>hu</Lang><Name><![CDATA[Blog]]></Name><Type>${type}</Type>`;
      body = `<?xml version="1.0" encoding="UTF-8" ?>\n<Pages><Page><Action>modify</Action><Id>${page}</Id>${ident}<Contents>${content}</Contents></Page></Pages>`;
    }

    const res = await fetch(`${UNAS}/${ep}`, { method: "POST", headers: auth, body });
    const xml = await res.text();
    return new NextResponse(`REQ ${ep}:\n${body}\n\nRESP:\n${xml}`, { headers: { "content-type": "text/plain; charset=utf-8" } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}
