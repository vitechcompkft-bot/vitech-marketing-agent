import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import ExcelJS from "exceljs";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { ROBOTO_B64 } from "./font-data";

export type ExportFormat = "pdf" | "docx" | "xlsx";

export function mimeFor(f: ExportFormat): string {
  return f === "pdf"
    ? "application/pdf"
    : f === "docx"
    ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}
export function extFor(f: ExportFormat): string {
  return f === "docx" ? "docx" : f === "xlsx" ? "xlsx" : "pdf";
}

/** WORD (.docx) — sima címsor + bekezdések. */
export async function buildDocx(title: string, body: string): Promise<Buffer> {
  const paras = body.split(/\n/).map((line) => new Paragraph({ children: [new TextRun(line || " ")] }));
  const doc = new Document({
    sections: [{ children: [new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }), ...paras] }],
  });
  return Packer.toBuffer(doc);
}

/** EXCEL (.xlsx) — cím + soronként a szöveg, tördelve. */
export async function buildXlsx(title: string, body: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Válasz");
  ws.getColumn(1).width = 110;
  const tr = ws.addRow([title]);
  tr.font = { bold: true, size: 14 };
  ws.addRow([]);
  for (const line of body.split(/\n/)) {
    const r = ws.addRow([line || ""]);
    r.alignment = { wrapText: true, vertical: "top" };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** PDF — pdf-lib + beágyazott Roboto (magyar ékezetek!), saját sortörés + lapozás. */
export async function buildPdf(title: string, body: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(Buffer.from(ROBOTO_B64, "base64"), { subset: true });
  const margin = 50,
    size = 11,
    titleSize = 17,
    lh = 16;
  let page = pdf.addPage();
  let { width, height } = page.getSize();
  let y = height - margin;
  const maxW = width - margin * 2;
  const san = (t: string) => (t || "").replace(/[^\x09\x0A\x0D\x20-\x7E -ɏ‐-‧€]/g, "");
  const drawLine = (text: string, fs: number) => {
    if (y < margin + lh) {
      page = pdf.addPage();
      const s = page.getSize();
      width = s.width;
      height = s.height;
      y = height - margin;
    }
    page.drawText(text, { x: margin, y, size: fs, font, color: rgb(0.1, 0.12, 0.18) });
    y -= fs >= titleSize ? titleSize + 8 : lh;
  };
  const wrap = (text: string, fs: number) => {
    const t = san(text);
    if (!t) {
      y -= lh * 0.5;
      return;
    }
    const words = t.split(/\s+/);
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (font.widthOfTextAtSize(test, fs) > maxW && line) {
        drawLine(line, fs);
        line = w;
      } else line = test;
    }
    if (line) drawLine(line, fs);
  };
  wrap(title, titleSize);
  y -= 6;
  for (const para of body.split(/\n/)) wrap(para.replace(/\*\*/g, ""), size);
  return Buffer.from(await pdf.save());
}

export async function buildExport(format: ExportFormat, title: string, body: string): Promise<Buffer> {
  if (format === "docx") return buildDocx(title, body);
  if (format === "xlsx") return buildXlsx(title, body);
  return buildPdf(title, body);
}
