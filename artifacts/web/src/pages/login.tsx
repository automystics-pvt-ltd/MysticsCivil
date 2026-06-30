import { useAuth } from "@workspace/replit-auth-web";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  HardHat,
  Loader2,
  ArrowRight,
  ShieldCheck,
  BarChart3,
  Calculator,
  ClipboardList,
  Truck,
  Users,
  CheckCircle2,
  Sparkles,
} from "lucide-react";

const FEATURES = [
  { icon: Calculator, title: "Estimating & BOQ", text: "DSR rates, abstracts, rate analysis, work orders & variations." },
  { icon: ClipboardList, title: "Daily Progress", text: "DPRs, photos, milestones — site-to-office in real time." },
  { icon: BarChart3, title: "Financial Core", text: "Contractor bills, vouchers, ledgers and client invoicing." },
  { icon: Truck, title: "Supply Chain", text: "Indents, RFQs, POs, GRNs, stock and rate contracts." },
  { icon: Users, title: "Workforce", text: "Attendance, payroll, PPE issue and incident tracking." },
  { icon: ShieldCheck, title: "Quality & Safety", text: "ITPs, inspections, NCRs, HIRA, JSA and permits." },
];

const STATS = [
  { value: "₹500Cr+", label: "Project value managed" },
  { value: "120+", label: "Active sites" },
  { value: "99.9%", label: "Audit-grade ledger" },
];

