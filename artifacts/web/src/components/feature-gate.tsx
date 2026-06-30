import { useState } from "react";
import { Lock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UpgradePromptModal } from "@/components/upgrade-prompt-modal";

interface FeatureGateProps {
  hasAccess: boolean;
  featureName?: string;
  planRequired?: string;
  children: React.ReactNode;
}

/**
 * Wraps children with a lock overlay when the tenant's plan doesn't include the feature.
 * Clicking the locked area opens the UpgradePromptModal.
 *
 * Usage:
 *   <FeatureGate hasAccess={plan?.features?.advancedEstimations === true} featureName="Advanced Estimations" planRequired="Professional">
 *     <Button>Open Estimations</Button>
 *   </FeatureGate>
 */
export function FeatureGate({ hasAccess, featureName, planRequired = "Professional", children }: FeatureGateProps) {
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  if (hasAccess) return <>{children}</>;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="relative inline-block cursor-pointer select-none"
            onClick={() => setUpgradeOpen(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && setUpgradeOpen(true)}
            aria-label={`${featureName ?? "This feature"} requires ${planRequired} plan`}
          >
            <div className="pointer-events-none opacity-40 blur-[1px]">{children}</div>
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 rounded">
              <div className="flex items-center gap-1.5 bg-background border rounded-full px-2 py-1 shadow-sm text-xs font-medium text-muted-foreground">
                <Lock className="h-3 w-3" />
                {planRequired}
              </div>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Available on {planRequired} — click to upgrade</p>
        </TooltipContent>
      </Tooltip>
      <UpgradePromptModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        featureName={featureName}
        planRequired={planRequired}
      />
    </>
  );
}
