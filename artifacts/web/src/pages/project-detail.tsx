import {
  useGetProjectDashboard,
  getGetProjectDashboardQueryKey,
  useReverseGeocode,
  useUpdateProject,
  useListOrganisations,
  getGetProjectQueryKey,
  useGetMyProfile,
  useListApprovals,
  useResolveApproval,
  getListApprovalsQueryKey,
} from "@workspace/api-client-react";
import { useParams, Link, useSearch, useLocation } from "wouter";
import { PROJECT_TABS, VALID_PROJECT_TABS as VPT } from "@/lib/project-tabs";
import { getEffectiveModules, moduleEnabled } from "@/lib/modules";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Building2, Calendar, FileText, LayoutDashboard, ListTodo, MapPin, AlertCircle, Camera, FolderOpen, Calculator, GitBranch, TrendingUp, Banknote, ShoppingCart, HardHat, Loader2, Play, Pause, CheckCircle, RotateCcw, Send, ClipboardCheck } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { CheckCircle2, AlertTriangle, XCircle, TrendingDown, Wallet, Coins, PiggyBank, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SettingsTab } from "@/components/project-tabs/settings-tab";
import { WbsTab } from "@/components/project-tabs/wbs-tab";
import { MilestonesTab } from "@/components/project-tabs/milestones-tab";
import { DprsTab } from "@/components/project-tabs/dprs-tab";
import { PhotosTab } from "@/components/project-tabs/photos-tab";
import { DocumentsTab } from "@/components/project-tabs/documents-tab";
import { IssuesTab } from "@/components/project-tabs/issues-tab";
import EstimationPage from "@/pages/estimation";
import VariationOrdersPage from "@/pages/variation-orders";
import BoqVsActualPage from "@/pages/boq-vs-actual";
import FinancialPage from "@/pages/financial";
import SupplyChainPage from "@/pages/supply-chain";
import WorkforcePage from "@/pages/workforce";

export default function ProjectDetail() {
  const params = useParams();
  const id = params.id as string;
  
  const { data, isLoading } = useGetProjectDashboard(id, {
    query: { enabled: !!id, queryKey: getGetProjectDashboardQueryKey(id) },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/3" />
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Skeleton className="h-[300px] w-full" />
          <Skeleton className="h-[300px] w-full" />
          <Skeleton className="h-[300px] w-full" />
        </div>
      </div>
    );
  }

  if (!data) return <div>Project not found</div>;

  const { project, health, cost, miniGantt, activityStatusCounts, recentPhotos, pendingActions, nextMilestone } = data;
  // `summary` is added by the api-server but not yet in the generated OpenAPI
  // types; cast through `any` to read it without forcing a codegen cycle.
  const summary = (data as any).summary as ProjectSummary | undefined;

  const ganttBounds = (() => {
    const dates: number[] = [];
    for (const a of miniGantt) {
      if (a.plannedStart) dates.push(new Date(a.plannedStart).getTime());
      if (a.plannedEnd) dates.push(new Date(a.plannedEnd).getTime());
      if (a.actualStart) dates.push(new Date(a.actualStart).getTime());
      if (a.actualEnd) dates.push(new Date(a.actualEnd).getTime());
    }
    if (dates.length === 0) return null;
    const min = Math.min(...dates);
    const max = Math.max(...dates);
    return { min, max, span: Math.max(1, max - min) };
  })();

  const statusColors: Record<string, string> = {
    pending_approval: "bg-amber-100 text-amber-900",
    not_started: "bg-slate-200 text-slate-700",
    on_track: "bg-emerald-100 text-emerald-800",
    at_risk: "bg-amber-100 text-amber-800",
    delayed: "bg-rose-100 text-rose-800",
    on_hold: "bg-slate-200 text-slate-700",
    completed: "bg-blue-100 text-blue-800",
  };

  const chartStatusColors: Record<string, string> = {
    pending_approval: "#f59e0b", // amber-500
    not_started: "#94a3b8", // slate-400
    on_track: "#10b981", // emerald-500
    at_risk: "#f59e0b", // amber-500
    delayed: "#ef4444", // rose-500
    on_hold: "#64748b", // slate-500
    completed: "#3b82f6", // blue-500
  };

  const activityData = [
    { name: 'Not Started', value: activityStatusCounts.not_started, fill: chartStatusColors.not_started },
    { name: 'On Track', value: activityStatusCounts.on_track, fill: chartStatusColors.on_track },
    { name: 'At Risk', value: activityStatusCounts.at_risk, fill: chartStatusColors.at_risk },
    { name: 'Delayed', value: activityStatusCounts.delayed, fill: chartStatusColors.delayed },
    { name: 'Completed', value: activityStatusCounts.completed, fill: chartStatusColors.completed },
  ].filter(item => item.value > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/projects" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
            <Badge className={statusColors[project.status] || "bg-primary"}>{project.status.replace("_", " ")}</Badge>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
            <span className="flex items-center gap-1"><Building2 className="h-4 w-4" /> {project.code}</span>
            {project.location && <span className="flex items-center gap-1"><MapPin className="h-4 w-4" /> {project.location}</span>}
          </div>
        </div>
      </div>

      <ProjectLifecycleCard project={project} />

      <ProjectTabs
        id={id}
        project={project}
        health={health}
        nextMilestone={nextMilestone}
        statusColors={statusColors}
        chartStatusColors={chartStatusColors}
        activityData={activityData}
        miniGantt={miniGantt}
        ganttBounds={ganttBounds}
        recentPhotos={recentPhotos}
        pendingActions={pendingActions}
        cost={cost}
        summary={summary}
      />
    </div>
  );
}