export default function Login() {
  const { isAuthenticated, isLoading, login, register } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [signinEmail, setSigninEmail] = useState("");
  const [signinPassword, setSigninPassword] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regFirstName, setRegFirstName] = useState("");
  const [regLastName, setRegLastName] = useState("");
  const [regOrgName, setRegOrgName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isAuthenticated && !isLoading) setLocation("/");
  }, [isAuthenticated, isLoading, setLocation]);

  async function handleSignin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await login({ email: signinEmail.trim(), password: signinPassword });
      setLocation("/");
    } catch (err: any) {
      toast({ title: "Sign in failed", description: err?.message ?? "Please try again", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await register({
        email: regEmail.trim(),
        password: regPassword,
        firstName: regFirstName.trim() || undefined,
        lastName: regLastName.trim() || undefined,
        orgName: regOrgName.trim(),
      });
      setLocation("/");
    } catch (err: any) {
      toast({ title: "Registration failed", description: err?.message ?? "Please try again", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-zinc-950 text-zinc-100 relative overflow-hidden">
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] rounded-full bg-primary/30 blur-[160px]" />
        <div className="absolute -bottom-[20%] -right-[10%] w-[55%] h-[55%] rounded-full bg-blue-600/25 blur-[160px]" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />
      </div>

      {/* Top nav */}
      <header className="relative z-10 w-full">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
              <HardHat className="w-5 h-5 text-white" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-bold tracking-tight text-white">Mystics Civil</span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 hidden sm:inline">Core</span>
            </div>
          </div>
          <a
            href="#signin"
            className="text-sm text-zinc-400 hover:text-white transition-colors hidden sm:inline-flex items-center gap-1"
          >
            Sign in <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </header>

      {/* Hero + auth */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 lg:px-10 pt-8 lg:pt-16 pb-16">
        <div className="grid lg:grid-cols-[1.15fr_minmax(360px,440px)] gap-10 lg:gap-16 items-start">
          {/* Left: marketing */}
          <div className="space-y-10">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-zinc-300">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                Built for India's construction operators
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-[1.05]">
                Run every site, ledger and crew
                <span className="block bg-gradient-to-r from-primary via-indigo-400 to-blue-400 bg-clip-text text-transparent">
                  from a single cockpit.
                </span>
              </h1>
              <p className="text-base sm:text-lg text-zinc-400 max-w-xl leading-relaxed">
                Estimating, DPRs, financial core, supply chain, workforce, quality and safety — one operations platform
                purpose-built for civil construction companies.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <a
                  href="#signin"
                  className="inline-flex items-center gap-2 h-11 px-5 rounded-lg bg-primary text-white font-semibold hover:bg-primary/90 transition shadow-lg shadow-primary/25"
                >
                  Get started <ArrowRight className="w-4 h-4" />
                </a>
                <a
                  href="#features"
                  className="inline-flex items-center gap-2 h-11 px-5 rounded-lg border border-white/15 text-zinc-200 hover:bg-white/5 transition"
                >
                  Explore the platform
                </a>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-2 text-xs text-zinc-500">
                <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> RERA-ready</span>
                <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> GSTIN aware</span>
                <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Role-based access</span>
                <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Audit logged</span>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 sm:gap-4">
              {STATS.map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl bg-white/[0.03] border border-white/10 px-4 py-4 backdrop-blur-sm"
                >
                  <div className="text-xl sm:text-2xl font-bold tracking-tight text-white">{s.value}</div>
                  <div className="text-[11px] sm:text-xs text-zinc-500 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Features */}
            <div id="features" className="space-y-4">
              <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">What's inside</div>
              <div className="grid sm:grid-cols-2 gap-3">
                {FEATURES.map((f) => {
                  const Icon = f.icon;
                  return (
                    <div
                      key={f.title}
                      className="group rounded-xl bg-white/[0.03] border border-white/10 p-4 hover:bg-white/[0.05] hover:border-white/20 transition"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
                          <Icon className="w-4.5 h-4.5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-white text-sm">{f.title}</div>
                          <div className="text-xs text-zinc-400 mt-0.5 leading-relaxed">{f.text}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: auth card */}
          <div id="signin" className="lg:sticky lg:top-8">
            <div className="rounded-2xl bg-zinc-900/70 border border-white/10 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden">
              <div className="p-6 sm:p-7 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center">
                    <HardHat className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white tracking-tight">Welcome back</h2>
                    <p className="text-xs text-zinc-400">Sign in to your site cockpit</p>
                  </div>
                </div>
              </div>

              <div className="p-6 sm:p-7">
                <Tabs value={mode} onValueChange={(v) => setMode(v as "signin" | "register")} className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="signin" data-testid="tab-signin">Sign in</TabsTrigger>
                    <TabsTrigger value="register" data-testid="tab-register">Create account</TabsTrigger>
                  </TabsList>

                  <TabsContent value="signin" className="mt-6">
                    <form onSubmit={handleSignin} className="space-y-4 text-left">
                      <div className="space-y-2">
                        <Label htmlFor="si-email">Email</Label>
                        <Input id="si-email" type="email" autoComplete="email" required value={signinEmail} onChange={(e) => setSigninEmail(e.target.value)} data-testid="input-signin-email" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="si-password">Password</Label>
                        <Input id="si-password" type="password" autoComplete="current-password" required value={signinPassword} onChange={(e) => setSigninPassword(e.target.value)} data-testid="input-signin-password" />
                      </div>
                      <Button type="submit" size="lg" className="w-full font-semibold h-11" disabled={busy} data-testid="button-signin">
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Sign in <ArrowRight className="ml-1 h-4 w-4" /></>}
                      </Button>
                    </form>
                  </TabsContent>

                  <TabsContent value="register" className="mt-6">
                    <form onSubmit={handleRegister} className="space-y-4 text-left">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="reg-first">First name</Label>
                          <Input id="reg-first" value={regFirstName} onChange={(e) => setRegFirstName(e.target.value)} data-testid="input-register-firstname" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="reg-last">Last name</Label>
                          <Input id="reg-last" value={regLastName} onChange={(e) => setRegLastName(e.target.value)} data-testid="input-register-lastname" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reg-org">Organisation name</Label>
                        <Input id="reg-org" required value={regOrgName} onChange={(e) => setRegOrgName(e.target.value)} data-testid="input-register-org" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reg-email">Email</Label>
                        <Input id="reg-email" type="email" autoComplete="email" required value={regEmail} onChange={(e) => setRegEmail(e.target.value)} data-testid="input-register-email" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reg-password">Password</Label>
                        <Input id="reg-password" type="password" autoComplete="new-password" required minLength={8} value={regPassword} onChange={(e) => setRegPassword(e.target.value)} data-testid="input-register-password" />
                        <p className="text-xs text-zinc-500">Minimum 8 characters.</p>
                      </div>
                      <Button type="submit" size="lg" className="w-full font-semibold h-11" disabled={busy} data-testid="button-register">
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Create account <ArrowRight className="ml-1 h-4 w-4" /></>}
                      </Button>
                    </form>
                  </TabsContent>
                </Tabs>

                <p className="text-[11px] text-zinc-500 text-center pt-5 leading-relaxed">
                  Authorized personnel only. Access is logged and monitored.
                </p>
              </div>
            </div>

            <div className="mt-4 text-[11px] text-zinc-500 text-center">
              By continuing you agree to your organisation's acceptable-use policy.
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-zinc-500">
          <div>© {new Date().getFullYear()} Mystics Civil. All rights reserved.</div>
          <div className="flex items-center gap-4">
            <span>Construction Operations</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
