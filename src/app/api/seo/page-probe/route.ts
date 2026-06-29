import { NextRequest, NextResponse } from "next/server";
import { unasLogin } from "@/lib/unas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Felderíto: getPageContent nyers XML — a blog/tartalmi elemek mezoszerkezetének megismeréséhez. */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Jogosulatlan" }, { status: 401 });
  }
  try {
    const token = await unasLogin();
    const body =
      `<?xml version="1.0" encoding="UTF-8" ?>\n` +
      `<Params><Format>xml</Format><ContentType>full</ContentType><LimitNum>8</LimitNum></Params>`;
    const res = await fetch("https://api.unas.hu/shop/getPageContent", {
      method: "POST",
      headers: { "Content-Type": "application/xml", Authorization: `Bearer ${token}` },
      body,
    });
    const text = await res.text();
    // Csak a tag-szerkezet + a "blog" típusú elem(ek) kivonata (ne dumpoljuk a teljes HTML-t).
    const blocks = text.match(/<Content>[\s\S]*?<\/Content>/g) || text.match(/<Page>[\s\S]*?<\/Page>/g) || [];
    const topTags = blocks[0] ? [...new Set([...blocks[0].matchAll(/<([A-Za-z]+)>/g)].map((m) => m[1]))] : [];
    const summary = blocks.slice(0, 8).map((b) => {
      const type = (b.match(/<Type>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/Type>/) || [])[1] || "";
      const name = (b.match(/<(?:Name|Title)>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:Name|Title)>/) || [])[1] || "";
      return { type, name: (name || "").slice(0, 60), len: b.length };
    });
    return NextResponse.json({
      ok: true,
      rootSample: text.slice(0, 600),
      blockCount: blocks.length,
      topTags,
      summary,
      firstBlock: blocks[0] ? blocks[0].slice(0, 2500) : null,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