// ─── Lifecycle / approval workflow card ──────────────────────────────────────
// Renders the project's current stage + the buttons the current role is
// allowed to press. Approval-stage transitions go through POST /approvals/.../resolve
// (so they appear in the Approvals inbox too); every other stage move calls
// POST /api/projects/:id/transition. Both invalidate the dashboard query so
// the badge + activity counters refresh in place.
type LifecycleAction = {
  to: string;
  label: string;
  icon: typeof Play;
  tone: "primary" | "success" | "warning" | "danger" | "neutral";
};

const STATUS_LABEL: Record<string, string> = {
  pending_approval: "Pending Approval",
  not_started: "Not Started",
  on_track: "On Track",
  at_risk: "At Risk",
  delayed: "Delayed",
  on_hold: "On Hold",
  completed: "Completed",
};

const STATUS_DESCRIPTION: Record<string, string> = {
  pending_approval:
    "Waiting for an Admin or Super Admin to approve this project before work can begin.",
  not_started: "Approved and ready. A Project Manager or Owner can start it now.",
  on_track: "Work is on schedule. Mark at risk / delayed / on hold as needed.",
  at_risk: "Watch closely — adjust the schedule or escalate.",
  delayed: "Behind plan. Recover the schedule or pause the project.",
  on_hold: "Paused. Resume when ready, or resubmit for re-approval after edits.",
  completed: "Closed out. No further transitions allowed.",
};

function getLifecycleActions(status: string, role: string | null): LifecycleAction[] {
  const isAdmin = role === "admin" || role === "super_admin";
  const isOperator = isAdmin || role === "owner" || role === "pm";
  switch (status) {
    case "pending_approval":
      // Approve/reject happens via the Approvals page resolve flow so it stays
      // in the inbox; we surface inline shortcuts here for the same admins.
      if (isAdmin) {
        return [
          { to: "not_started", label: "Approve", icon: ClipboardCheck, tone: "success" },
          { to: "on_hold", label: "Reject (park on hold)", icon: Pause, tone: "danger" },
        ];
      }
      return [];
    case "not_started":
      return isOperator
        ? [
            { to: "on_track", label: "Start project", icon: Play, tone: "primary" },
            { to: "on_hold", label: "Hold", icon: Pause, tone: "neutral" },
          ]
        : [];
    case "on_track":
      return isOperator
        ? [
            { to: "at_risk", label: "Flag at risk", icon: AlertCircle, tone: "warning" },
            { to: "delayed", label: "Mark delayed", icon: AlertCircle, tone: "danger" },
            { to: "on_hold", label: "Hold", icon: Pause, tone: "neutral" },
            ...(isAdmin
              ? [{ to: "completed" as const, label: "Mark complete", icon: CheckCircle, tone: "success" as const }]
              : []),
          ]
        : [];
    case "at_risk":
      return isOperator
        ? [
            { to: "on_track", label: "Back on track", icon: Play, tone: "success" },
            { to: "delayed", label: "Mark delayed", icon: AlertCircle, tone: "danger" },
            { to: "on_hold", label: "Hold", icon: Pause, tone: "neutral" },
            ...(isAdmin
              ? [{ to: "completed" as const, label: "Mark complete", icon: CheckCircle, tone: "success" as const }]
              : []),
          ]
        : [];
    case "delayed":
      return isOperator
        ? [
            { to: "on_track", label: "Back on track", icon: Play, tone: "success" },
            { to: "at_risk", label: "Mark at risk", icon: AlertCircle, tone: "warning" },
            { to: "on_hold", label: "Hold", icon: Pause, tone: "neutral" },
            ...(isAdmin
              ? [{ to: "completed" as const, label: "Mark complete", icon: CheckCircle, tone: "success" as const }]
              : []),
          ]
        : [];
    case "on_hold":
      return isOperator
        ? [
            { to: "on_track", label: "Resume", icon: RotateCcw, tone: "success" },
            { to: "pending_approval", label: "Resubmit for approval", icon: Send, tone: "primary" },
          ]
        : [];
    default:
      return [];
  }
}

