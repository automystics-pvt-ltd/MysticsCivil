import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useGetMyProfile, useGetOrgSubscription, getGetOrgSubscriptionQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Zap, Check, CreditCard, RefreshCw, CheckCircle2 } from "lucide-react";

interface Plan {
  id: string;
  slug: string;
  name: string;
  priceMonthly: string | null;
  features: Record<string, boolean | string> | null;
  sortOrder: number;
}

interface UpgradePromptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  featureName?: string;
  planRequired?: string;
}

declare global {
  interface Window {
    Razorpay: any;
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return; }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

async function fetchPlans(): Promise<Plan[]> {
  const r = await fetch("/api/subscription-plans");
  if (!r.ok) throw new Error("Failed to fetch plans");
  return r.json();
}

async function fetchRazorpayConfig(): Promise<{ enabled: boolean; keyId: string | null }> {
  const r = await fetch("/api/payments/razorpay/config");
  if (!r.ok) return { enabled: false, keyId: null };
  return r.json();
}

async function createOrder(planId: string): Promise<{ orderId: string; amount: number; currency: string; keyId: string; planName: string }> {
  const r = await fetch("/api/payments/razorpay/create-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planId }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Failed to create order");
  return data;
}

async function verifyPayment(payload: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string; planId: string }) {
  const r = await fetch("/api/payments/razorpay/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Payment verification failed");
  return data;
}

const FEATURE_HIGHLIGHTS: Record<string, string[]> = {
  professional: [
    "Unlimited projects",
    "Up to 50 team members",
    "Advanced estimations & BOQ",
    "Financial analytics & reporting",
    "Custom roles & permissions",
  ],
  enterprise: [
    "Everything in Professional",
    "Unlimited team members",
    "Dedicated account manager",
    "SSO / SAML integration",
    "SLA-backed uptime",
  ],
};

export function UpgradePromptModal({ open, onOpenChange, featureName, planRequired = "Professional" }: UpgradePromptModalProps) {
  const { toast } = useToast();
  const { data: profile } = useGetMyProfile();
  const orgId = profile?.organisationId ?? "";
  const queryClient = useQueryClient();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [rzpConfig, setRzpConfig] = useState<{ enabled: boolean; keyId: string | null } | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [success, setSuccess] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(true);

  useEffect(() => {
    if (!open) { setSuccess(false); return; }
    setLoadingPlans(true);
    Promise.all([fetchPlans(), fetchRazorpayConfig()])
      .then(([fetchedPlans, cfg]) => {
        const paid = fetchedPlans.filter((p) => Number(p.priceMonthly ?? 0) > 0);
        setPlans(paid);
        setRzpConfig(cfg);
        const target = paid.find((p) => p.name.toLowerCase() === planRequired.toLowerCase()) ?? paid[0] ?? null;
        setSelectedPlanId(target?.id ?? null);
      })
      .catch(() => {})
      .finally(() => setLoadingPlans(false));
  }, [open, planRequired]);

  const handlePay = useCallback(async () => {
    if (!selectedPlanId) return;
    setPaying(true);
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error("Could not load payment gateway. Check your internet connection.");
      const order = await createOrder(selectedPlanId);
      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: order.keyId,
          amount: order.amount,
          currency: order.currency,
          order_id: order.orderId,
          name: "KattidaCore",
          description: `Upgrade to ${order.planName}`,
          theme: { color: "#2563eb" },
          handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
            try {
              await verifyPayment({
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
                planId: selectedPlanId,
              });
              queryClient.invalidateQueries({ queryKey: getGetOrgSubscriptionQueryKey(orgId) });
              setSuccess(true);
              resolve();
            } catch (e: any) {
              reject(e);
            }
          },
          modal: { ondismiss: () => reject(new Error("cancelled")) },
        });
        rzp.open();
      });
    } catch (e: any) {
      if (e.message !== "cancelled") {
        toast({ title: "Payment failed", description: e.message, variant: "destructive" });
      }
    } finally {
      setPaying(false);
    }
  }, [selectedPlanId, orgId, queryClient, toast]);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const features = FEATURE_HIGHLIGHTS[(selectedPlan?.slug ?? selectedPlan?.name ?? "").toLowerCase()] ?? FEATURE_HIGHLIGHTS.professional;

  if (success) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm text-center">
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-green-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Payment successful!</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Your plan has been upgraded to <strong>{selectedPlan?.name}</strong>. Enjoy the new features.
              </p>
            </div>
            <Button onClick={() => onOpenChange(false)} className="w-full">Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

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
          <DialogTitle>Upgrade your plan</DialogTitle>
          <DialogDescription>
            {featureName
              ? <><strong>{featureName}</strong> is available on a higher plan.</>
              : <>Unlock more features by upgrading your subscription.</>}
          </DialogDescription>
        </DialogHeader>

        {loadingPlans ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : plans.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No paid plans are available. Contact your administrator.</p>
        ) : (
          <>
            <div className="space-y-2">
              {plans.map((plan) => {
                const price = Number(plan.priceMonthly ?? 0);
                const isSelected = plan.id === selectedPlanId;
                return (
                  <button
                    key={plan.id}
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={`w-full text-left rounded-lg border px-4 py-3 transition-all ${
                      isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm">{plan.name}</span>
                      <span className="text-sm font-bold">₹{price.toLocaleString("en-IN")}<span className="text-xs font-normal text-muted-foreground">/mo</span></span>
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedPlan && (
              <ul className="space-y-1.5 mt-1">
                {features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-col gap-2 pt-2">
              {rzpConfig?.enabled ? (
                <Button onClick={handlePay} disabled={paying || !selectedPlanId} className="w-full gap-2">
                  {paying ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                  {paying ? "Processing…" : `Pay ₹${Number(selectedPlan?.priceMonthly ?? 0).toLocaleString("en-IN")}/mo`}
                </Button>
              ) : (
                <Button className="w-full gap-2" asChild>
                  <a href="mailto:sales@kattidacore.com?subject=Upgrade%20enquiry" target="_blank" rel="noreferrer">
                    Contact sales to upgrade
                  </a>
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="w-full text-muted-foreground">
                Maybe later
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
