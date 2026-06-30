// ─────────────────────────────────────────────────────────────────────────────
// Reports hub — one page, eight report types, four export formats.
// ─────────────────────────────────────────────────────────────────────────────
// Layout: left rail picks the report type, right pane configures filters,
// generates the report, previews it, and exposes the four export actions.
// The preview reuses the same column-format helpers as the exporters so the
// on-screen view always matches the printed / spreadsheet output.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { useListProjects } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  FileText,
  Wallet,
  Users,
  ShoppingCart,
  GitBranch,
  ClipboardCheck,
  LayoutDashboard,
  Building2,
  Download,
  Printer,
  FileSpreadsheet,
  FileBarChart,
  Loader2,
  AlertCircle,
  Inbox,
} from "lucide-react";
import {
  type ReportData,
  formatCell,
  downloadCsv,
  downloadXlsx,
  printReport,
} from "@/lib/report-export";
import { cn } from "@/lib/utils";

type ReportKind =
  | "project-summary"
  | "dpr"
  | "financial"
  | "workforce"
  | "supply-chain"
  | "variation-orders"
  | "approvals-audit"
  | "portfolio";

type ReportDef = {
  id: ReportKind;
  label: string;
  description: string;
  icon: typeof FileText;
  needsProject: boolean;
  supportsDateRange: boolean;
};

// The display order doubles as priority — most actionable reports first.
const REPORTS: ReportDef[] = [
  { id: "project-summary", label: "Project Summary", description: "Per-project cockpit: progress, cost, utilization, insights.", icon: LayoutDashboard, needsProject: true, supportsDateRange: false },
  { id: "dpr", label: "Daily Progress (DPR)", description: "DPR register with manpower, weather, and status.", icon: FileText, needsProject: true, supportsDateRange: true },
  { id: "financial", label: "Financial", description: "Bills, POs, GRNs, deductions, advances.", icon: Wallet, needsProject: true, supportsDateRange: true },
  { id: "workforce", label: "Workforce & Safety", description: "Headcount, man-days, contractor cost, safety incidents.", icon: Users, needsProject: true, supportsDateRange: true },
  { id: "supply-chain", label: "Supply Chain", description: "Purchase orders, GRNs, 3-way match, vendor spend.", icon: ShoppingCart, needsProject: true, supportsDateRange: true },
  { id: "variation-orders", label: "Variation Orders", description: "VO register with cost & programme impact.", icon: GitBranch, needsProject: true, supportsDateRange: false },
  { id: "approvals-audit", label: "Approvals Audit", description: "Who approved what, when, and turnaround time.", icon: ClipboardCheck, needsProject: false, supportsDateRange: true },
  { id: "portfolio", label: "Portfolio", description: "All projects: status, completion, financial health.", icon: Building2, needsProject: false, supportsDateRange: false },
];

