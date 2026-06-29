import { NextRequest, NextResponse } from "next/server";
import { getTasks } from "@/lib/tasks";
import { buildExport, mimeFor, extFor, type ExportFormat } from "@/lib/exporters";
import { sendMail, ownerEmail } from "@/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function html(msg: string, ok: boolean): NextResponse {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;background:#0b1830;color:#fff;padding:40px;text-align:center"><h2>${ok ? "✅" : "⚠️"} ${msg}</h2><p style="color:#9cc4ff">Ezt az ablakot bezárhatod.</p></body>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

/** Egy feladat válaszának elküldése emailben a tulajdonosnak (csatolmánnyal). */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const format = (req.nextUrl.searchParams.get("format") || "pdf") as ExportFormat;
  if (!id) return html("Hiányzó feladat-azonosító.", false);
  const task = (await getTasks().catch(() => [])).find((t) => t.id === id);
  if (!task || !task.response) return html("Nincs ilyen (kész) feladat.", false);

  const title = `Vitech — ${task.who?.name || "Munkatárs"} (${task.who?.department || ""}) válasza`;
  const body = `Feladat: ${task.title}\n\n${task.response}`;
  const buf = await buildExport(format, title, body);

  const r = await sendMail({
    subject: title,
    text: `Szia!\n\nMellékelve a kért válasz (${extFor(format).toUpperCase()}).\n\nFeladat: ${task.title}\n\n${task.response}\n\n— Vitech AI csapat`,
    filename: `vitech-valasz-${id}.${extFor(format)}`,
    content: buf,
    mime: mimeFor(format),
  });
  return r.ok ? html(`Elküldve emailben (${ownerEmail()}).`, true) : html(`Email hiba: ${r.error}`, false);
}
