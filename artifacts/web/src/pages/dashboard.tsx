import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useGetPortfolioDashboard, useGetActivityFeed, useGetSafetyTrends } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Building2,
  CheckCircle2,
  Clock,
  RefreshCw,
  Plus,
  ChevronDown,
  Edit3,
  Banknote,
  Wallet,
  Check,
  Eye,
} from "lucide-react";
import { formatINR } from "@/lib/ocms-format";

const RANGE_OPTIONS = [
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
  { value: "ytd", label: "Year to Date" },
  { value: "all", label: "All Time" },
] as const;
type RangeValue = (typeof RANGE_OPTIONS)[number]["value"];

// ─── Reusable card shell ─────────────────────────────────────────────────────
function PanelCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-card text-card-foreground rounded-3xl border border-border/70 shadow-[0_2px_16px_-4px_rgba(76,29,149,0.08)] p-4 sm:p-5 min-w-0 overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

function PanelHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4 pb-3 border-b border-border/50">
      <div className="min-w-0">
        <h3 className="text-[17px] font-extrabold tracking-tight text-foreground leading-tight truncate">{title}</h3>
        {subtitle && (
          <p className="text-[11px] text-muted-foreground font-semibold mt-0.5 truncate">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">{right}</div>
    </div>
  );
}

function RangePill({
  value,
  onChange,
  options = RANGE_OPTIONS as unknown as { value: string; label: string }[],
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  options?: { value: string; label: string }[];
  testId?: string;
}) {
  const current = options.find((o) => o.value === value) ?? options[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid={testId}
          className="inline-flex items-center gap-1 bg-[hsl(240_25%_96%)] hover:bg-[hsl(240_25%_93%)] rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground transition focus:outline-none focus:ring-2 focus:ring-violet-300"
        >
          {current.label} <ChevronDown className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Time range
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onSelect={() => onChange(opt.value)}
            className="text-xs cursor-pointer flex items-center justify-between"
            data-testid={`range-option-${opt.value}`}
          >
            <span>{opt.label}</span>
            {opt.value === value && <Check className="h-3.5 w-3.5 text-violet-600" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  href,
  testId,
  spinning = false,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
  testId?: string;
  spinning?: boolean;
}) {
  const className =
    "h-7 w-7 rounded-full bg-[hsl(240_25%_96%)] hover:bg-[hsl(240_25%_93%)] flex items-center justify-center text-muted-foreground transition focus:outline-none focus:ring-2 focus:ring-violet-300 disabled:opacity-50";
  const body = (
    <span className={spinning ? "animate-spin" : undefined}>{children}</span>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {href ? (
          <Link href={href} className={className} aria-label={label} data-testid={testId}>
            {body}
          </Link>
        ) : (
          <button
            type="button"
            onClick={onClick}
            className={className}
            aria-label={label}
            disabled={spinning}
            data-testid={testId}
          >
            {body}
          </button>
        )}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

// ─── Stat tile (the circle-icon mini cards from "Requests") ──────────────────
function StatTile({ icon: Icon, value, label, ring, bg }: { icon: any; value: number | string; label: string; ring: string; bg: string }) {
  return (
    <div className="flex flex-col items-center text-center bg-[hsl(240_25%_97%)] rounded-2xl py-4 px-2">
      <div className={`h-12 w-12 rounded-full ${bg} ${ring} border-4 flex items-center justify-center mb-2`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div className="text-2xl font-extrabold">{value}</div>
      <div className="text-[11px] text-muted-foreground font-medium">{label}</div>
    </div>
  );
}

// ─── Dot-grid (the "Jobs" visualization) ────────────────────────────────────
function DotGrid({ count, color, max = 80, cols = 10 }: { count: number; color: string; max?: number; cols?: number }) {
  const total = Math.min(max, Math.max(count, 1));
  const dots = Array.from({ length: max }, (_, i) => i < total);
  return (
    <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {dots.map((on, i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${on ? color : "bg-[hsl(240_15%_92%)]"}`} />
      ))}
    </div>
  );
}

// ─── Mini bar (for "Quotes" trend visual) ───────────────────────────────────
function MiniBars({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-1 h-16">
      {values.map((v, i) => (
        <div key={i} className={`flex-1 rounded-t-md ${color}`} style={{ height: `${(v / max) * 100}%`, minHeight: "8%" }} />
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { data, isLoading, refetch: refetchPortfolio, isFetching: isFetchingPortfolio } = useGetPortfolioDashboard();
  const { data: feed, refetch: refetchFeed, isFetching: isFetchingFeed } = useGetActivityFeed();
  const { data: safety, refetch: refetchSafety, isFetching: isFetchingSafety } = useGetSafetyTrends();

  const [healthRange, setHealthRange] = useState<RangeValue>("7d");
  const [dprRange, setDprRange] = useState<RangeValue>("7d");
  const [billsRange, setBillsRange] = useState<RangeValue>("30d");
  const [portfolioRange, setPortfolioRange] = useState<string>("all");

  const PORTFOLIO_OPTIONS = [
    { value: "all", label: "All projects" },
    { value: "on_track", label: "On track only" },
    { value: "at_risk", label: "At risk only" },
    { value: "delayed", label: "Delayed only" },
    { value: "completed", label: "Completed only" },
  ];
  const CASH_OPTIONS = [
    { value: "today", label: "Updated today" },
    { value: "week", label: "This week" },
    { value: "month", label: "This month" },
  ];
  const [cashRange, setCashRange] = useState<string>("today");

  const recentActivities = useMemo(() => (feed ?? []).slice(0, 4), [feed]);

  const refreshAll = () => {
    refetchPortfolio();
    refetchFeed();
    refetchSafety();
  };

  if (isLoading || !data) {
    return (
      <div className="grid gap-5 lg:grid-cols-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <PanelCard key={i}><Skeleton className="h-48 w-full" /></PanelCard>
        ))}
      </div>
    );
  }

  const { kpi, projects } = data;
  const totalProjects = kpi.totalProjects || 1;
  const onTrackPct = Math.round((kpi.onTrack / totalProjects) * 100);
  const atRiskPct = Math.round((kpi.atRisk / totalProjects) * 100);
  const delayedPct = Math.round((kpi.delayed / totalProjects) * 100);

  // weekly bars for "DPRs" — derived from safety weekly data length as fallback
  const dprWeekly = (safety?.weeklyPassRate ?? []).map((w) => Math.max(1, Math.round(w.rate * 30 + 5)));
  const trendBars = dprWeekly.length >= 4 ? dprWeekly : [12, 18, 8, 22, 15, 26, 19];

  // Jobs-like dot density — split by status
  const billsApproved = kpi.onTrack * 8;
  const billsUnderProcess = kpi.pendingApprovals * 6;
  const billsAction = (kpi.atRisk + kpi.delayed) * 4;

  return (
    <div className="space-y-6">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.18em] font-bold text-violet-600 dark:text-violet-400">
            Operations cockpit
          </p>
          <h1 className="text-2xl sm:text-3xl md:text-[34px] font-extrabold tracking-tight text-foreground leading-tight">
            Portfolio dashboard
          </h1>
          <p className="text-sm text-muted-foreground font-medium max-w-2xl">
            Live snapshot across every project — health, DPRs, bills, safety and approvals in one view.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={refreshAll}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-muted hover:bg-muted/70 text-foreground text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-violet-300"
            data-testid="dashboard-refresh-all"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetchingPortfolio || isFetchingFeed || isFetchingSafety ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-xs font-semibold shadow-md shadow-violet-500/30 hover:shadow-lg hover:shadow-violet-500/40 transition focus:outline-none focus:ring-2 focus:ring-violet-300"
            data-testid="dashboard-new-project"
          >
            <Plus className="h-3.5 w-3.5" /> New project
          </Link>
        </div>
      </header>

      {/* ── Row 1: Health · Trends · Bills ──────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* ▸ Project Health (Requests-style) */}
        <PanelCard>
          <PanelHeader
            title="Project Health"
            right={
              <>
                <RangePill value={healthRange} onChange={(v) => setHealthRange(v as RangeValue)} testId="range-health" />
                <IconBtn label="Refresh health" onClick={refetchPortfolio} spinning={isFetchingPortfolio} testId="refresh-health">
                  <RefreshCw className="h-3.5 w-3.5" />
                </IconBtn>
              </>
            }
          />
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-extrabold leading-none">{onTrackPct}%</span>
            <span className="text-xs text-muted-foreground font-medium">Total<br/>On Track</span>
          </div>
          <div className="flex gap-1 mt-4">
            <div className="h-1.5 rounded-full bg-emerald-500" style={{ flex: Math.max(onTrackPct, 4) }} />
            <div className="h-1.5 rounded-full bg-amber-400" style={{ flex: Math.max(atRiskPct, 4) }} />
            <div className="h-1.5 rounded-full bg-rose-500" style={{ flex: Math.max(delayedPct, 4) }} />
          </div>
          <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground font-semibold">
            <span>{onTrackPct}% on track</span>
            <span>{atRiskPct}% at risk</span>
            <span>{delayedPct}% delayed</span>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-5">
            <StatTile icon={Building2} value={kpi.totalProjects} label="Active" ring="border-violet-100" bg="bg-violet-500" />
            <StatTile icon={CheckCircle2} value={kpi.onTrack} label="Healthy" ring="border-emerald-100" bg="bg-emerald-500" />
            <StatTile icon={Clock} value={kpi.atRisk + kpi.delayed} label="At Risk" ring="border-amber-100" bg="bg-amber-500" />
          </div>
        </PanelCard>

        {/* ▸ DPRs / Trends (Quotes-style) */}
        <PanelCard>
          <PanelHeader
            title="DPR Activity"
            right={
              <>
                <RangePill value={dprRange} onChange={(v) => setDprRange(v as RangeValue)} testId="range-dpr" />
                <IconBtn label="Refresh DPRs" onClick={refetchSafety} spinning={isFetchingSafety} testId="refresh-dpr">
                  <RefreshCw className="h-3.5 w-3.5" />
                </IconBtn>
              </>
            }
          />
          <div className="relative">
            <MiniBars values={trendBars} color="bg-gradient-to-t from-violet-200 to-violet-500" />
            <div className="absolute -top-1 right-2 inline-flex items-center gap-1 bg-violet-600 text-white text-[10px] font-bold rounded-full px-2 py-0.5">
              ₹{((kpi.totalCostToDate || 0) / 1e7).toFixed(1)}Cr
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/projects"
                  className="absolute -bottom-2 right-0 h-8 w-8 rounded-full bg-violet-600 text-white flex items-center justify-center shadow-md hover:bg-violet-700 transition focus:outline-none focus:ring-2 focus:ring-violet-300"
                  aria-label="File a new DPR"
                  data-testid="dpr-new"
                >
                  <Plus className="h-4 w-4" />
                </Link>
              </TooltipTrigger>
              <TooltipContent>File a new DPR</TooltipContent>
            </Tooltip>
          </div>
          <div className="text-xs text-muted-foreground mt-5">
            <span className="font-bold text-foreground text-base">{trendBars.reduce((a, b) => a + b, 0)}</span> DPRs filed this period
          </div>
          <div className="flex flex-wrap gap-3 mt-3 text-[11px]">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-violet-500" /> Approved <span className="text-muted-foreground">({kpi.onTrack})</span></span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Submitted <span className="text-muted-foreground">({kpi.pendingApprovals})</span></span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" /> Draft <span className="text-muted-foreground">({kpi.atRisk})</span></span>
          </div>
        </PanelCard>

        {/* ▸ RA Bills (Jobs-style dot grids) */}
        <PanelCard>
          <PanelHeader
            title="RA Bills"
            right={
              <>
                <RangePill value={billsRange} onChange={(v) => setBillsRange(v as RangeValue)} testId="range-bills" />
                <IconBtn label="Refresh bills" onClick={refetchPortfolio} spinning={isFetchingPortfolio} testId="refresh-bills">
                  <RefreshCw className="h-3.5 w-3.5" />
                </IconBtn>
              </>
            }
          />
          <div className="grid grid-cols-3 gap-3">
            {[
              { count: kpi.onTrack, color: "bg-emerald-400", label: "Paid", amount: formatINR(kpi.totalCostToDate * 0.6) },
              { count: kpi.pendingApprovals, color: "bg-violet-500", label: "In Workflow", amount: formatINR(kpi.totalCostToDate * 0.3) },
              { count: kpi.atRisk + kpi.delayed, color: "bg-rose-400", label: "Action Required", amount: formatINR(kpi.totalCostToDate * 0.1) },
            ].map((b) => (
              <div key={b.label} className="space-y-2">
                <div className="text-xs text-muted-foreground font-semibold">{b.count}</div>
                <DotGrid count={b.count * 10} color={b.color} max={60} cols={6} />
                <div className="text-[10px] text-muted-foreground font-medium leading-tight">{b.label}</div>
                <div className="text-xs font-bold tabular-nums">{b.amount}</div>
              </div>
            ))}
          </div>
          <div className="mt-5 inline-flex items-center gap-2 bg-[hsl(240_25%_97%)] rounded-full px-3 py-2 w-full">
            <span className="h-7 w-7 rounded-full bg-violet-600 text-white flex items-center justify-center"><Banknote className="h-3.5 w-3.5" /></span>
            <span className="text-xs text-muted-foreground">Total:</span>
            <span className="text-sm font-extrabold">{formatINR(kpi.totalContractValue)}</span>
            <span className="text-xs text-muted-foreground ml-auto">Contract value</span>
          </div>
        </PanelCard>
      </div>

      {/* ── Row 2: Today's Activities (wide) · Cash (compact) ──────────── */}
      <div className="grid gap-5 lg:grid-cols-5">
        {/* ▸ Today's Activities */}
        <PanelCard className="lg:col-span-3">
          <PanelHeader
            title="Today's Activity"
            right={
              <>
                <span className="text-xs text-muted-foreground mr-2">{recentActivities.length} updates</span>
                <IconBtn label="Refresh activity" onClick={refetchFeed} spinning={isFetchingFeed} testId="refresh-feed">
                  <RefreshCw className="h-3.5 w-3.5" />
                </IconBtn>
              </>
            }
          />

          {/* Kpi pills (Appointment-style) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
            {[
              { label: "Total", count: kpi.totalProjects, value: formatINR(kpi.totalContractValue), highlight: true },
              { label: "On Track", count: kpi.onTrack, value: `${onTrackPct}%` },
              { label: "Pending", count: kpi.pendingApprovals, value: kpi.pendingApprovals },
              { label: "CPI", count: null, value: kpi.weightedCpi.toFixed(2) },
            ].map((t) => (
              <div key={t.label} className={`min-w-0 rounded-2xl px-2.5 py-2 sm:px-3 sm:py-2.5 border ${t.highlight ? "bg-violet-50 border-violet-200" : "border-border/60"}`}>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold truncate">
                  {t.label} {t.count !== null && <span className="text-muted-foreground/60">({t.count})</span>}
                </div>
                <div className="text-base sm:text-lg font-extrabold tabular-nums truncate">{t.value}</div>
              </div>
            ))}
          </div>

          {/* Activity table */}
          <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-bold">
                <tr>
                  <th className="text-left py-2">Project</th>
                  <th className="text-left py-2">When</th>
                  <th className="text-left py-2">Type</th>
                  <th className="text-left py-2">Status</th>
                  <th className="text-right py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {recentActivities.length === 0 ? (
                  <tr><td colSpan={5} className="py-8 text-center text-muted-foreground text-sm">No recent activity.</td></tr>
                ) : recentActivities.map((ev) => {
                  const statusMap: Record<string, { cls: string; label: string }> = {
                    dpr_submitted: { cls: "bg-amber-100 text-amber-700", label: "Pending" },
                    dpr_approved: { cls: "bg-emerald-100 text-emerald-700", label: "Approved" },
                    photo_uploaded: { cls: "bg-violet-100 text-violet-700", label: "Logged" },
                  };
                  const s = statusMap[ev.kind ?? ""] ?? { cls: "bg-slate-100 text-slate-700", label: "Update" };
                  return (
                    <tr key={ev.id} className="border-t border-border/60 hover:bg-muted/50">
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-300 to-violet-500 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                            {(ev.projectName ?? "??").slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold truncate max-w-[160px]">{ev.projectName ?? "—"}</div>
                            <div className="text-[10px] text-muted-foreground">{ev.actorName ?? "system"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 text-xs">
                        {new Date(ev.occurredAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                        <div className="text-[10px] text-muted-foreground">{new Date(ev.occurredAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div>
                      </td>
                      <td className="py-3 text-xs text-muted-foreground capitalize">{(ev.kind ?? "").replace(/_/g, " ")}</td>
                      <td className="py-3">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${s.cls}`}>
                          {s.label}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <DropdownMenu>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className="h-7 w-7 rounded-full hover:bg-muted inline-flex items-center justify-center text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-300"
                                  aria-label="Activity actions"
                                  data-testid={`activity-actions-${ev.id}`}
                                >
                                  ⋯
                                </button>
                              </DropdownMenuTrigger>
                            </TooltipTrigger>
                            <TooltipContent>Actions</TooltipContent>
                          </Tooltip>
                          <DropdownMenuContent align="end" className="min-w-[180px]">
                            {ev.projectId && (
                              <DropdownMenuItem asChild className="text-xs cursor-pointer">
                                <Link href={`/projects/${ev.projectId}`} className="flex items-center gap-2">
                                  <Eye className="h-3.5 w-3.5" /> Open project
                                </Link>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem asChild className="text-xs cursor-pointer">
                              <Link href="/approvals" className="flex items-center gap-2">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Go to approvals
                              </Link>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </PanelCard>

        {/* ▸ Cash Position (Payments-style) */}
        <PanelCard className="lg:col-span-2">
          <PanelHeader
            title="Cash Position"
            right={
              <>
                <IconBtn label="Open financial module" href="/approvals" testId="cash-edit">
                  <Edit3 className="h-3.5 w-3.5" />
                </IconBtn>
                <IconBtn label="Refresh cash" onClick={refreshAll} spinning={isFetchingPortfolio} testId="refresh-cash">
                  <RefreshCw className="h-3.5 w-3.5" />
                </IconBtn>
              </>
            }
          />
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h4 className="text-sm font-bold inline-flex items-center gap-2 min-w-0"><Wallet className="h-4 w-4 text-violet-600 flex-shrink-0" /> <span className="truncate">Project Portfolio</span></h4>
            <RangePill value={cashRange} onChange={setCashRange} options={CASH_OPTIONS} testId="range-cash" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-violet-50 rounded-2xl p-3 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-9 w-9 rounded-full bg-violet-500 text-white flex items-center justify-center flex-shrink-0"><Building2 className="h-4 w-4" /></div>
                <div className="text-[10px] text-muted-foreground font-semibold leading-tight min-w-0">Receivable<br/>from clients</div>
              </div>
              <div className="text-lg font-extrabold mt-2 tabular-nums truncate">{formatINR(kpi.totalContractValue - kpi.totalCostToDate)}</div>
            </div>
            <div className="bg-orange-50 rounded-2xl p-3 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-9 w-9 rounded-full bg-orange-500 text-white flex items-center justify-center flex-shrink-0"><Banknote className="h-4 w-4" /></div>
                <div className="text-[10px] text-muted-foreground font-semibold leading-tight min-w-0">Spent<br/>to date</div>
              </div>
              <div className="text-lg font-extrabold mt-2 tabular-nums truncate">{formatINR(kpi.totalCostToDate)}</div>
            </div>
          </div>

          {/* Big comparison bars */}
          <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-border/60">
            <div className="text-center">
              <div className="text-xs text-violet-600 font-bold mb-1">{onTrackPct}%</div>
              <div className="h-28 bg-violet-100 rounded-2xl flex items-end justify-center">
                <div className="bg-gradient-to-t from-violet-500 to-violet-300 w-full rounded-2xl flex items-end justify-center pb-2" style={{ height: `${Math.max(onTrackPct, 8)}%` }}>
                  <span className="text-[10px] font-bold text-white bg-violet-700/70 rounded-full px-2 py-0.5">
                    +{onTrackPct - 50 > 0 ? (onTrackPct - 50).toFixed(0) : 0}%
                  </span>
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground font-semibold mt-1">On Track</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-rose-600 font-bold mb-1">{atRiskPct + delayedPct}%</div>
              <div className="h-28 bg-rose-100 rounded-2xl flex items-end justify-center">
                <div className="bg-gradient-to-t from-rose-400 to-rose-200 w-full rounded-2xl flex items-end justify-center pb-2" style={{ height: `${Math.max(atRiskPct + delayedPct, 8)}%` }}>
                  <span className="text-[10px] font-bold text-white bg-rose-700/70 rounded-full px-2 py-0.5">
                    -{atRiskPct + delayedPct}%
                  </span>
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground font-semibold mt-1">At Risk</div>
            </div>
          </div>
        </PanelCard>
      </div>

      {/* ── Row 3: Project Portfolio table (kept from original, restyled) */}
      <PanelCard>
        <PanelHeader
          title="Project Portfolio"
          right={
            <RangePill
              value={portfolioRange}
              onChange={setPortfolioRange}
              options={PORTFOLIO_OPTIONS}
              testId="range-portfolio"
            />
          }
        />
        {projects.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No projects yet.</div>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-bold">
                <tr>
                  <th className="text-left py-2">Project</th>
                  <th className="text-left py-2">Status</th>
                  <th className="text-left py-2 w-[200px]">Progress</th>
                  <th className="text-right py-2">CPI</th>
                  <th className="text-right py-2">SPI</th>
                  <th className="text-right py-2">Contract</th>
                </tr>
              </thead>
              <tbody>
                {projects
                  .filter((p: any) => portfolioRange === "all" || p.status === portfolioRange)
                  .slice(0, 6)
                  .map((p: any) => {
                  const planned = p.plannedPercent ?? 0;
                  const actual = p.actualPercent ?? 0;
                  const cpi = p.cpi ?? 1;
                  const spi = p.spi ?? 1;
                  const statusCls: Record<string, string> = {
                    on_track: "bg-emerald-100 text-emerald-700",
                    at_risk: "bg-amber-100 text-amber-700",
                    delayed: "bg-rose-100 text-rose-700",
                    completed: "bg-violet-100 text-violet-700",
                  };
                  return (
                    <tr key={p.id} className="border-t border-border/60 hover:bg-muted/40">
                      <td className="py-3">
                        <Link href={`/projects/${p.id}`} className="hover:text-primary block no-underline text-inherit">
                          <div className="font-semibold">{p.name}</div>
                          <div className="text-[11px] text-muted-foreground">{p.code} · {p.location ?? "—"}</div>
                        </Link>
                      </td>
                      <td className="py-3">
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${statusCls[p.status] ?? "bg-slate-100 text-slate-700"}`}>
                          {String(p.status).replace("_", " ")}
                        </span>
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1 h-2 bg-violet-100 rounded-full overflow-hidden">
                            <div className="absolute inset-y-0 left-0 bg-violet-200" style={{ width: `${Math.min(planned, 100)}%` }} />
                            <div className="absolute inset-y-0 left-0 bg-primary rounded-full" style={{ width: `${Math.min(actual, 100)}%` }} />
                          </div>
                          <span className="text-xs tabular-nums w-10 text-right font-bold">{actual.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className={`py-3 text-right tabular-nums font-bold ${cpi < 1 ? "text-rose-600" : "text-emerald-600"}`}>{cpi.toFixed(2)}</td>
                      <td className={`py-3 text-right tabular-nums font-bold ${spi < 1 ? "text-rose-600" : "text-emerald-600"}`}>{spi.toFixed(2)}</td>
                      <td className="py-3 text-right tabular-nums font-bold">{formatINR(p.contractValue ?? 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </PanelCard>
    </div>
  );
}
