import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  HardHat, Loader2, ArrowRight, ArrowLeft, CheckCircle2, Building2, Layers, Users, X, Image as ImageIcon,
} from "lucide-react";
import {
  useGetMyProfile,
  useUpdateOrganisation,
  useUpdateOrganisationModules,
  useCreateOrgInvitation,
  useCompleteOrgOnboarding,
} from "@workspace/api-client-react";

const USER_ROLES = ["owner","pm","site_engineer","qs","finance","contractor","qc","store","hr","admin"] as const;

const ALL_MODULES = [
  { key: "dashboard", label: "Dashboard" },
  { key: "approvals", label: "Approvals" },
  { key: "projects", label: "Projects" },
  { key: "dprs", label: "Daily Progress (DPR)" },
  { key: "milestones", label: "Milestones" },
  { key: "wbs", label: "WBS Activities" },
  { key: "workforce", label: "Workforce" },
  { key: "supply_chain", label: "Supply Chain" },
  { key: "estimation", label: "Estimation" },
  { key: "boq", label: "BOQ" },
  { key: "financial", label: "Financial" },
  { key: "variation_orders", label: "Variation Orders" },
  { key: "dsr_rates", label: "DSR Rates" },
  { key: "quality", label: "Quality" },
  { key: "safety", label: "Safety" },
  { key: "photos", label: "Site Photos" },
  { key: "documents", label: "Documents" },
];

const DEFAULT_MODULES = new Set(["dashboard", "projects", "dprs", "milestones", "financial", "quality", "safety"]);

