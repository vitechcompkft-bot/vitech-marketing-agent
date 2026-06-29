import { NextRequest, NextResponse } from "next/server";
import { getTasks } from "@/lib/tasks";
import { buildExport, mimeFor, extFor, type ExportFormat } from "@/lib/exporters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Egy feladat válaszának letöltése PDF/DOCX/XLSX formátumban. (Dashboard-jelszó mögött.) */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const format = (req.nextUrl.searchParams.get("format") || "pdf") as ExportFormat;
  if (!id || !["pdf", "docx", "xlsx"].includes(format)) {
    return NextResponse.json({ error: "Hiányzó/hibás id vagy format." }, { status: 400 });
  }
  const task = (await getTasks().catch(() => [])).find((t) => t.id === id);
  if (!task || !task.response) return NextResponse.json({ error: "Nincs ilyen (kész) feladat." }, { status: 404 });

  const title = `Vitech — ${task.who?.name || "Munkatárs"} (${task.who?.department || ""}) válasza`;
  const body = `Feladat: ${task.title}\n\n${task.response}`;
  const buf = await buildExport(format, title, body);

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": mimeFor(format),
      "Content-Disposition": `attachment; filename="vitech-valasz-${id}.${extFor(format)}"`,
      "Cache-Control": "no-store",
    },
  });
}
