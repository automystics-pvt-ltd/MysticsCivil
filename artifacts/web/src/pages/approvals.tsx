import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useListApprovals,
  useResolveApproval,
  getListApprovalsQueryKey,
  getGetPortfolioDashboardQueryKey,
  getGetProjectDashboardQueryKey,
  getListProjectDprsQueryKey,
  getListProjectIssuesQueryKey,
  getListVariationOrdersQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardList,
  Check,
  X,
  Clock,
  FileText,
  GitBranch,
  AlertCircle,
  ExternalLink,
  Inbox,
  Building2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type ApprovalRow = {
  id: string;
  title: string;
  projectId: string | null;
  projectName: string | null;
  entityType: string;
  entityId: string | null;
  requestedByName: string | null;
  ageDays: number;
};

type Filter = "all" | "dpr" | "variation_order" | "overdue";

const ENTITY_META: Record<
  string,
  { label: string; icon: typeof FileText; tone: string }
> = {
  dpr: { label: "DPR", icon: FileText, tone: "text-sky-600 bg-sky-50 dark:bg-sky-950/40" },
  variation_order: {
    label: "Variation Order",
    icon: GitBranch,
    tone: "text-violet-600 bg-violet-50 dark:bg-violet-950/40",
  },
  issue: {
    label: "Issue",
    icon: AlertCircle,
    tone: "text-amber-600 bg-amber-50 dark:bg-amber-950/40",
  },
  project: {
    label: "New Project",
    icon: Building2,
    tone: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40",
  },
};

function entityDetailHref(item: ApprovalRow): string | null {
  if (!item.projectId) return null;
  switch (item.entityType) {
    case "dpr":
      return `/projects/${item.projectId}?tab=dprs`;
    case "variation_order":
      return `/projects/${item.projectId}?tab=variation-orders`;
    case "issue":
      return `/projects/${item.projectId}?tab=issues`;
    case "project":
      return `/projects/${item.projectId}`;
    default:
      return `/projects/${item.projectId}`;
  }
}

