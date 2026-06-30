// ─────────────────────────────────────────────────────────────────────────────
// Report export utilities — operate on the canonical ReportData shape returned
// by /api/reports/*. One file = three exporters (CSV, XLSX, Print/PDF) so the
// /reports page can wire all formats to the same source-of-truth payload.
// ─────────────────────────────────────────────────────────────────────────────
import * as XLSX from "xlsx";

export type ReportColumn = {
  key: string;
  label: string;
  format?: "currency" | "number" | "percent" | "date" | "datetime" | "text";
  align?: "left" | "right" | "center";
  total?: boolean;
};
export type ReportStat = {
  label: string;
  value: string | number;
  tone?: "positive" | "warning" | "danger" | "info";
};
export type ReportSection = {
  heading: string;
  description?: string;
  columns: ReportColumn[];
  rows: Array<Record<string, unknown>>;
  stats?: ReportStat[];
};
export type ReportData = {
  title: string;
  subtitle?: string;
  generatedAt: string;
  organisationName?: string;
  meta: Array<{ label: string; value: string }>;
  sections: ReportSection[];
};

// ── Cell formatting (single source of truth for all exporters + the preview) ─
export function formatCell(value: unknown, format?: ReportColumn["format"]): string {
  if (value === null || value === undefined || value === "") return "—";
  switch (format) {
    case "currency": {
      const num = Number(value);
      if (!Number.isFinite(num)) return String(value);
      return inr(num);
    }
    case "percent": {
      const num = Number(value);
      if (!Number.isFinite(num)) return String(value);
      return `${num.toFixed(1)}%`;
    }
    case "number": {
      const num = Number(value);
      if (!Number.isFinite(num)) return String(value);
      return Number.isInteger(num) ? num.toLocaleString("en-IN") : num.toLocaleString("en-IN", { maximumFractionDigits: 2 });
    }
    case "date": {
      const d = new Date(String(value));
      if (Number.isNaN(d.getTime())) return String(value);
      return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    }
    case "datetime": {
      const d = new Date(String(value));
      if (Number.isNaN(d.getTime())) return String(value);
      return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    }
    default:
      return String(value);
  }
}

function inr(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(2)} L`;
  if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1)} K`;
  return `${sign}₹${abs.toFixed(0)}`;
}

