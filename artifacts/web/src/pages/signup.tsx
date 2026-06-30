import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HardHat, Loader2, Building2, ArrowRight, CheckCircle2 } from "lucide-react";

const BENEFITS = [
  "Full project lifecycle management",
  "DPR, milestones, WBS and BOQ",
  "Contractor bills, ledger & invoicing",
  "Supply chain, workforce & safety",
  "Free plan — no credit card required",
];

export default function Signup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/auth/register-tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          orgName: orgName.trim(),
          email: email.trim().toLowerCase(),
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Registration failed", description: data.error ?? "Please try again", variant: "destructive" });
        return;
      }
      setLocation("/onboarding");
    } catch {
      toast({ title: "Network error", description: "Could not connect to the server", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-900 to-slate-800 flex-col justify-between p-12 text-white">
        <div className="flex items-center gap-3">
          <HardHat className="h-8 w-8 text-amber-400" />
          <span className="text-2xl font-bold">KattidaCore</span>
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight mb-4">
            Civil construction management,<br />
            <span className="text-amber-400">done right.</span>
          </h1>
          <ul className="space-y-3 mt-8">
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-center gap-2 text-slate-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                {b}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-slate-500 text-sm">© 2026 KattidaCore / Mystics Civil</p>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-2 mb-2 lg:hidden">
            <HardHat className="h-6 w-6 text-amber-500" />
            <span className="font-bold text-lg">KattidaCore</span>
          </div>
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="h-5 w-5 text-primary" />
            <h2 className="text-2xl font-bold">Create your account</h2>
          </div>
          <p className="text-muted-foreground mb-8">
            Start your free trial — no credit card needed.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="orgName">Company / Organisation name *</Label>
              <Input
                id="orgName"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="Mystics Civil Pvt Ltd"
                required
                disabled={busy}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="firstName">First name *</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Arjun"
                  required
                  disabled={busy}
                />
              </div>
              <div>
                <Label htmlFor="lastName">Last name</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Kumar"
                  disabled={busy}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="email">Work email *</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="arjun@mysticscivil.com"
                required
                disabled={busy}
              />
            </div>

            <div>
              <Label htmlFor="password">Password *</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                required
                minLength={8}
                disabled={busy}
              />
            </div>

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowRight className="h-4 w-4 mr-2" />}
              Create account
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline font-medium">
              Sign in
            </Link>
          </p>
          <p className="text-center text-xs text-muted-foreground mt-4">
            Invited to a team?{" "}
            <span className="text-muted-foreground">Use the invite link from your email.</span>
          </p>
        </div>
      </div>
    </div>
  );
}