export default function Approvals() {
  const { data: approvals, isLoading, isError } = useListApprovals();
  const resolveApproval = useResolveApproval();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const rows = (approvals ?? []) as unknown as ApprovalRow[];

  const counts = useMemo(() => {
    const c = { all: 0, dpr: 0, variation_order: 0, overdue: 0 };
    for (const r of rows) {
      c.all += 1;
      if (r.entityType === "dpr") c.dpr += 1;
      if (r.entityType === "variation_order") c.variation_order += 1;
      if ((r.ageDays ?? 0) > 3) c.overdue += 1;
    }
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "overdue") return rows.filter((r) => (r.ageDays ?? 0) > 3);
    return rows.filter((r) => r.entityType === filter);
  }, [rows, filter]);

  // Group by project so users with many projects can scan their inbox quickly.
  const grouped = useMemo(() => {
    const m = new Map<string, { name: string; items: ApprovalRow[] }>();
    for (const r of visible) {
      const key = r.projectId ?? "__none__";
      const name = r.projectName ?? "Unassigned";
      if (!m.has(key)) m.set(key, { name, items: [] });
      m.get(key)!.items.push(r);
    }
    return [...m.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [visible]);

  const handleResolve = (item: ApprovalRow, decision: "approved" | "rejected") => {
    setBusyId(item.id);
    resolveApproval.mutate(
      { approvalId: item.id, data: { decision } },
      {
        onSuccess: () => {
          // Refresh approvals inbox + downstream caches so resolved entities
          // (DPR / VO / issue / dashboards) reflect the new status immediately.
          queryClient.invalidateQueries({ queryKey: getListApprovalsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetPortfolioDashboardQueryKey() });
          if (item.projectId) {
            queryClient.invalidateQueries({
              queryKey: getGetProjectDashboardQueryKey(item.projectId),
            });
            if (item.entityType === "dpr") {
              queryClient.invalidateQueries({
                queryKey: getListProjectDprsQueryKey(item.projectId),
              });
            }
            if (item.entityType === "issue") {
              queryClient.invalidateQueries({
                queryKey: getListProjectIssuesQueryKey(item.projectId),
              });
            }
            if (item.entityType === "variation_order") {
              queryClient.invalidateQueries({
                queryKey: getListVariationOrdersQueryKey(item.projectId),
              });
            }
          }
          toast({
            title: decision === "approved" ? "Approved" : "Rejected",
            description: `${item.title} has been ${decision}.`,
          });
        },
        onError: (err: any) => {
          toast({
            title: "Failed",
            description: err?.message ?? "Could not resolve approval.",
            variant: "destructive",
          });
        },
        onSettled: () => setBusyId(null),
      },
    );
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Approvals</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review and action items requiring your decision. Approving here updates the source record.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Approval filters">
          {(
            [
              { v: "all", l: "All", n: counts.all },
              { v: "dpr", l: "DPRs", n: counts.dpr },
              { v: "variation_order", l: "VOs", n: counts.variation_order },
              { v: "overdue", l: "Overdue", n: counts.overdue },
            ] as Array<{ v: Filter; l: string; n: number }>
          ).map(({ v, l, n }) => {
            const active = filter === v;
            return (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(v)}
                data-testid={`filter-${v}`}
                className={cn(
                  "h-9 px-3 rounded-full text-[13px] font-semibold border transition flex items-center gap-1.5",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-foreground/80 border-border hover:bg-muted",
                )}
              >
                <span>{l}</span>
                <span
                  className={cn(
                    "inline-flex min-w-[20px] h-5 px-1.5 rounded-full text-[11px] items-center justify-center font-bold",
                    active
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : v === "overdue" && n > 0
                        ? "bg-rose-100 text-rose-700"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {n}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      {isLoading ? (
        <Card>
          <CardContent className="p-6 space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      ) : isError ? (
        <Card>
          <CardContent className="p-10 text-center">
            <AlertCircle className="mx-auto h-10 w-10 text-rose-500" />
            <h3 className="mt-3 font-semibold">Couldn't load approvals</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Please try refreshing the page.
            </p>
          </CardContent>
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="mx-auto h-14 w-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
              <Inbox className="h-7 w-7 text-emerald-600" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">All caught up</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {filter === "all"
                ? "You have no pending approvals."
                : "Nothing matches this filter."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(([projectId, group]) => (
            <Card key={projectId}>
              <div className="flex items-center justify-between px-5 py-3 border-b border-border/70">
                <h2 className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
                  {group.name}
                </h2>
                <Badge variant="outline" className="text-xs">
                  {group.items.length} pending
                </Badge>
              </div>
              <ul className="divide-y divide-border/60">
                {group.items.map((item) => {
                  const meta = ENTITY_META[item.entityType] ?? {
                    label: item.entityType,
                    icon: ClipboardList,
                    tone: "text-slate-600 bg-slate-100 dark:bg-slate-800/60",
                  };
                  const Icon = meta.icon;
                  const overdue = (item.ageDays ?? 0) > 3;
                  const href = entityDetailHref(item);
                  const busy = busyId === item.id;
                  return (
                    <li
                      key={item.id}
                      className="px-5 py-4 flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-4 hover:bg-muted/30 transition-colors"
                      data-testid={`approval-${item.id}`}
                    >
                      <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", meta.tone)}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-semibold text-[15px] truncate">
                            {item.title}
                          </h4>
                          <Badge variant="outline" className="text-[11px] capitalize">
                            {meta.label}
                          </Badge>
                          {overdue && (
                            <Badge
                              variant="destructive"
                              className="text-[11px] flex items-center gap-1"
                            >
                              <Clock className="w-3 h-3" /> Overdue
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                          {item.requestedByName && (
                            <span>Requested by <span className="font-medium text-foreground">{item.requestedByName}</span></span>
                          )}
                          <span>{item.ageDays} day{item.ageDays === 1 ? "" : "s"} ago</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {href && (
                          <Button
                            asChild
                            variant="ghost"
                            size="sm"
                            className="text-foreground/70 hover:text-foreground"
                          >
                            <Link href={href} data-testid={`view-${item.id}`}>
                              <ExternalLink className="w-4 h-4 mr-1.5" /> View
                            </Link>
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                          onClick={() => handleResolve(item, "rejected")}
                          disabled={busy}
                          data-testid={`reject-${item.id}`}
                        >
                          <X className="w-4 h-4 mr-1.5" /> Reject
                        </Button>
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => handleResolve(item, "approved")}
                          disabled={busy}
                          data-testid={`approve-${item.id}`}
                        >
                          <Check className="w-4 h-4 mr-1.5" /> Approve
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
