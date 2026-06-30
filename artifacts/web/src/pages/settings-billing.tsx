import { useState } from "react";
import { useGetMyProfile, useGetOrgSubscription, getGetOrgSubscriptionQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { UpgradePromptModal } from "@/components/upgrade-prompt-modal";
import { Zap, CheckCircle2, XCircle, RefreshCw, CreditCard, Users, FolderOpen, HardDrive } from "lucide-react";

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
    query: { enabled: !!orgId } as any,
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

      {featureEntries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Features included in {plan.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {featureEntries.map(([key, val]) => {
                const isEnabled = val === true || val === "true" || val === "enabled";
                const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                return (
                  <div key={key} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="font-medium">{label}</span>
                    {isEnabled ? (
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground/40" />
                    )}
                  </div>
                );
              })}
              {featureEntries.length === 0 && (
                <p className="py-4 text-sm text-muted-foreground text-center">
                  Feature details not available for this plan.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <UpgradePromptModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        planRequired="Professional"
      />
    </div>
  );
}
