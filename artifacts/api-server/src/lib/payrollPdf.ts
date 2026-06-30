import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const A4 = { w: 595.28, h: 841.89 };
const A4_LANDSCAPE = { w: 841.89, h: 595.28 };
const MARGIN = 36;
const BLACK = rgb(0, 0, 0);
const GREY = rgb(0.4, 0.4, 0.4);
const LIGHT = rgb(0.93, 0.93, 0.93);

export type ColumnDef = {
  header: string;
  key: string;
  width: number;
  align?: "left" | "right" | "center";
};

type PageCtx = {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  size: { w: number; h: number };
  y: number;
  pageNo: number;
  title: string;
  subtitle: string;
  drawHeader: (ctx: PageCtx) => void;
};

function newPage(ctx: PageCtx) {
  ctx.page = ctx.doc.addPage([ctx.size.w, ctx.size.h]);
  ctx.pageNo += 1;
  ctx.y = ctx.size.h - MARGIN;
  ctx.drawHeader(ctx);
}

function drawText(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size = 9, color = BLACK) {
  page.drawText(text, { x, y, size, font, color });
}

function truncate(font: PDFFont, text: string, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (font.widthOfTextAtSize(text.slice(0, mid) + "…", size) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + "…";
}

function alignedX(font: PDFFont, text: string, size: number, x: number, width: number, align: "left" | "right" | "center" = "left"): number {
  const w = font.widthOfTextAtSize(text, size);
  if (align === "right") return x + width - w - 4;
  if (align === "center") return x + (width - w) / 2;
  return x + 4;
}

function drawTableHeader(ctx: PageCtx, cols: ColumnDef[]) {
  let x = MARGIN;
  ctx.page.drawRectangle({ x, y: ctx.y - 14, width: cols.reduce((s, c) => s + c.width, 0), height: 16, color: LIGHT });
  for (const c of cols) {
    const t = truncate(ctx.bold, c.header, 8, c.width - 6);
    drawText(ctx.page, t, alignedX(ctx.bold, t, 8, x, c.width, c.align ?? "left"), ctx.y - 10, ctx.bold, 8);
    x += c.width;
  }
  ctx.y -= 18;
}

function drawTableRow(ctx: PageCtx, cols: ColumnDef[], row: Record<string, any>, bold = false) {
  const font = bold ? ctx.bold : ctx.font;
  let x = MARGIN;
  for (const c of cols) {
    const raw = row[c.key] == null ? "" : String(row[c.key]);
    const t = truncate(font, raw, 8, c.width - 6);
    drawText(ctx.page, t, alignedX(font, t, 8, x, c.width, c.align ?? "left"), ctx.y - 8, font, 8);
    x += c.width;
  }
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y - 12 },
    end: { x: MARGIN + cols.reduce((s, c) => s + c.width, 0), y: ctx.y - 12 },
    thickness: 0.3, color: GREY,
  });
  ctx.y -= 14;
}

export type TablePdfOpts = {
  title: string;
  subtitle: string;
  columns: ColumnDef[];
  rows: Record<string, any>[];
  totalsRow?: Record<string, any>;
  landscape?: boolean;
  footer?: string;
};

export async function buildTablePdf(opts: TablePdfOpts): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const size = opts.landscape ? A4_LANDSCAPE : A4;

  // Auto-scale columns to fit page width so no column is clipped.
  const usable = size.w - 2 * MARGIN;
  const totalW = opts.columns.reduce((s, c) => s + c.width, 0);
  if (totalW > usable) {
    const scale = usable / totalW;
    opts.columns = opts.columns.map(c => ({ ...c, width: c.width * scale }));
  }

  const drawHeader = (ctx: PageCtx) => {
    drawText(ctx.page, ctx.title, MARGIN, ctx.y - 12, ctx.bold, 14);
    drawText(ctx.page, ctx.subtitle, MARGIN, ctx.y - 28, ctx.font, 9, GREY);
    drawText(ctx.page, `Page ${ctx.pageNo}`, size.w - MARGIN - 40, ctx.y - 12, ctx.font, 9, GREY);
    ctx.y -= 40;
    drawTableHeader(ctx, opts.columns);
  };

  const ctx: PageCtx = {
    doc, page: doc.addPage([size.w, size.h]),
    font, bold, size, y: size.h - MARGIN, pageNo: 1,
    title: opts.title, subtitle: opts.subtitle, drawHeader,
  };
  drawHeader(ctx);

  for (const row of opts.rows) {
    if (ctx.y < MARGIN + 30) {
      newPage(ctx);
    }
    drawTableRow(ctx, opts.columns, row);
  }
  if (opts.totalsRow) {
    if (ctx.y < MARGIN + 30) newPage(ctx);
    ctx.page.drawRectangle({
      x: MARGIN, y: ctx.y - 14,
      width: opts.columns.reduce((s, c) => s + c.width, 0), height: 16, color: LIGHT,
    });
    drawTableRow(ctx, opts.columns, opts.totalsRow, true);
  }
  if (opts.footer) {
    drawText(ctx.page, opts.footer, MARGIN, MARGIN - 10, font, 7, GREY);
  }
  return await doc.save();
}

