import { NextRequest, NextResponse } from "next/server";
import { getMonthStatement } from "@/lib/bank";
import { buildStatementPdf, buildStatementXlsx } from "@/lib/bankExport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Havi banki kivonat (PDF) / számlatörténet (XLSX) letöltése. Dashboard-jelszó mögött (banki adat). */
export async function GET(req: NextRequest) {
  const format = req.nextUrl.searchParams.get("format") || "pdf";
  const month = req.nextUrl.searchParams.get("month") || undefined;
  const stmt = await getMonthStatement(month);
  if (!stmt.ok) return NextResponse.json({ error: stmt.note || "A kivonat nem készült el." }, { status: 400 });

  const isXlsx = format === "xlsx";
  const buf = isXlsx ? await buildStatementXlsx(stmt) : await buildStatementPdf(stmt);
  const mime = isXlsx ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf";
  const ext = isXlsx ? "xlsx" : "pdf";
  const fname = `vitech-${isXlsx ? "szamlatortenet" : "kivonat"}-${stmt.periodFrom.slice(0, 7)}.${ext}`;
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": mime, "Content-Disposition": `attachment; filename="${fname}"`, "Cache-Control": "no-store" },
  });
}
