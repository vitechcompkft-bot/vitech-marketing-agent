import { NextRequest, NextResponse } from "next/server";
import { unasLogin, unasGetProductsRaw } from "@/lib/unas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Ismert laptop-márkák + típuscsalád-heurisztika a névbol való kitalálásra. */
const KNOWN = [
  "HP", "Lenovo", "Dell", "ASUS", "Acer", "Apple", "MSI", "Fujitsu", "Toshiba",
  "Microsoft", "Samsung", "LG", "Huawei", "Gigabyte", "Razer", "Sony", "Medion", "Packard Bell",
];
function guessBrand(name: string): string | null {
  const n = (name || "").toLowerCase();
  for (const b of KNOWN) if (n.includes(b.toLowerCase())) return b;
  if (/thinkpad|ideapad|legion|\byoga\b|thinkbook|thinkcentre/.test(n)) return "Lenovo";
  if (/elitebook|probook|pavilion|spectre|\bomen\b|zbook|prodesk|elitedesk/.test(n)) return "HP";
  if (/latitude|inspiron|precision|vostro|\bxps\b|optiplex/.test(n)) return "Dell";
  if (/zenbook|vivobook|\brog\b|tuf/.test(n)) return "ASUS";
  if (/macbook|imac|mac mini/.test(n)) return "Apple";
  if (/lifebook|celsius|esprimo/.test(n)) return "Fujitsu";
  if (/aspire|travelmate|swift|nitro|predator/.test(n)) return "Acer";
  return null;
}

function field(block: string, tag: string): string | undefined {
  const m = block.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`));
  return m ? m[1].trim() : undefined;
}

/** Márka kiolvasása: top-level Manufacturer/Brand, vagy Params közül a "márka/gyártó" nevu. */
function extractBrand(block: string): string | undefined {
  for (const t of ["Manufacturer", "Brand", "Producer"]) {
    const v = field(block, t);
    if (v && v.length) return v;
  }
  const params = (block.match(/<Params>([\s\S]*?)<\/Params>/) || [])[1] || "";
  for (const it of params.match(/<Param>[\s\S]*?<\/Param>/g) || []) {
    const nm = (field(it, "Name") || "").toLowerCase();
    if (/m[aá]rka|gy[aá]rt[oó]|brand|manufacturer/.test(nm)) {
      const val = field(it, "Value");
      if (val && val.length) return val;
    }
  }
  return undefined;
}

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Jogosulatlan" }, { status: 401 });
  }
  try {
    const token = await unasLogin();
    const start = Date.now();
    const BATCH = 100;
    let limitStart = 0;
    let scanned = 0;
    let withBrand = 0;
    const missing: { id: string; sku: string; name: string; guess: string | null }[] = [];
    let sampleTags: string[] = [];
    for (let i = 0; i < 12; i++) {
      if (Date.now() - start > 45000) break;
      const xml = await unasGetProductsRaw(token, { limitNum: BATCH, limitStart, contentType: "full" });
      const blocks = xml.match(/<Product>[\s\S]*?<\/Product>/g) || [];
      if (!blocks.length) break;
      const first = blocks[0];
      if (i === 0 && first) sampleTags = [...new Set([...first.matchAll(/<([A-Za-z]+)>/g)].map((m) => m[1]))];
      for (const b of blocks) {
        scanned++;
        const id = (b.match(/<Id>(\d+)<\/Id>/) || [])[1] || "";
        const sku = field(b, "Sku") || "";
        const name = field(b, "Name") || "";
        if (extractBrand(b)) withBrand++;
        else missing.push({ id, sku, name: name.slice(0, 90), guess: guessBrand(name) });
      }
      limitStart += BATCH;
      if (blocks.length < BATCH) break;
    }
    return NextResponse.json({
      ok: true,
      scanned,
      withBrand,
      missingCount: missing.length,
      guessableCount: missing.filter((m) => m.guess).length,
      sampleTags,
      missing,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
