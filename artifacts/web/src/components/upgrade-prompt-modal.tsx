import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Zap, Check, Mail } from "lucide-react";

interface UpgradePromptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  featureName?: string;
  planRequired?: string;
}

const PLAN_FEATURES: Record<string, string[]> = {
  professional: [
    "Unlimited projects",
    "Up to 50 team members",
    "Advanced estimations & BOQ",
    "Financial analytics & reporting",
    "Priority email support",
    "Custom roles & permissions",
    "API access",
  ],
  enterprise: [
    "Everything in Professional",
    "Unlimited team members",
    "Dedicated account manager",
    "SSO / SAML integration",
    "SLA-backed uptime",
    "Custom integrations",
    "On-premise deployment option",
  ],
};

export function UpgradePromptModal({ open, onOpenChange, featureName, planRequired = "Professional" }: UpgradePromptModalProps) {
  const plan = planRequired.toLowerCase();
  const features = PLAN_FEATURES[plan] ?? PLAN_FEATURES.professional;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Zap className="h-5 w-5" />
            </div>
            <Badge className="capitalize">{planRequired}</Badge>
          </div>
          <DialogTitle>Upgrade to {planRequired}</DialogTitle>
          <DialogDescription>
            {featureName
              ? <><strong>{featureName}</strong> is available on the {planRequired} plan.</>
              : <>This feature is available on the {planRequired} plan.</>}
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2 my-2">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm">
              <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <span>{f}</span>
            </li>
          ))}
        </ul>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Maybe later
          </Button>
          <Button
            className="w-full sm:w-auto gap-2"
            asChild
          >
            <a href="mailto:sales@kattidacore.com?subject=Upgrade%20enquiry" target="_blank" rel="noreferrer">
              <Mail className="h-4 w-4" />
              Contact sales
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
