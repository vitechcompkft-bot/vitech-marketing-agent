import { NextRequest, NextResponse } from "next/server";
import { unasLogin } from "@/lib/unas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * IDEIGLENES felderíto: az Unas getPage nyers XML-je, hogy lássuk a "Contents" szerkezetét
 * (a blog tartalmi elem oldalhoz kapcsolásához setPage-dzsel). Id nélkül listáz.
 * Védelem: CRON_SECRET (?key=... vagy Bearer).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}` && req.nextUrl.searchParams.get("key") !== secret) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  try {
    const token = await unasLogin();
    const id = req.nextUrl.searchParams.get("id") || "";
    const body = id
      ? `<?xml version="1.0" encoding="UTF-8" ?>\n<Params><Id>${id}</Id><ContentType>full</ContentType></Params>`
      : `<?xml version="1.0" encoding="UTF-8" ?>\n<Params><ContentType>minimal</ContentType></Params>`;
    const res = await fetch("https://api.unas.hu/shop/getPage", {
      method: "POST",
      headers: { "Content-Type": "application/xml", Authorization: `Bearer ${token}` },
      body,
    });
    const xml = await res.text();
    return new NextResponse(xml, { headers: { "content-type": "text/plain; charset=utf-8" } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}
