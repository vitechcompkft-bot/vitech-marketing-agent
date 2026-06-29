import { NextRequest, NextResponse } from "next/server";
import { processTasks, createTask, getTasks } from "@/lib/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A függoben lévo tulajdonosi feladatok feldolgozása (fogadva → folyamatban → kész + válasz).
 * Az /api/assistant indítja közvetlenül, és a napi monitor cron is pótolja. Védelem: Bearer CRON_SECRET.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Jogosulatlan" }, { status: 401 });
  }
  try {
    // Önteszt: a PDF/DOCX/XLSX export muködik-e élesben (Vercelen).
    if (req.nextUrl.searchParams.get("test") === "export") {
      const { buildPdf, buildDocx, buildXlsx } = await import("@/lib/exporters");
      const t = "Teszt — magyar ékezetek: őű ÁÉÍÓÖŐÚÜŰ";
      const [pdf, docx, xlsx] = await Promise.all([
        buildPdf(t, "Árvíztűrő tükörfúrógép. Minőség, körültekintő működés."),
        buildDocx(t, "sor"),
        buildXlsx(t, "sor"),
      ]);
      return NextResponse.json({ ok: true, pdf: pdf.length, docx: docx.length, xlsx: xlsx.length });
    }
    if (req.nextUrl.searchParams.get("test") === "statement") {
      const { getMonthStatement } = await import("@/lib/bank");
      const { buildStatementPdf, buildStatementXlsx } = await import("@/lib/bankExport");
      const stmt = await getMonthStatement();
      if (!stmt.ok) return NextResponse.json({ ok: false, note: stmt.note });
      const [pdf, xlsx] = await Promise.all([buildStatementPdf(stmt), buildStatementXlsx(stmt)]);
      return NextResponse.json({ ok: true, txCount: stmt.transactions.length, totalIn: stmt.totalIn, totalOut: stmt.totalOut, pdf: pdf.length, xlsx: xlsx.length });
    }
    if (req.nextUrl.searchParams.get("demo") === "1") {
      await createTask(
        "mihaly",
        { name: "Mihály", role: "gazdasági vezeto (kontroller)", department: "Gazdasági", persona: "Gazdasági vezeto / pénzügyi kontroller: elemzi a költéseket és javaslatot tesz a gazdaságosabb muködésre." },
        "Nézd át a havi kiadásokat: mire megy a legtöbb pénz, és hol lehetne spórolni? Adj 2-3 konkrét javaslatot."
      );
    }
    const done = await processTasks();
    const tasks = (await getTasks().catch(() => [])).slice(0, 5);
    return NextResponse.json({ ok: true, done, tasks });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "hiba" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