export type WageSlipData = {
  organisationName: string;
  projectName: string;
  periodName: string;
  fromDate: string;
  toDate: string;
  slipNumber: string;
  issuedAt: string;
  worker: {
    workerCode: string;
    name: string;
    trade: string;
    skillLevel: string;
    aadhaar: string;
    pfNumber: string;
    esiNumber: string;
    uan: string;
    bankName: string;
    accountNumber: string;
    ifscCode: string;
    dailyRate: number;
  };
  earnings: { presentDays: number; otHours: number; basicWages: number; otAmount: number; grossWages: number };
  deductions: { epfEmployee: number; esiEmployee: number; pt: number; lwf: number; tds: number; advance: number; total: number };
  netPayable: number;
};

const inr = (v: number) => `INR ${v.toFixed(2)}`;

export async function buildWageSlipPdf(slip: WageSlipData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([A4.w, A4.h]);
  let y = A4.h - MARGIN;
  const w = A4.w - 2 * MARGIN;

  page.drawText(slip.organisationName, { x: MARGIN, y: y - 14, size: 14, font: bold });
  y -= 18;
  page.drawText(`Project: ${slip.projectName}`, { x: MARGIN, y: y - 10, size: 9, font, color: GREY });
  y -= 14;
  page.drawRectangle({ x: MARGIN, y: y - 22, width: w, height: 22, color: LIGHT });
  page.drawText("WAGE SLIP / PAY SLIP", { x: MARGIN + 8, y: y - 16, size: 12, font: bold });
  page.drawText(`Slip No: ${slip.slipNumber}`, { x: MARGIN + w - 180, y: y - 16, size: 9, font });
  y -= 30;

  const drawKV = (x: number, label: string, value: string) => {
    page.drawText(label, { x, y: y - 8, size: 8, font, color: GREY });
    page.drawText(value || "—", { x, y: y - 20, size: 9, font: bold });
  };

  drawKV(MARGIN, "Worker Name", slip.worker.name);
  drawKV(MARGIN + 200, "Worker Code", slip.worker.workerCode);
  drawKV(MARGIN + 360, "Period", `${slip.fromDate} → ${slip.toDate}`);
  y -= 30;
  drawKV(MARGIN, "Trade / Skill", `${slip.worker.trade} / ${slip.worker.skillLevel}`);
  drawKV(MARGIN + 200, "Daily Rate", inr(slip.worker.dailyRate));
  drawKV(MARGIN + 360, "Issued", slip.issuedAt);
  y -= 30;
  drawKV(MARGIN, "Aadhaar", slip.worker.aadhaar);
  drawKV(MARGIN + 200, "PF / UAN", `${slip.worker.pfNumber}${slip.worker.uan ? " / " + slip.worker.uan : ""}`);
  drawKV(MARGIN + 360, "ESI No.", slip.worker.esiNumber);
  y -= 30;
  drawKV(MARGIN, "Bank", slip.worker.bankName);
  drawKV(MARGIN + 200, "A/c No.", slip.worker.accountNumber);
  drawKV(MARGIN + 360, "IFSC", slip.worker.ifscCode);
  y -= 36;

  const colW = w / 2 - 6;
  const blockTop = y;
  // Earnings
  page.drawRectangle({ x: MARGIN, y: y - 18, width: colW, height: 18, color: LIGHT });
  page.drawText("EARNINGS", { x: MARGIN + 8, y: y - 12, size: 10, font: bold });
  page.drawText("Amount", { x: MARGIN + colW - 60, y: y - 12, size: 10, font: bold });
  let ye = y - 30;
  const earnings: [string, string][] = [
    ["Present Days", slip.earnings.presentDays.toString()],
    ["OT Hours", slip.earnings.otHours.toString()],
    ["Basic Wages", inr(slip.earnings.basicWages)],
    ["OT Amount", inr(slip.earnings.otAmount)],
  ];
  for (const [k, v] of earnings) {
    page.drawText(k, { x: MARGIN + 8, y: ye, size: 9, font });
    const vw = font.widthOfTextAtSize(v, 9);
    page.drawText(v, { x: MARGIN + colW - vw - 8, y: ye, size: 9, font });
    ye -= 14;
  }
  page.drawLine({ start: { x: MARGIN, y: ye - 2 }, end: { x: MARGIN + colW, y: ye - 2 }, thickness: 0.5 });
  ye -= 14;
  page.drawText("Gross Wages", { x: MARGIN + 8, y: ye, size: 10, font: bold });
  const gw = inr(slip.earnings.grossWages);
  page.drawText(gw, { x: MARGIN + colW - bold.widthOfTextAtSize(gw, 10) - 8, y: ye, size: 10, font: bold });

  // Deductions
  const dx = MARGIN + colW + 12;
  page.drawRectangle({ x: dx, y: blockTop - 18, width: colW, height: 18, color: LIGHT });
  page.drawText("DEDUCTIONS", { x: dx + 8, y: blockTop - 12, size: 10, font: bold });
  page.drawText("Amount", { x: dx + colW - 60, y: blockTop - 12, size: 10, font: bold });
  let yd = blockTop - 30;
  const deds: [string, string][] = [
    ["EPF Employee (12%)", inr(slip.deductions.epfEmployee)],
    ["ESI Employee (0.75%)", inr(slip.deductions.esiEmployee)],
    ["Professional Tax", inr(slip.deductions.pt)],
    ["Labour Welfare Fund", inr(slip.deductions.lwf)],
    ["TDS on Wages", inr(slip.deductions.tds)],
    ["Advance Recovery", inr(slip.deductions.advance)],
  ];
  for (const [k, v] of deds) {
    page.drawText(k, { x: dx + 8, y: yd, size: 9, font });
    const vw = font.widthOfTextAtSize(v, 9);
    page.drawText(v, { x: dx + colW - vw - 8, y: yd, size: 9, font });
    yd -= 14;
  }
  page.drawLine({ start: { x: dx, y: yd - 2 }, end: { x: dx + colW, y: yd - 2 }, thickness: 0.5 });
  yd -= 14;
  page.drawText("Total Deductions", { x: dx + 8, y: yd, size: 10, font: bold });
  const td = inr(slip.deductions.total);
  page.drawText(td, { x: dx + colW - bold.widthOfTextAtSize(td, 10) - 8, y: yd, size: 10, font: bold });

  y = Math.min(ye, yd) - 30;
  page.drawRectangle({ x: MARGIN, y: y - 26, width: w, height: 28, color: rgb(0.13, 0.45, 0.27) });
  page.drawText("NET PAYABLE", { x: MARGIN + 12, y: y - 18, size: 12, font: bold, color: rgb(1, 1, 1) });
  const np = inr(slip.netPayable);
  page.drawText(np, { x: MARGIN + w - bold.widthOfTextAtSize(np, 14) - 12, y: y - 19, size: 14, font: bold, color: rgb(1, 1, 1) });
  y -= 50;
  page.drawText("Computer-generated wage slip. Compliant with Form XIX, Payment of Wages Act, 1936.", {
    x: MARGIN, y: MARGIN + 8, size: 7, font, color: GREY,
  });
  page.drawText(`Employee signature: ____________________     Employer signature: ____________________`, {
    x: MARGIN, y: MARGIN + 24, size: 8, font,
  });
  return await doc.save();
}

export async function buildMultiWageSlipPdf(slips: WageSlipData[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  for (const s of slips) {
    const bytes = await buildWageSlipPdf(s);
    const src = await PDFDocument.load(bytes);
    const copied = await merged.copyPages(src, src.getPageIndices());
    for (const p of copied) merged.addPage(p);
  }
  return await merged.save();
}
