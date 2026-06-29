import ExcelJS from "exceljs";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { ROBOTO_B64 } from "./font-data";
import type { MonthStatement } from "./bank";

const huf = (n: number) => new Intl.NumberFormat("hu-HU").format(Math.round(n || 0)) + " Ft";

/** Havi SZÁMLATÖRTÉNET Excelben (tételes táblázat + összesítés). */
export async function buildStatementXlsx(stmt: MonthStatement): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Számlatörténet");
  ws.columns = [{ width: 13 }, { width: 34 }, { width: 46 }, { width: 16 }, { width: 16 }];
  const titleRow = ws.addRow([`Vitech Comp Kft. — Számlatörténet (${stmt.periodFrom} – ${stmt.periodTo})`]);
  titleRow.font = { bold: true, size: 13 };
  ws.addRow([]);
  const head = ws.addRow(["Dátum", "Partner", "Közlemény", "Bevétel", "Kiadás"]);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A3A6B" } };
  });
  for (const t of stmt.transactions) {
    const r = ws.addRow([t.date, t.party, t.info, t.dir === "in" ? t.amount : null, t.dir === "out" ? t.amount : null]);
    r.alignment = { vertical: "top", wrapText: true };
  }
  ws.addRow([]);
  const sum = ws.addRow(["", "", "Összesen", stmt.totalIn, stmt.totalOut]);
  sum.font = { bold: true };
  ws.getColumn(4).numFmt = '# ##0 "Ft"';
  ws.getColumn(5).numFmt = '# ##0 "Ft"';
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Havi KIVONAT PDF-ben (fejléc + tételes táblázat + összesítés, magyar ékezetekkel). */
export async function buildStatementPdf(stmt: MonthStatement): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(Buffer.from(ROBOTO_B64, "base64"), { subset: true });
  const margin = 38,
    fs = 9,
    lh = 13.5;
  let page = pdf.addPage();
  const { width, height } = page.getSize();
  let y = height - margin;
  const san = (t: string) => (t || "").replace(/[^\x09\x0A\x0D\x20-\x7E -ɏ‐-‧€]/g, "");
  const cols = [
    { x: margin, w: 58 },
    { x: margin + 62, w: 232 },
    { x: margin + 300, w: 96 },
    { x: margin + 400, w: 96 },
  ];
  const fit = (s: string, w: number, fsize: number) => {
    let t = san(s);
    while (t && font.widthOfTextAtSize(t, fsize) > w) t = t.slice(0, -1);
    return t;
  };
  const newPageIfNeeded = () => {
    if (y < margin + lh) {
      page = pdf.addPage();
      y = height - margin;
    }
  };
  const row = (cells: (string | number)[], fsize = fs, color = rgb(0.12, 0.14, 0.2)) => {
    newPageIfNeeded();
    cells.forEach((c, i) => {
      const col = cols[i];
      page.drawText(fit(String(c ?? ""), col.w, fsize), { x: col.x, y, size: fsize, font, color });
    });
    y -= lh;
  };

  page.drawText(san(`Vitech Comp Kft. — Számlakivonat`), { x: margin, y, size: 15, font, color: rgb(0.06, 0.16, 0.4) });
  y -= 18;
  page.drawText(san(`Időszak: ${stmt.periodFrom} – ${stmt.periodTo}`), { x: margin, y, size: 10, font, color: rgb(0.35, 0.4, 0.5) });
  y -= 22;
  row(["Dátum", "Partner / közlemény", "Bevétel", "Kiadás"], 10, rgb(0.06, 0.16, 0.4));
  y -= 2;
  for (const t of stmt.transactions) {
    const label = t.party + (t.info ? ` · ${t.info}` : "");
    row([t.date, label, t.dir === "in" ? huf(t.amount) : "", t.dir === "out" ? huf(t.amount) : ""]);
  }
  y -= 8;
  row(["", "Összesen", huf(stmt.totalIn), huf(stmt.totalOut)], 10, rgb(0.06, 0.16, 0.4));
  if (!stmt.transactions.length) {
    y -= 6;
    row(["", "(nincs tétel ebben az időszakban)"], fs, rgb(0.5, 0.5, 0.55));
  }
  return Buffer.from(await pdf.save());
}
