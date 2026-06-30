import { useState } from "react";
import { useGetMyProfile, useGetOrgSubscription, getGetOrgSubscriptionQueryKey } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { UpgradePromptModal } from "@/components/upgrade-prompt-modal";
import { Zap, CheckCircle2, XCircle, RefreshCw, CreditCard, Users, FolderOpen, HardDrive, Minus } from "lucide-react";

async function fetchPlans() {
  const r = await fetch(`/api/subscription-plans`);
  if (!r.ok) throw new Error("Failed to fetch plans");
  return r.json() as Promise<Array<{ id: string; name: string; priceMonthly: string | null; features: Record<string, boolean | string> | null }>>;
}

function QuotaBar({ label, used, max, icon }: { label: string; used: number; max: number | null; icon: React.ReactNode }) {
  const pct = max !== null && max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const isUnlimited = max === null;
  const isNearLimit = !isUnlimited && pct >= 80;
  const isAtLimit = !isUnlimited && pct >= 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 font-medium">
          {icon}
          {label}
        </div>
        <span className={`text-xs font-mono ${isAtLimit ? "text-destructive" : isNearLimit ? "text-yellow-600" : "text-muted-foreground"}`}>
          {isUnlimited ? `${used} / Unlimited` : `${used} / ${max}`}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isAtLimit ? "bg-destructive" : isNearLimit ? "bg-yellow-500" : "bg-primary"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    active: { label: "Active", variant: "default" },
    trialing: { label: "Trial", variant: "secondary" },
    cancelled: { label: "Cancelled", variant: "destructive" },
    suspended: { label: "Suspended", variant: "destructive" },
    past_due: { label: "Past Due", variant: "destructive" },
  };
  const info = map[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={info.variant}>{info.label}</Badge>;
}

export default function SettingsBilling() {
  const { data: profile } = useGetMyProfile();
  const orgId = profile?.organisationId ?? "";
  const queryClient = useQueryClient();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const { data, isLoading, refetch } = useGetOrgSubscription(orgId, {
    query: { enabled: !!orgId, refetchInterval: 30000 } as any,
  });

  const { data: allPlans = [] } = useQuery({
    queryKey: ["subscription-plans-catalogue"],
    queryFn: fetchPlans,
    staleTime: 5 * 60 * 1000,
  });

  const plan = data?.plan;
  const sub = data?.subscription;
  const usage = data?.usage;
  const limits = plan?.effectiveLimits as { maxProjects?: number | null; maxUsers?: number | null; maxStorageGb?: number | null } | undefined;
  const features = (plan?.features ?? {}) as Record<string, boolean | string>;

  const featureEntries = Object.entries(features);

  function handleRefresh() {
    refetch();
    queryClient.invalidateQueries({ queryKey: getGetOrgSubscriptionQueryKey(orgId) });
  }

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-3xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!data || !plan || !sub) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Plan & Billing</h1>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No subscription found for this organisation. Contact support.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Plan & Billing</h1>
          <p className="text-sm text-muted-foreground mt-1">Your current plan, usage, and included features.</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                {plan.name}
              </CardTitle>
              <CardDescription>
                {plan.priceMonthly != null && plan.priceMonthly > 0
                  ? `₹${Number(plan.priceMonthly).toLocaleString("en-IN")} / month`
                  : "Free plan"}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={sub.status ?? "active"} />
              {sub.trialEndsAt && (
                <span className="text-xs text-muted-foreground">
                  Trial ends {new Date(sub.trialEndsAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setUpgradeOpen(true)} className="gap-2 w-full sm:w-auto">
            <Zap className="h-4 w-4" />
            Upgrade Plan
          </Button>
          {sub.currentPeriodEnd && (
            <p className="text-xs text-muted-foreground mt-3">
              Current period ends {new Date(sub.currentPeriodEnd).toLocaleDateString()}.
              {sub.daysRemaining != null && <> {sub.daysRemaining} days remaining.</>}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usage</CardTitle>
          <CardDescription>How much of your plan's quota you've used.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <QuotaBar
            label="Projects"
            used={usage?.projectCount ?? 0}
            max={limits?.maxProjects ?? null}
            icon={<FolderOpen className="h-4 w-4 text-muted-foreground" />}
          />
          <Separator />
          <QuotaBar
            label="Team members"
            used={usage?.userCount ?? 0}
            max={limits?.maxUsers ?? null}
            icon={<Users className="h-4 w-4 text-muted-foreground" />}
          />
          <Separator />
          <QuotaBar
            label="Storage"
            used={0}
            max={limits?.maxStorageGb ?? null}
            icon={<HardDrive className="h-4 w-4 text-muted-foreground" />}
          />
        </CardContent>
      </Card>

      {/* Plan comparison matrix */}
      {allPlans.length > 0 && (() => {
        const allFeatureKeys = Array.from(
          new Set(allPlans.flatMap((p) => Object.keys(p.features ?? {})))
        ).sort();
        const currentPlanId = plan?.id;
        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Plan Comparison</CardTitle>
              <CardDescription>See what's included across all plans.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-1/3">Feature</th>
                    {allPlans.map((p) => (
                      <th key={p.id} className={`text-center px-3 py-2.5 font-semibold ${p.id === currentPlanId ? "text-primary" : "text-muted-foreground"}`}>
                        <div>{p.name}</div>
                        {p.id === currentPlanId && (
                          <Badge variant="default" className="text-[10px] mt-0.5">Current</Badge>
                        )}
                        {p.priceMonthly && Number(p.priceMonthly) > 0 ? (
                          <div className="text-xs font-normal text-muted-foreground mt-0.5">
                            ₹{Number(p.priceMonthly).toLocaleString("en-IN")}/mo
                          </div>
                        ) : (
                          <div className="text-xs font-normal text-muted-foreground mt-0.5">Free</div>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allFeatureKeys.map((key) => {
                    const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                    return (
                      <tr key={key} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2.5 font-medium">{label}</td>
                        {allPlans.map((p) => {
                          const val = (p.features ?? {})[key];
                          const isIncluded = val === true || val === "true" || val === "enabled";
                          const isExcluded = val === false || val === "false" || val === "disabled";
                          return (
                            <td key={p.id} className={`text-center px-3 py-2.5 ${p.id === currentPlanId ? "bg-primary/5" : ""}`}>
                              {isIncluded ? (
                                <CheckCircle2 className="h-4 w-4 text-primary mx-auto" />
                              ) : isExcluded ? (
                                <XCircle className="h-4 w-4 text-muted-foreground/30 mx-auto" />
                              ) : val !== undefined ? (
                                <span className="text-xs text-muted-foreground">{String(val)}</span>
                              ) : (
                                <Minus className="h-4 w-4 text-muted-foreground/20 mx-auto" />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        );
      })()}

      <UpgradePromptModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        planRequired="Professional"
      />
    </div>
  );
}