const TONE_CLASS: Record<LifecycleAction["tone"], string> = {
  primary: "bg-violet-600 hover:bg-violet-700 text-white",
  success: "bg-emerald-600 hover:bg-emerald-700 text-white",
  warning: "bg-amber-500 hover:bg-amber-600 text-white",
  danger: "bg-rose-600 hover:bg-rose-700 text-white",
  neutral: "bg-slate-200 hover:bg-slate-300 text-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-100",
};

function ProjectLifecycleCard({ project }: { project: any }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: profile } = useGetMyProfile();
  const role: string | null = (profile as any)?.role ?? null;
  const [busy, setBusy] = useState<string | null>(null);

  const status: string = project.status;
  const actions = getLifecycleActions(status, role);

  // For pending_approval, the inline Approve/Reject buttons must go through
  // the approval-ticket resolve route so the Approvals inbox and the project
  // status stay in lockstep (and the admin-only gate lives in one place).
  // We look up the open approval row for this project from the user's inbox.
  const { data: approvals } = useListApprovals();
  const pendingApproval = useMemo(() => {
    if (status !== "pending_approval" || !Array.isArray(approvals)) return null;
    return (
      (approvals as any[]).find(
        (a) => a.entityType === "project" && a.entityId === project.id,
      ) ?? null
    );
  }, [approvals, project.id, status]);
  const resolveApproval = useResolveApproval();

  const invalidateAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetProjectDashboardQueryKey(project.id) }),
      queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(project.id) }),
      queryClient.invalidateQueries({ queryKey: getListApprovalsQueryKey() }),
    ]);
  };

  const runTransition = async (to: string) => {
    setBusy(to);
    try {
      // pending_approval → not_started/on_hold must go through the resolve
      // route (state-machine endpoint refuses these moves intentionally).
      if (status === "pending_approval") {
        if (!pendingApproval) {
          throw new Error(
            "No open approval ticket found for this project. Refresh and try again.",
          );
        }
        const decision = to === "not_started" ? "approved" : "rejected";
        await resolveApproval.mutateAsync({
          approvalId: pendingApproval.id,
          data: { decision },
        });
      } else {
        const resp = await fetch(`/api/projects/${project.id}/transition`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ to }),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error || `Transition failed (${resp.status})`);
        }
      }
      await invalidateAll();
      toast({
        title: "Project updated",
        description: `Status moved to ${STATUS_LABEL[to] ?? to}.`,
      });
    } catch (e: any) {
      toast({
        title: "Could not change status",
        description: e?.message ?? "Transition failed.",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const isPending = status === "pending_approval";

  return (
    <Card
      data-testid="project-lifecycle-card"
      className={isPending ? "border-amber-300 bg-amber-50/60 dark:bg-amber-950/20" : undefined}
    >
      <CardContent className="p-5 flex flex-col lg:flex-row lg:items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">
            Project Lifecycle
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-lg font-semibold">{STATUS_LABEL[status] ?? status}</span>
            {isPending && (
              <Badge variant="outline" className="text-[11px] border-amber-400 text-amber-800 dark:text-amber-200">
                Awaiting admin approval
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{STATUS_DESCRIPTION[status] ?? ""}</p>
          {project.lastTransitionNote && (
            <p className="text-xs text-muted-foreground mt-1 italic">
              Note: {project.lastTransitionNote}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {actions.length === 0 ? (
            <span className="text-xs text-muted-foreground italic">
              {status === "completed"
                ? "Project complete."
                : "No actions available for your role."}
            </span>
          ) : (
            actions.map((a) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.to}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => runTransition(a.to)}
                  className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${TONE_CLASS[a.tone]}`}
                  data-testid={`lifecycle-${a.to}`}
                >
                  {busy === a.to ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                  {a.label}
                </button>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectLocationPanel({
  projectId,
  latitude,
  longitude,
  location,
}: {
  projectId: string;
  latitude: number | null;
  longitude: number | null;
  location: string | null;
}) {
  const lat = typeof latitude === "number" && Number.isFinite(latitude) ? latitude : null;
  const lon = typeof longitude === "number" && Number.isFinite(longitude) ? longitude : null;

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const geocode = useReverseGeocode();
  const updateProject = useUpdateProject();
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error" | "done">("idle");
  const lastReqKey = useRef<string>("");

  useEffect(() => {
    if (lat === null || lon === null) {
      setSuggestion(null);
      setState("idle");
      lastReqKey.current = "";
      return;
    }
    const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
    if (key === lastReqKey.current) return;
    lastReqKey.current = key;
    setState("loading");
    geocode.mutate(
      { data: { lat, lon } },
      {
        onSuccess: (resp) => {
          if (resp.address) {
            setSuggestion(resp.address);
            setState("done");
          } else {
            setSuggestion(null);
            setState("error");
          }
        },
        onError: () => {
          setSuggestion(null);
          setState("error");
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon]);

  if (lat === null || lon === null) return null;

  const matchesCurrent = suggestion !== null && location !== null && suggestion.trim() === location.trim();
  const delta = 0.005;
  const bbox = `${lon - delta},${lat - delta},${lon + delta},${lat + delta}`;
  const mapSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat},${lon}`;
  const osmLink = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;

  const onUse = () => {
    if (!suggestion) return;
    updateProject.mutate(
      { projectId, data: { location: suggestion } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProjectDashboardQueryKey(projectId) });
          queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
          toast({ title: "Address updated", description: "Project site address replaced with the suggestion." });
        },
        onError: (err: any) => {
          toast({ title: "Update failed", description: err?.message ?? "Could not update address", variant: "destructive" });
        },
      },
    );
  };

  return (
    <Card data-testid="project-location-panel">
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <MapPin className="h-4 w-4" /> Site Location
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-[1fr_320px]">
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Coordinates:</span>{" "}
              <span className="font-mono">{lat.toFixed(6)}, {lon.toFixed(6)}</span>
            </div>
            <div
              className={`rounded-lg border px-3 py-2 text-xs flex items-start gap-2 ${
                state === "done"
                  ? matchesCurrent
                    ? "border-border bg-muted/40 text-muted-foreground"
                    : "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-border bg-muted/40 text-muted-foreground"
              }`}
              data-testid="address-suggestion"
            >
              <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                {state === "loading" && (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Looking up address from coordinates…
                  </span>
                )}
                {state === "done" && suggestion && (
                  <>
                    <span className="font-medium">Suggested:</span>{" "}
                    <span className="break-words">{suggestion}</span>
                    {matchesCurrent && <span className="ml-1 text-emerald-700">(matches current)</span>}
                  </>
                )}
                {state === "error" && <span>Could not resolve address from these coordinates.</span>}
              </div>
              {state === "done" && suggestion && !matchesCurrent && (
                <button
                  type="button"
                  className="text-emerald-700 hover:text-emerald-900 font-semibold underline whitespace-nowrap disabled:opacity-60"
                  onClick={onUse}
                  disabled={updateProject.isPending}
                  data-testid="address-use-suggestion"
                >
                  {updateProject.isPending ? "Saving…" : "Use this"}
                </button>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <div className="aspect-video w-full rounded-lg overflow-hidden border bg-muted">
              <iframe
                title="Site map preview"
                src={mapSrc}
                className="w-full h-full"
                loading="lazy"
                referrerPolicy="no-referrer"
                data-testid="map-preview"
              />
            </div>
            <a
              href={osmLink}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-muted-foreground hover:text-foreground underline"
            >
              View larger map on OpenStreetMap
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const VALID_PROJECT_TABS = VPT;

function ProjectTabs({ id, project, health, nextMilestone, statusColors, chartStatusColors, activityData, miniGantt, ganttBounds, recentPhotos, pendingActions, cost, summary }: {
  id: string;
  project: any;
  health: any;
  nextMilestone: any;
  statusColors: Record<string, string>;
  chartStatusColors: Record<string, string>;
  activityData: Array<{ name: string; value: number; fill: string }>;
  miniGantt: any[];
  ganttBounds: { min: number; max: number; span: number } | null;
  recentPhotos: any[];
  pendingActions: any;
  cost: any;
  summary: ProjectSummary | undefined;
}) {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const { data: orgs } = useListOrganisations();
  const effectiveModules = useMemo(() => {
    const org = (orgs ?? []).find((o: any) => o.id === project?.organisationId);
    return getEffectiveModules(
      (org as any)?.enabledModules ?? null,
      (project as any)?.enabledModulesOverride ?? null,
    );
  }, [orgs, project?.organisationId, (project as any)?.enabledModulesOverride]);
  const isTabAllowed = (v: string) => {
    const tabDef = PROJECT_TABS.find((t) => t.value === v);
    if (!tabDef) return false;
    return moduleEnabled(effectiveModules, tabDef.moduleKey);
  };
  const readTab = () => {
    const t = new URLSearchParams(search).get("tab");
    const candidate = t && (VALID_PROJECT_TABS as readonly string[]).includes(t) ? t : "dashboard";
    return isTabAllowed(candidate) ? candidate : "dashboard";
  };
  const [tab, setTab] = useState<string>(readTab());
  useEffect(() => { setTab(readTab()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [search, effectiveModules]);
  const onTabChange = (v: string) => {
    setTab(v);
    const params = new URLSearchParams(search);
    if (v === "dashboard") params.delete("tab"); else params.set("tab", v);
    const qs = params.toString();
    setLocation(`/projects/${id}${qs ? `?${qs}` : ""}`);
  };
  return (
      <Tabs value={tab} onValueChange={onTabChange} className="space-y-6">
        <TabsContent value="site-location" className="space-y-6">
          <ProjectLocationPanel
            projectId={id}
            latitude={project.latitude}
            longitude={project.longitude}
            location={project.location}
          />
        </TabsContent>

        <TabsContent value="dashboard" className="space-y-6">
          {summary && <ProjectSummaryBlock summary={summary} />}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* Panel 1: Health Ring */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Project Progress</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center">
                <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[{ name: "Actual", value: health.actualPercent }, { name: "Remaining", value: 100 - health.actualPercent }]}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        startAngle={90}
                        endAngle={-270}
                        dataKey="value"
                      >
                        <Cell fill={chartStatusColors[health.status] || "#10b981"} />
                        <Cell fill="#e2e8f0" />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="text-center mt-[-100px] mb-[60px]">
                  <div className="text-3xl font-bold">{health.actualPercent}%</div>
                  <div className="text-xs text-muted-foreground">Planned: {health.plannedPercent}%</div>
                </div>
              </CardContent>
            </Card>

            {/* Panel 2: Cost Health */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Cost Health</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">Budget to Date</span>
                      <span className="font-medium">₹{(cost.budgetToDate / 100000).toFixed(2)}L</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500" style={{ width: '100%' }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">Cost to Date</span>
                      <span className="font-medium">₹{(cost.costToDate / 100000).toFixed(2)}L</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${cost.cpi < 1 ? 'bg-rose-500' : 'bg-emerald-500'}`} 
                           style={{ width: `${Math.min((cost.costToDate / cost.budgetToDate) * 100, 100)}%` }}></div>
                    </div>
                  </div>
                  
                  <div className="pt-4 flex justify-between items-center border-t">
                    <div className="text-sm">Cost Performance Index</div>
                    <div className={`text-xl font-bold ${cost.cpi < 1 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {cost.cpi.toFixed(2)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Panel 3: Activity Status */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Activity Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={activityData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} fontSize={12} />
                      <Tooltip />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {activityData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Panel 4: Pending Actions */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Pending Actions</CardTitle>
              </CardHeader>
              <CardContent>
                {pendingActions.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-4">No pending actions.</div>
                ) : (
                  <div className="space-y-4">
                    {pendingActions.map((action: any) => (
                      <div key={action.id} className="flex items-center justify-between p-3 border rounded-lg bg-card hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <AlertCircle className={`h-5 w-5 ${action.severity === 'high' || action.severity === 'critical' ? 'text-rose-500' : 'text-amber-500'}`} />
                          <div>
                            <div className="font-medium text-sm">{action.title}</div>
                            <div className="text-xs text-muted-foreground capitalize">{action.kind.replace('_', ' ')}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-xs font-medium ${action.ageDays > 3 ? 'text-rose-500' : 'text-muted-foreground'}`}>
                            {action.ageDays} days old
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Panel 5: Mini Gantt */}
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Schedule — Top Activities (Mini Gantt)</CardTitle>
              </CardHeader>
              <CardContent>
                {!ganttBounds || miniGantt.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-8">No scheduled activities yet.</div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] uppercase text-muted-foreground tracking-wide">
                      <span>{new Date(ganttBounds.min).toLocaleDateString("en-IN", { month: "short", year: "2-digit" })}</span>
                      <span>{new Date(ganttBounds.max).toLocaleDateString("en-IN", { month: "short", year: "2-digit" })}</span>
                    </div>
                    {miniGantt.map((a) => {
                      const ps = a.plannedStart ? new Date(a.plannedStart).getTime() : null;
                      const pe = a.plannedEnd ? new Date(a.plannedEnd).getTime() : null;
                      const as = a.actualStart ? new Date(a.actualStart).getTime() : null;
                      const ae = a.actualEnd ? new Date(a.actualEnd).getTime() : null;
                      const pos = (t: number) => ((t - ganttBounds.min) / ganttBounds.span) * 100;
                      return (
                        <div key={a.activityId} className="grid grid-cols-12 gap-2 items-center text-xs">
                          <div className="col-span-4 truncate">
                            <span className="font-mono text-muted-foreground mr-2">{a.code}</span>{a.name}
                          </div>
                          <div className="col-span-8 relative h-6 bg-slate-100 rounded">
                            {ps !== null && pe !== null && (
                              <div className="absolute top-0.5 h-2 bg-slate-300 rounded" style={{ left: `${pos(ps)}%`, width: `${Math.max(1, pos(pe) - pos(ps))}%` }} title="Planned" />
                            )}
                            {as !== null && (
                              <div
                                className={`absolute bottom-0.5 h-2 rounded ${a.status === "delayed" ? "bg-rose-500" : a.status === "at_risk" ? "bg-amber-500" : a.status === "completed" ? "bg-blue-500" : "bg-emerald-500"}`}
                                style={{ left: `${pos(as)}%`, width: `${Math.max(1, pos(ae ?? Date.now()) - pos(as))}%` }}
                                title="Actual"
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex gap-4 pt-2 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 bg-slate-300 rounded" /> Planned</span>
                      <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 bg-emerald-500 rounded" /> Actual on-track</span>
                      <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 bg-amber-500 rounded" /> At risk</span>
                      <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 bg-rose-500 rounded" /> Delayed</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Panel 6: Photo Timeline Wall */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2"><Camera className="h-4 w-4" /> Recent Site Photos</CardTitle>
              </CardHeader>
              <CardContent>
                {recentPhotos.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-8">No photos uploaded yet.</div>
                ) : (
                  <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                    {recentPhotos.map((p: any) => (
                      <div key={p.id} className="aspect-square rounded overflow-hidden bg-muted relative group">
                        <img src={p.url} alt={p.caption ?? ""} className="w-full h-full object-cover group-hover:scale-105 transition" loading="lazy" />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent text-white text-[10px] px-1.5 py-1 opacity-0 group-hover:opacity-100 transition">
                          {p.caption || "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Panel 7: Next Milestone */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Next Milestone</CardTitle>
              </CardHeader>
              <CardContent>
                {nextMilestone ? (
                  <div className="text-center py-6">
                    <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-full mb-4">
                      <Calendar className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-semibold text-lg">{nextMilestone.name}</h3>
                    <p className="text-muted-foreground text-sm mt-1 mb-4">Target: {new Date(nextMilestone.targetDate).toLocaleDateString()}</p>
                    <Badge variant="outline" className={statusColors[nextMilestone.status]}>
                      {nextMilestone.status.replace('_', ' ')}
                    </Badge>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground text-center py-8">No upcoming milestones.</div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="wbs"><WbsTab projectId={id} /></TabsContent>
        <TabsContent value="milestones"><MilestonesTab projectId={id} /></TabsContent>
        <TabsContent value="estimation"><EstimationPage projectId={id} /></TabsContent>
        <TabsContent value="variation-orders"><VariationOrdersPage projectId={id} /></TabsContent>
        <TabsContent value="boq-actual"><BoqVsActualPage projectId={id} /></TabsContent>
        <TabsContent value="dprs"><DprsTab projectId={id} /></TabsContent>
        <TabsContent value="photos"><PhotosTab projectId={id} /></TabsContent>
        <TabsContent value="documents"><DocumentsTab projectId={id} /></TabsContent>
        <TabsContent value="issues"><IssuesTab projectId={id} /></TabsContent>
        <TabsContent value="financial"><FinancialPage projectId={id} /></TabsContent>
        <TabsContent value="supply-chain"><SupplyChainPage projectId={id} /></TabsContent>
        <TabsContent value="workforce"><WorkforcePage projectId={id} /></TabsContent>
        <TabsContent value="settings"><SettingsTab projectId={id} /></TabsContent>
      </Tabs>
  );
}

// ── Project Summary block (Overview tab top) ────────────────────────────────
// Renders the high-signal cockpit numbers (progress, cost, utilization,
// remaining) above the rest of the dashboard. Source data comes from the
// `summary` field on `/projects/:id/dashboard`.
type ProjectSummary = {
  percentComplete: number;
  plannedPercent: number;
  variancePercent: number;
  workCompleted: number;
  workPending: number;
  workTotal: number;
  estimatedCost: number;
  amountUtilized: number;
  remainingBalance: number;
  utilizationPercent: number;
  utilizationBreakdown: {
    contractor: number;
    labour: number;
    materials: number;
    advances: number;
  };
  insights: Array<{ tone: "positive" | "warning" | "danger"; text: string }>;
};

function formatInr(value: number): string {
  if (!Number.isFinite(value)) return "₹0";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(2)} L`;
  if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1)} K`;
  return `${sign}₹${abs.toFixed(0)}`;
}

function ProjectSummaryBlock({ summary }: { summary: ProjectSummary }) {
  const pct = Math.max(0, Math.min(100, summary.percentComplete));
  const utilPct = Math.max(0, Math.min(100, summary.utilizationPercent));
  const overBudget = summary.utilizationPercent > 100;

  const breakdown = [
    { name: "Contractor bills", value: summary.utilizationBreakdown.contractor, fill: "#6366f1" },
    { name: "Labour", value: summary.utilizationBreakdown.labour, fill: "#10b981" },
    { name: "Materials (GRN)", value: summary.utilizationBreakdown.materials, fill: "#f59e0b" },
    { name: "PO advances", value: summary.utilizationBreakdown.advances, fill: "#8b5cf6" },
  ].filter((s) => s.value > 0);

  const toneClass = (tone: "positive" | "warning" | "danger") =>
    tone === "positive"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900"
      : tone === "warning"
        ? "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900"
        : "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900";

  const ToneIcon = ({ tone }: { tone: "positive" | "warning" | "danger" }) =>
    tone === "positive" ? <CheckCircle2 className="h-3.5 w-3.5" /> :
    tone === "warning" ? <AlertTriangle className="h-3.5 w-3.5" /> :
    <XCircle className="h-3.5 w-3.5" />;

  return (
    <section className="space-y-4" data-testid="project-summary">
      {/* KPI cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Target className="h-5 w-5" />}
          tint="sky"
          label="% Complete"
          value={`${pct.toFixed(1)}%`}
          sub={`Planned ${summary.plannedPercent.toFixed(1)}% • ${summary.variancePercent >= 0 ? "+" : ""}${summary.variancePercent.toFixed(1)}% var`}
        />
        <KpiCard
          icon={<Wallet className="h-5 w-5" />}
          tint="violet"
          label="Estimated Cost"
          value={formatInr(summary.estimatedCost)}
          sub={summary.estimatedCost > 0 ? "Contract value" : "Not set"}
        />
        <KpiCard
          icon={<Coins className="h-5 w-5" />}
          tint={overBudget ? "rose" : "amber"}
          label="Amount Utilized"
          value={formatInr(summary.amountUtilized)}
          sub={
            summary.estimatedCost > 0
              ? `${utilPct.toFixed(1)}% of estimate`
              : summary.amountUtilized > 0
                ? "No estimate set"
                : "—"
          }
        />
        <KpiCard
          icon={summary.remainingBalance < 0 ? <TrendingDown className="h-5 w-5" /> : <PiggyBank className="h-5 w-5" />}
          tint={summary.remainingBalance < 0 ? "rose" : "emerald"}
          label="Remaining Balance"
          value={formatInr(summary.remainingBalance)}
          sub={summary.remainingBalance < 0 ? "Over budget" : "Available headroom"}
        />
      </div>

      {/* Progress + cost split */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Work Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-muted-foreground">Actual completion</span>
                <span className="font-semibold">{pct.toFixed(1)}%</span>
              </div>
              <div className="relative h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-slate-300 dark:bg-slate-700"
                  style={{ width: `${Math.max(0, Math.min(100, summary.plannedPercent))}%` }}
                  title={`Planned ${summary.plannedPercent.toFixed(1)}%`}
                />
                <div
                  className={`absolute inset-y-0 left-0 rounded-full ${summary.variancePercent < -5 ? "bg-rose-500" : summary.variancePercent < 0 ? "bg-amber-500" : "bg-emerald-500"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-muted-foreground mt-1.5">
                <span>Planned {summary.plannedPercent.toFixed(1)}%</span>
                <span>{summary.variancePercent >= 0 ? "Ahead" : "Behind"} by {Math.abs(summary.variancePercent).toFixed(1)}%</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-muted-foreground">Budget utilization</span>
                <span className={`font-semibold ${overBudget ? "text-rose-600" : ""}`}>{utilPct.toFixed(1)}%</span>
              </div>
              <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${overBudget ? "bg-rose-500" : utilPct > 85 ? "bg-amber-500" : "bg-emerald-500"}`}
                  style={{ width: `${utilPct}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-muted-foreground mt-1.5">
                <span>Spent {formatInr(summary.amountUtilized)}</span>
                <span>of {formatInr(summary.estimatedCost)}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2 border-t">
              <MiniStat label="Activities done" value={summary.workCompleted.toString()} accent="emerald" />
              <MiniStat label="In progress / pending" value={summary.workPending.toString()} accent="amber" />
              <MiniStat label="Total activities" value={summary.workTotal.toString()} accent="slate" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Where the Money Went</CardTitle>
          </CardHeader>
          <CardContent>
            {breakdown.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground text-center">
                No spend recorded against this project yet.
              </div>
            ) : (
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={breakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {breakdown.map((s, i) => <Cell key={i} fill={s.fill} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatInr(v)} />
                    <Legend
                      verticalAlign="bottom"
                      iconType="circle"
                      wrapperStyle={{ fontSize: 11 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Insights chips */}
      {summary.insights.length > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="summary-insights">
          {summary.insights.map((ins, i) => (
            <span
              key={i}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${toneClass(ins.tone)}`}
            >
              <ToneIcon tone={ins.tone} />
              {ins.text}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function KpiCard({
  icon, label, value, sub, tint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tint: "sky" | "violet" | "amber" | "rose" | "emerald";
}) {
  const tints: Record<string, string> = {
    sky: "bg-sky-50 text-sky-600 dark:bg-sky-950/40",
    violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/40",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40",
    rose: "bg-rose-50 text-rose-600 dark:bg-rose-950/40",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40",
  };
  return (
    <Card>
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${tints[tint]}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">{label}</div>
          <div className="text-xl font-bold tracking-tight mt-0.5 truncate">{value}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent: "emerald" | "amber" | "slate" }) {
  const colors: Record<string, string> = {
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    slate: "text-slate-700 dark:text-slate-300",
  };
  return (
    <div className="text-center">
      <div className={`text-2xl font-bold ${colors[accent]}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}
