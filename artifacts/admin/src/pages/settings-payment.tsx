import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Eye, EyeOff, Save, RefreshCw, CheckCircle2, AlertTriangle, Info } from "lucide-react";

interface GatewaySettings {
  razorpay_enabled: string;
  razorpay_key_id: string;
  razorpay_key_secret_set: boolean;
  razorpay_mode: string;
}

async function fetchSettings(): Promise<GatewaySettings> {
  const r = await fetch("/api/admin/platform-settings/payment-gateway");
  if (!r.ok) throw new Error("Failed to load settings");
  return r.json();
}

async function saveSettings(payload: {
  razorpay_enabled: boolean;
  razorpay_key_id: string;
  razorpay_key_secret?: string;
  razorpay_mode: string;
}) {
  const r = await fetch("/api/admin/platform-settings/payment-gateway", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as any).error ?? "Failed to save settings");
  }
  return r.json();
}

export default function SettingsPayment() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [keyId, setKeyId] = useState("");
  const [keySecret, setKeySecret] = useState("");
  const [mode, setMode] = useState<"test" | "live">("test");
  const [secretAlreadySet, setSecretAlreadySet] = useState(false);

  useEffect(() => {
    fetchSettings()
      .then((s) => {
        setEnabled(s.razorpay_enabled === "true");
        setKeyId(s.razorpay_key_id ?? "");
        setMode((s.razorpay_mode as "test" | "live") ?? "test");
        setSecretAlreadySet(s.razorpay_key_secret_set);
      })
      .catch((e) => toast({ title: "Error", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (!keyId.trim()) {
      toast({ title: "Validation error", description: "Key ID is required", variant: "destructive" });
      return;
    }
    if (!secretAlreadySet && !keySecret.trim()) {
      toast({ title: "Validation error", description: "Key Secret is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload: Parameters<typeof saveSettings>[0] = {
        razorpay_enabled: enabled,
        razorpay_key_id: keyId.trim(),
        razorpay_mode: mode,
      };
      if (keySecret.trim()) payload.razorpay_key_secret = keySecret.trim();
      await saveSettings(payload);
      setSecretAlreadySet(true);
      setKeySecret("");
      toast({ title: "Saved", description: "Payment gateway settings updated." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const isConfigured = keyId && secretAlreadySet;
  const isLiveKey = keyId.startsWith("rzp_live_");

  return (
    <Layout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Payment Gateway</h1>
          <p className="text-gray-500 mt-1">Configure Razorpay to collect subscription payments from tenants.</p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                  <CreditCard className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <CardTitle className="text-base">Razorpay</CardTitle>
                  <CardDescription>Indian payment gateway — accepts UPI, cards, net banking & wallets.</CardDescription>
                </div>
              </div>
              <Badge variant={isConfigured ? (enabled ? "default" : "secondary") : "outline"}>
                {isConfigured ? (enabled ? "Active" : "Disabled") : "Not configured"}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            {isConfigured && (
              <div className={`flex items-start gap-2 rounded-md px-3 py-2.5 text-sm ${enabled ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"}`}>
                {enabled ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />}
                <span>
                  {enabled
                    ? `Gateway is active in ${isLiveKey ? "live" : "test"} mode. Tenants can pay for subscription upgrades.`
                    : "Gateway is configured but disabled. Tenants cannot make payments."}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">Enable payment gateway</p>
                <p className="text-xs text-gray-500 mt-0.5">Allow tenants to upgrade their plan by paying online.</p>
              </div>
              <Switch
                checked={enabled}
                onCheckedChange={setEnabled}
                disabled={loading || !isConfigured}
              />
            </div>

            <Separator />

            <div className="space-y-1">
              <Label htmlFor="mode" className="text-sm font-medium">Mode</Label>
              <div className="flex gap-2 mt-1">
                {(["test", "live"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                      mode === m
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    {m === "test" ? "Test" : "Live"}
                  </button>
                ))}
              </div>
              {mode === "live" && (
                <div className="flex items-center gap-1.5 text-xs text-amber-700 mt-1">
                  <Info className="h-3.5 w-3.5" />
                  Live mode will charge real money. Make sure you've completed KYC on Razorpay.
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="keyId">Key ID</Label>
              <Input
                id="keyId"
                placeholder="rzp_test_xxxxxxxxxxxxxxxx"
                value={keyId}
                onChange={(e) => setKeyId(e.target.value)}
                disabled={loading}
                className="font-mono text-sm"
              />
              <p className="text-xs text-gray-500">Find this in your Razorpay Dashboard → Settings → API Keys.</p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="keySecret">
                Key Secret
                {secretAlreadySet && (
                  <span className="ml-2 text-xs text-gray-400 font-normal">(already saved — leave blank to keep current)</span>
                )}
              </Label>
              <div className="relative">
                <Input
                  id="keySecret"
                  type={showSecret ? "text" : "password"}
                  placeholder={secretAlreadySet ? "••••••••••••••••••••••••" : "Enter your Razorpay Key Secret"}
                  value={keySecret}
                  onChange={(e) => setKeySecret(e.target.value)}
                  disabled={loading}
                  className="font-mono text-sm pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-500">Stored securely in the database, never exposed to tenants.</p>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={handleSave} disabled={saving || loading} className="gap-2">
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save changes
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">How it works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-600">
            <p>1. Configure your Razorpay API keys above and enable the gateway.</p>
            <p>2. Tenants will see a <strong>Pay Now</strong> button when upgrading their subscription plan.</p>
            <p>3. Payment is collected and the subscription is upgraded automatically upon verification.</p>
            <p>4. All transactions are logged and visible in your Razorpay Dashboard.</p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
