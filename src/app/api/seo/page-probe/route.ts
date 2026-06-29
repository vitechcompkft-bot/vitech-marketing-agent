import { NextRequest, NextResponse } from "next/server";
import { unasLogin } from "@/lib/unas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Felderíto: több tartalom-metódust/paramétert próbál, hogy lássuk a blog/oldal mezoszerkezetét. */
async function call(token: string, method: string, body: string) {
  try {
    const res = await fetch(`https://api.unas.hu/shop/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/xml", Authorization: `Bearer ${token}` },
      body: `<?xml version="1.0" encoding="UTF-8" ?>\n${body}`,
    });
    const text = await res.text();
    const elems = text.match(/<(PageContent|Page|Menu|Content)>[\s\S]*?<\/\1>/g) || [];
    const first = elems[0] || "";
    const tags = first ? [...new Set([...first.matchAll(/<([A-Za-z]+)>/g)].map((m) => m[1]))] : [];
    return { method, body, status: res.status, root: text.slice(0, 160), elemCount: elems.length, firstTags: tags, firstBlock: first.slice(0, 2200) };
  } catch (e: any) {
    return { method, body, error: e?.message };
  }
}

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Jogosulatlan" }, { status: 401 });
  }
  try {
    const token = await unasLogin();
    const attempts = [
      ["getPageContent", "<Params><Lang>hu</Lang></Params>"],
      ["getPageContent", "<Params><Lang>hu</Lang><LimitNum>50</LimitNum></Params>"],
    ] as const;
    const results = [];
    for (const [m, b] of attempts) results.push(await call(token, m, b));
    return NextResponse.json({ ok: true, results });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