export function safeFileName(name: string): string {
  return name.replace(/[^a-z0-9_-]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "report";
}

// ── CSV ─────────────────────────────────────────────────────────────────────
// One CSV file per report. Sections are stacked with their heading rows so a
// multi-section report stays self-describing when opened in Excel.
export function downloadCsv(report: ReportData): void {
  const lines: string[] = [];
  lines.push(csvRow([report.title]));
  if (report.subtitle) lines.push(csvRow([report.subtitle]));
  lines.push(csvRow([`Generated: ${new Date(report.generatedAt).toLocaleString("en-IN")}`]));
  for (const m of report.meta) lines.push(csvRow([m.label, m.value]));
  lines.push("");

  for (const section of report.sections) {
    lines.push(csvRow([section.heading]));
    if (section.columns.length === 0) {
      lines.push("");
      continue;
    }
    lines.push(csvRow(section.columns.map((c) => c.label)));
    for (const row of section.rows) {
      lines.push(csvRow(section.columns.map((c) => formatCell(row[c.key], c.format))));
    }
    // Totals row
    const totalCols = section.columns.filter((c) => c.total);
    if (totalCols.length > 0) {
      const totals: string[] = section.columns.map((c) => {
        if (!c.total) return "";
        const sum = section.rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
        return formatCell(sum, c.format);
      });
      totals[0] = "TOTAL";
      lines.push(csvRow(totals));
    }
    lines.push("");
  }

  triggerDownload(
    new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" }),
    `${safeFileName(report.title)}.csv`,
  );
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

function csvRow(cells: Array<string | number>): string {
  return cells.map((c) => {
    let s = String(c ?? "");
    // CSV / formula injection guard. Excel, Google Sheets and Numbers all
    // evaluate cells that start with =, +, -, @, TAB or CR as formulas, so a
    // hostile vendor name like `=cmd|'/c calc'!A1` would execute. Prefix any
    // such cell with a single-quote so the spreadsheet treats it as text.
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",");
}

function neutralizeFormula(v: unknown): unknown {
  if (typeof v !== "string") return v;
  return /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
}

// ── XLSX (SheetJS) ──────────────────────────────────────────────────────────
// One workbook per report, one worksheet per section. Sheet names are capped
// at 31 chars per Excel's hard limit.
export function downloadXlsx(report: ReportData): void {
  const wb = XLSX.utils.book_new();
  const allocSheetName = makeSheetNameAllocator();

  // Cover sheet
  const cover: any[][] = [
    [report.title],
    report.subtitle ? [report.subtitle] : [],
    [`Generated: ${new Date(report.generatedAt).toLocaleString("en-IN")}`],
    [],
    ...report.meta.map((m) => [m.label, m.value]),
  ].filter((r) => r.length > 0);
  const coverWs = XLSX.utils.aoa_to_sheet(cover);
  coverWs["!cols"] = [{ wch: 24 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, coverWs, "Summary");

  for (const section of report.sections) {
    if (section.columns.length === 0) continue;
    const header = section.columns.map((c) => c.label);
    const body = section.rows.map((row) =>
      section.columns.map((c) => {
        const v = row[c.key];
        // Keep numbers numeric so Excel can sum/sort; strings stay strings.
        if (c.format === "currency" || c.format === "number" || c.format === "percent") {
          const num = Number(v);
          return Number.isFinite(num) ? num : v ?? "";
        }
        if (c.format === "date" || c.format === "datetime") {
          if (!v) return "";
          const d = new Date(String(v));
          return Number.isNaN(d.getTime()) ? String(v) : d;
        }
        return neutralizeFormula(v ?? "");
      }),
    );
    const aoa: any[][] = [header, ...body];
    // Totals row at the bottom
    if (section.columns.some((c) => c.total)) {
      const totalsRow: Array<number | string> = section.columns.map((c) =>
        c.total ? section.rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0) : "",
      );
      totalsRow[0] = "TOTAL";
      aoa.push(totalsRow);
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // Column widths sized to header length
    ws["!cols"] = section.columns.map((c) => ({ wch: Math.min(40, Math.max(12, c.label.length + 4)) }));
    XLSX.utils.book_append_sheet(wb, ws, allocSheetName(section.heading));
  }

  XLSX.writeFile(wb, `${safeFileName(report.title)}.xlsx`);
}

// Excel sheet names are capped at 31 chars and must be unique within a
// workbook. Two sections that share a 31-char prefix would otherwise crash
// `book_append_sheet`. Allocate suffix `(2)`, `(3)`, ... within the budget.
function makeSheetNameAllocator(): (s: string) => string {
  const seen = new Set<string>();
  return (raw: string) => {
    const cleaned = raw.replace(/[\\/?*[\]:]/g, "").slice(0, 31) || "Sheet";
    let name = cleaned;
    let i = 2;
    while (seen.has(name)) {
      const suffix = ` (${i++})`;
      name = cleaned.slice(0, 31 - suffix.length) + suffix;
    }
    seen.add(name);
    return name;
  };
}

// ── Print / PDF (via window.print on a hidden iframe) ────────────────────────
// We render a standalone styled HTML document into an iframe and call print on
// it. The browser's native dialog handles "Save as PDF" — no client-side PDF
// library needed, and the output is brand-consistent with the on-screen
// preview because we share the same markup conventions.
export function printReport(report: ReportData): void {
  const html = renderPrintHtml(report);
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  // Give the iframe a tick to apply styles before printing
  const cw = frame.contentWindow;
  if (!cw) return;
  const after = () => {
    try { document.body.removeChild(frame); } catch { /* noop */ }
  };
  cw.addEventListener("afterprint", after);
  setTimeout(() => {
    try {
      cw.focus();
      cw.print();
    } catch {
      after();
    }
  }, 250);
}

function renderPrintHtml(report: ReportData): string {
  const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
  const toneBg: Record<string, string> = {
    positive: "#ecfdf5; color:#065f46; border-color:#a7f3d0",
    warning: "#fffbeb; color:#92400e; border-color:#fde68a",
    danger: "#fef2f2; color:#991b1b; border-color:#fecaca",
    info: "#eff6ff; color:#1e40af; border-color:#bfdbfe",
  };

  const sectionsHtml = report.sections.map((s) => {
    const statsHtml = s.stats && s.stats.length > 0
      ? `<div class="stats">${s.stats.map((st) => `<div class="stat" style="background:${toneBg[st.tone ?? "info"]}"><div class="sl">${esc(st.label)}</div><div class="sv">${esc(st.value)}</div></div>`).join("")}</div>`
      : "";
    if (s.columns.length === 0) {
      return `<section class="rsec"><h2>${esc(s.heading)}</h2>${statsHtml}<p class="empty">No data.</p></section>`;
    }
    const head = s.columns.map((c) => `<th style="text-align:${c.align ?? "left"}">${esc(c.label)}</th>`).join("");
    const body = s.rows.map((row) => {
      const cells = s.columns.map((c) => {
        const v = formatCell(row[c.key], c.format);
        return `<td style="text-align:${c.align ?? "left"}">${esc(v)}</td>`;
      }).join("");
      return `<tr>${cells}</tr>`;
    }).join("");
    let totalsRow = "";
    if (s.columns.some((c) => c.total)) {
      const cells = s.columns.map((c, i) => {
        if (i === 0) return `<td class="ttl">TOTAL</td>`;
        if (!c.total) return `<td></td>`;
        const sum = s.rows.reduce((sm, r) => sm + (Number(r[c.key]) || 0), 0);
        return `<td class="ttl" style="text-align:${c.align ?? "right"}">${esc(formatCell(sum, c.format))}</td>`;
      }).join("");
      totalsRow = `<tr class="totalsrow">${cells}</tr>`;
    }
    return `<section class="rsec">
      <h2>${esc(s.heading)}</h2>
      ${s.description ? `<p class="desc">${esc(s.description)}</p>` : ""}
      ${statsHtml}
      <table><thead><tr>${head}</tr></thead><tbody>${body}${totalsRow}</tbody></table>
      ${s.rows.length === 0 ? `<p class="empty">No rows.</p>` : ""}
    </section>`;
  }).join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"/>
<title>${esc(report.title)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color:#0f172a; margin:0; padding:0; font-size:11px; line-height:1.45; }
  header.rhdr { border-bottom:2px solid #0f172a; padding-bottom:10px; margin-bottom:14px; }
  header.rhdr .org { font-size:10px; color:#64748b; letter-spacing:.08em; text-transform:uppercase; font-weight:600; }
  header.rhdr h1 { margin:4px 0 2px 0; font-size:20px; letter-spacing:-.01em; }
  header.rhdr .sub { font-size:12px; color:#475569; }
  header.rhdr .gen { font-size:10px; color:#94a3b8; margin-top:6px; }
  .meta { display:grid; grid-template-columns:repeat(3, 1fr); gap:8px 18px; margin:10px 0 18px; padding:10px 12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; }
  .meta .m { font-size:10px; }
  .meta .ml { color:#64748b; text-transform:uppercase; letter-spacing:.06em; font-weight:600; font-size:9px; }
  .meta .mv { color:#0f172a; font-weight:600; margin-top:1px; }
  .rsec { margin-bottom:22px; page-break-inside:avoid; }
  .rsec h2 { font-size:13px; margin:0 0 6px; padding-bottom:4px; border-bottom:1px solid #cbd5e1; }
  .rsec .desc { font-size:10px; color:#64748b; margin:0 0 8px; }
  .stats { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:10px; }
  .stat { padding:8px 12px; border-radius:6px; border:1px solid; min-width:120px; }
  .stat .sl { font-size:9px; text-transform:uppercase; letter-spacing:.06em; font-weight:600; opacity:.85; }
  .stat .sv { font-size:14px; font-weight:700; margin-top:2px; }
  table { width:100%; border-collapse:collapse; font-size:10px; }
  th { background:#0f172a; color:#fff; padding:7px 8px; font-weight:600; font-size:10px; text-align:left; }
  td { padding:6px 8px; border-bottom:1px solid #e2e8f0; vertical-align:top; }
  tbody tr:nth-child(even) td { background:#f8fafc; }
  .totalsrow td { background:#0f172a !important; color:#fff; font-weight:700; }
  .totalsrow .ttl { background:#0f172a !important; }
  .empty { color:#94a3b8; font-style:italic; font-size:10px; padding:8px 0; }
  footer { margin-top:18px; padding-top:8px; border-top:1px solid #e2e8f0; font-size:9px; color:#94a3b8; text-align:center; }
</style></head>
<body>
  <header class="rhdr">
    ${report.organisationName ? `<div class="org">${esc(report.organisationName)}</div>` : ""}
    <h1>${esc(report.title)}</h1>
    ${report.subtitle ? `<div class="sub">${esc(report.subtitle)}</div>` : ""}
    <div class="gen">Generated ${esc(new Date(report.generatedAt).toLocaleString("en-IN"))}</div>
  </header>
  ${report.meta.length > 0 ? `<div class="meta">${report.meta.map((m) => `<div class="m"><div class="ml">${esc(m.label)}</div><div class="mv">${esc(m.value)}</div></div>`).join("")}</div>` : ""}
  ${sectionsHtml}
  <footer>${esc(report.organisationName ?? "KattidaCore")} • ${esc(report.title)}</footer>
</body></html>`;
}