const STEPS = [
  { icon: Building2, label: "Your Company" },
  { icon: Layers, label: "Modules" },
  { icon: Users, label: "Invite Team" },
];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((step, i) => {
        const done = i < current;
        const active = i === current;
        const Icon = step.icon;
        return (
          <div key={i} className="flex items-center gap-2">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              active ? "bg-primary text-primary-foreground" :
              done ? "bg-primary/20 text-primary" :
              "bg-muted text-muted-foreground"
            }`}>
              {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              {step.label}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-px w-8 ${done ? "bg-primary" : "bg-muted-foreground/30"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const { data: profile, isLoading: profileLoading } = useGetMyProfile();
  const orgId = profile?.organisationId ?? "";

  const [orgNameVal, setOrgNameVal] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [orgNameInitialized, setOrgNameInitialized] = useState(false);

  const [selectedModules, setSelectedModules] = useState<Set<string>>(DEFAULT_MODULES);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("site_engineer");
  const [pendingInvites, setPendingInvites] = useState<{ email: string; role: string }[]>([]);
  const [inviteSent, setInviteSent] = useState<string[]>([]);

  const updateOrg = useUpdateOrganisation();
  const updateModules = useUpdateOrganisationModules();
  const createInvitation = useCreateOrgInvitation();
  const completeOnboarding = useCompleteOrgOnboarding();

  // Pre-fill org name from profile once loaded
  useEffect(() => {
    if (profile?.organisationName && !orgNameInitialized) {
      setOrgNameVal(profile.organisationName);
      setOrgNameInitialized(true);
    }
  }, [profile?.organisationName, orgNameInitialized]);

  // "Shown once" guard — if already completed, go to dashboard
  useEffect(() => {
    if (!profileLoading && profile?.onboardingCompletedAt) {
      setLocation("/");
    }
  }, [profile?.onboardingCompletedAt, profileLoading, setLocation]);

  async function handleFinish() {
    if (!orgId || busy) return;
    setBusy(true);
    try {
      for (const inv of pendingInvites) {
        try {
          await createInvitation.mutateAsync({ organisationId: orgId, data: { email: inv.email, role: inv.role as any } });
          setInviteSent((p) => [...p, inv.email]);
        } catch (err: any) {
          toast({ title: `Could not invite ${inv.email}`, description: err?.response?.data?.error ?? err?.message, variant: "destructive" });
        }
      }
      await completeOnboarding.mutateAsync({ organisationId: orgId });
      toast({ title: "Setup complete!", description: "Welcome to KattidaCore." });
      setLocation("/");
    } catch (err: any) {
      toast({ title: "Error", description: err?.response?.data?.error ?? err?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function handleSkip() {
    if (!orgId || busy) return;
    setBusy(true);
    try {
      await completeOnboarding.mutateAsync({ organisationId: orgId });
    } catch {
    } finally {
      setBusy(false);
      setLocation("/");
    }
  }

  async function saveStep1() {
    if (!orgId || busy) return;
    setBusy(true);
    try {
      const updates: Record<string, string | undefined> = {};
      if (orgNameVal.trim()) updates.name = orgNameVal.trim();
      if (logoUrl.trim()) updates.logoUrl = logoUrl.trim();
      if (Object.keys(updates).length) {
        await updateOrg.mutateAsync({ organisationId: orgId, data: updates as any });
      }
      setStep(1);
    } catch (err: any) {
      toast({ title: "Error", description: err?.response?.data?.error ?? err?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function saveStep2() {
    if (!orgId || busy) return;
    setBusy(true);
    try {
      const modules = selectedModules.size === ALL_MODULES.length ? null : Array.from(selectedModules);
      await updateModules.mutateAsync({ organisationId: orgId, data: { enabled: modules as any } });
      setStep(2);
    } catch (err: any) {
      toast({ title: "Error", description: err?.response?.data?.error ?? err?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  function addPendingInvite() {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: "Invalid email", variant: "destructive" });
      return;
    }
    if (pendingInvites.some((p) => p.email === email)) {
      toast({ title: "Already added", variant: "destructive" });
      return;
    }
    setPendingInvites((p) => [...p, { email, role: inviteRole }]);
    setInviteEmail("");
  }

  function toggleModule(key: string) {
    setSelectedModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-center gap-2 mb-6">
          <HardHat className="h-7 w-7 text-amber-500" />
          <span className="font-bold text-xl">KattidaCore</span>
        </div>
        <h1 className="text-2xl font-bold text-center mb-1">Set up your workspace</h1>
        <p className="text-muted-foreground text-center mb-6 text-sm">Just a few quick steps — you can change everything later.</p>

        <StepIndicator current={step} />

        <div className="bg-card border rounded-xl p-8">
          {step === 0 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-1">Company details</h2>
                <p className="text-sm text-muted-foreground">Confirm your organisation name and add a logo.</p>
              </div>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="orgNameField">Organisation name *</Label>
                  <Input
                    id="orgNameField"
                    value={orgNameVal}
                    onChange={(e) => setOrgNameVal(e.target.value)}
                    placeholder="Mystics Civil Pvt Ltd"
                    required
                    disabled={busy}
                  />
                </div>
                <div>
                  <Label htmlFor="logoUrl" className="flex items-center gap-1.5">
                    <ImageIcon className="h-3.5 w-3.5" />
                    Logo URL <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="logoUrl"
                    type="url"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://example.com/logo.png"
                    disabled={busy}
                  />
                  {logoUrl && (
                    <div className="mt-2 flex items-center gap-3">
                      <img
                        src={logoUrl}
                        alt="Logo preview"
                        className="h-12 w-12 rounded-lg border object-contain bg-muted"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                      <p className="text-xs text-muted-foreground">Logo preview</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-between pt-2">
                <Button variant="ghost" onClick={handleSkip} disabled={busy}>Skip setup</Button>
                <Button onClick={saveStep1} disabled={busy || !orgNameVal.trim()}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                  Next: Choose modules
                </Button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-1">Choose your modules</h2>
                <p className="text-sm text-muted-foreground">Enable the features you need. You can change this any time.</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ALL_MODULES.map((m) => {
                  const active = selectedModules.has(m.key);
                  return (
                    <button
                      key={m.key}
                      onClick={() => toggleModule(m.key)}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium text-left transition-colors ${
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(0)} disabled={busy}>
                  <ArrowLeft className="h-4 w-4 mr-2" />Back
                </Button>
                <Button onClick={saveStep2} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                  Next: Invite team
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-1">Invite your team</h2>
                <p className="text-sm text-muted-foreground">Add teammates now or skip and invite them later from Settings → Team.</p>
              </div>

              <div className="flex gap-2">
                <Input
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPendingInvite(); } }}
                  disabled={busy}
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="border rounded-md px-2 py-2 text-sm bg-background"
                  disabled={busy}
                >
                  {USER_ROLES.map((r) => (
                    <option key={r} value={r}>{r.replace(/_/g, " ")}</option>
                  ))}
                </select>
                <Button type="button" variant="outline" onClick={addPendingInvite} disabled={busy}>Add</Button>
              </div>

              {pendingInvites.length > 0 && (
                <div className="space-y-2">
                  {pendingInvites.map((inv) => (
                    <div key={inv.email} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">{inv.email}</p>
                        <p className="text-xs text-muted-foreground">{inv.role.replace(/_/g, " ")}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {inviteSent.includes(inv.email) && (
                          <Badge variant="secondary" className="text-emerald-600">Sent</Badge>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => setPendingInvites((p) => p.filter((x) => x.email !== inv.email))}
                          disabled={busy}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(1)} disabled={busy}>
                  <ArrowLeft className="h-4 w-4 mr-2" />Back
                </Button>
                <Button onClick={handleFinish} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  {pendingInvites.length > 0 ? "Send invites & finish" : "Finish setup"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