export default function ReportsPage() {
  const { data: projects = [] } = useListProjects();
  const { toast } = useToast();

  const [reportId, setReportId] = useState<ReportKind>("project-summary");
  const [projectId, setProjectId] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReportData | null>(null);

  const current = REPORTS.find((r) => r.id === reportId)!;

  // Auto-select first project when switching to a project-bound report.
  useEffect(() => {
    if (current.needsProject && !projectId && projects.length > 0) {
      setProjectId((projects as any)[0].id);
    }
    // Clear stale preview when switching report types so the user always
    // explicitly generates against the new filters.
    setData(null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  const canGenerate = !current.needsProject || !!projectId;

  const generate = async () => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const params = new URLSearchParams();
      if (current.needsProject) params.set("projectId", projectId);
      if (current.supportsDateRange) {
        if (from) params.set("from", new Date(from).toISOString());
        if (to) params.set("to", new Date(`${to}T23:59:59`).toISOString());
      }
      const qs = params.toString();
      const res = await fetch(`/api/reports/${reportId}${qs ? `?${qs}` : ""}`, { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any)?.error ?? `Request failed (${res.status})`);
      }
      const json = (await res.json()) as ReportData;
      setData(json);
    } catch (e: any) {
      setError(e?.message ?? "Failed to generate report.");
      toast({ title: "Report failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate professional, exportable reports across the portfolio. Print, PDF, Excel, or CSV.
          </p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Left: report type picker */}
        <aside>
          <Card>
            <CardContent className="p-2">
              <ul className="space-y-1">
                {REPORTS.map((r) => {
                  const Icon = r.icon;
                  const active = r.id === reportId;
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setReportId(r.id)}
                        data-testid={`report-pick-${r.id}`}
                        className={cn(
                          "w-full text-left rounded-lg p-3 transition flex items-start gap-3",
                          active
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted text-foreground/90",
                        )}
                      >
                        <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", active ? "text-primary-foreground" : "text-muted-foreground")} />
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-semibold">{r.label}</div>
                          <div className={cn("text-[11px] mt-0.5 leading-snug", active ? "text-primary-foreground/80" : "text-muted-foreground")}>
                            {r.description}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </aside>

        {/* Right: filters + actions + preview */}
        <main className="space-y-4 min-w-0">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div>
                <h2 className="text-base font-bold">{current.label}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{current.description}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {current.needsProject && (
                  <div className="sm:col-span-3">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Project</label>
                    <select
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                      data-testid="report-project"
                      className="mt-1 w-full h-9 px-3 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">— Select project —</option>
                      {projects.map((p: any) => (
                        <option key={p.id} value={p.id}>{p.code ? `${p.code} • ` : ""}{p.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {current.supportsDateRange && (
                  <>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">From</label>
                      <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="report-from"
                        className="mt-1 w-full h-9 px-3 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">To</label>
                      <input type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="report-to"
                        className="mt-1 w-full h-9 px-3 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                    </div>
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
                <Button onClick={generate} disabled={!canGenerate || loading} data-testid="report-generate">
                  {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileBarChart className="h-4 w-4 mr-2" />}
                  Generate
                </Button>
                <div className="flex-1" />
                <Button variant="outline" size="sm" disabled={!data} onClick={() => data && printReport(data)} data-testid="report-print">
                  <Printer className="h-4 w-4 mr-1.5" /> Print
                </Button>
                <Button variant="outline" size="sm" disabled={!data} onClick={() => data && printReport(data)} data-testid="report-pdf">
                  <Download className="h-4 w-4 mr-1.5" /> PDF
                </Button>
                <Button variant="outline" size="sm" disabled={!data} onClick={() => data && downloadXlsx(data)} data-testid="report-xlsx">
                  <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Excel
                </Button>
                <Button variant="outline" size="sm" disabled={!data} onClick={() => data && downloadCsv(data)} data-testid="report-csv">
                  <Download className="h-4 w-4 mr-1.5" /> CSV
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Preview */}
          {loading ? (
            <Card><CardContent className="p-6 space-y-3">
              <Skeleton className="h-8 w-1/3" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-48 w-full" />
            </CardContent></Card>
          ) : error ? (
            <Card><CardContent className="p-10 text-center">
              <AlertCircle className="mx-auto h-10 w-10 text-rose-500" />
              <h3 className="mt-3 font-semibold">Couldn't generate</h3>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
            </CardContent></Card>
          ) : data ? (
            <ReportPreview report={data} />
          ) : (
            <Card><CardContent className="p-12 text-center">
              <div className="mx-auto h-14 w-14 rounded-2xl bg-muted flex items-center justify-center">
                <Inbox className="h-7 w-7 text-muted-foreground" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">Configure & generate</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {current.needsProject ? "Choose a project" : "No setup needed"}
                {current.supportsDateRange ? ", set a date range, " : " "}
                and click Generate.
              </p>
            </CardContent></Card>
          )}
        </main>
      </div>
    </div>
  );
}

// ── Preview component ───────────────────────────────────────────────────────
function ReportPreview({ report }: { report: ReportData }) {
  const toneClass = (tone?: "positive" | "warning" | "danger" | "info") =>
    tone === "positive" ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900"
      : tone === "warning" ? "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900"
        : tone === "danger" ? "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900"
          : "bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900";

  return (
    <Card>
      <CardContent className="p-6 space-y-6" data-testid="report-preview">
        <header className="border-b-2 border-foreground/80 pb-4">
          {report.organisationName && (
            <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">
              {report.organisationName}
            </div>
          )}
          <h2 className="text-2xl font-bold tracking-tight mt-1">{report.title}</h2>
          {report.subtitle && <div className="text-sm text-muted-foreground mt-0.5">{report.subtitle}</div>}
          <div className="text-[11px] text-muted-foreground mt-2">
            Generated {new Date(report.generatedAt).toLocaleString("en-IN")}
          </div>
        </header>

        {report.meta.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 p-3 bg-muted/40 rounded-lg border">
            {report.meta.map((m, i) => (
              <div key={i}>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{m.label}</div>
                <div className="text-sm font-semibold mt-0.5 break-words">{m.value}</div>
              </div>
            ))}
          </div>
        )}

        {report.sections.map((section, si) => (
          <section key={si} className="space-y-3">
            <div>
              <h3 className="text-base font-bold border-b pb-1">{section.heading}</h3>
              {section.description && <p className="text-xs text-muted-foreground mt-1">{section.description}</p>}
            </div>

            {section.stats && section.stats.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {section.stats.map((s, i) => (
                  <div key={i} className={cn("rounded-lg border px-3 py-2 min-w-[140px]", toneClass(s.tone))}>
                    <div className="text-[10px] uppercase tracking-wide font-semibold opacity-85">{s.label}</div>
                    <div className="text-base font-bold mt-0.5">{s.value}</div>
                  </div>
                ))}
              </div>
            )}

            {section.columns.length > 0 && section.rows.length > 0 ? (
              <div className="overflow-x-auto border rounded-md">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-foreground text-background">
                      {section.columns.map((c) => (
                        <th key={c.key} className={cn("px-3 py-2 font-semibold whitespace-nowrap", c.align === "right" && "text-right", c.align === "center" && "text-center")}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.map((row, ri) => (
                      <tr key={ri} className="even:bg-muted/30 border-t">
                        {section.columns.map((c) => (
                          <td key={c.key} className={cn("px-3 py-2 align-top", c.align === "right" && "text-right tabular-nums", c.align === "center" && "text-center")}>
                            {formatCell(row[c.key], c.format)}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {section.columns.some((c) => c.total) && (
                      <tr className="bg-foreground text-background font-bold">
                        {section.columns.map((c, i) => {
                          if (i === 0) return <td key={c.key} className="px-3 py-2">TOTAL</td>;
                          if (!c.total) return <td key={c.key}></td>;
                          const sum = section.rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
                          return (
                            <td key={c.key} className={cn("px-3 py-2 tabular-nums", c.align === "right" && "text-right", c.align === "center" && "text-center")}>
                              {formatCell(sum, c.format)}
                            </td>
                          );
                        })}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">No rows</Badge>
            )}
          </section>
        ))}
      </CardContent>
    </Card>
  );
}
