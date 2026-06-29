import { NextRequest, NextResponse } from "next/server";
import { unasLogin } from "@/lib/unas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Felderíto: getPageContent (Lang=hu) → a blog elem teljes szerkezete + van-e Pages (367234) hozzárendelés. */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Jogosulatlan" }, { status: 401 });
  }
  try {
    const token = await unasLogin();
    const res = await fetch("https://api.unas.hu/shop/getPageContent", {
      method: "POST",
      headers: { "Content-Type": "application/xml", Authorization: `Bearer ${token}` },
      body: `<?xml version="1.0" encoding="UTF-8" ?>\n<Params><Lang>hu</Lang></Params>`,
    });
    const text = await res.text();
    const block = (text.match(/<PageContent>[\s\S]*?<\/PageContent>/) || [])[0] || "";
    const pagesBlock = (block.match(/<Pages>[\s\S]*?<\/Pages>/) || [])[0] || "(nincs Pages mezo)";
    return NextResponse.json({
      ok: true,
      includes367234: text.includes("367234"),
      blockLen: block.length,
      pagesBlock,
      blockHead: block.slice(0, 700),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
