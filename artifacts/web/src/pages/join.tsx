import { useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HardHat, Loader2, ArrowRight, AlertTriangle, Building2, UserCheck, LogIn } from "lucide-react";
import { useGetInvitationByToken, useAcceptInvitation } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { useGetMyProfile } from "@workspace/api-client-react";

function roleLabel(role: string) {
  const map: Record<string, string> = {
    owner: "Owner", pm: "Project Manager", site_engineer: "Site Engineer",
    qs: "QS Engineer", finance: "Finance", contractor: "Contractor",
    qc: "QC Engineer", store: "Store Manager", hr: "HR", admin: "Admin",
  };
  return map[role] ?? role;
}

type AcceptTab = "create" | "signin";

export default function JoinPage() {
  const [, params] = useRoute("/join/:token");
  const token = params?.token ?? "";
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { isAuthenticated } = useAuth();
  const { data: myProfile } = useGetMyProfile({ query: { enabled: isAuthenticated } as any });

  const [tab, setTab] = useState<AcceptTab>("create");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: inv, isLoading, error } = useGetInvitationByToken(token, {
    query: { enabled: !!token, retry: false } as any,
  });

  const acceptMutation = useAcceptInvitation();

  async function doAccept(overrides?: { password?: string; firstName?: string; lastName?: string }) {
    if (busy) return;
    setBusy(true);
    try {
      await acceptMutation.mutateAsync({
        token,
        data: overrides ?? {},
      });
      toast({ title: "Welcome aboard!", description: `You've joined ${inv?.organisation?.name}.` });
      setLocation("/");
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? "Could not accept the invitation";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    doAccept({ firstName: firstName.trim() || undefined, lastName: lastName.trim() || undefined, password });
  }

  function handleSignInSubmit(e: React.FormEvent) {
    e.preventDefault();
    doAccept({ password });
  }

  const apiError = (error as any)?.response?.data?.error ?? (error as any)?.message;
  const isGone = (error as any)?.response?.status === 410 || (error as any)?.response?.status === 404;

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <HardHat className="h-7 w-7 text-amber-500" />
          <span className="font-bold text-xl">KattidaCore</span>
        </div>

        {isLoading ? (
          <div className="bg-card border rounded-xl p-10 flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Validating invitation…</p>
          </div>
        ) : error || !inv ? (
          <div className="bg-card border rounded-xl p-8 text-center space-y-4">
            <div className="h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              <AlertTriangle className="h-7 w-7 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold">Invitation not valid</h2>
            <p className="text-muted-foreground text-sm">
              {isGone
                ? apiError ?? "This invitation has expired, been revoked, or already accepted."
                : apiError ?? "The invitation link is not valid."}
            </p>
            <Button variant="outline" onClick={() => setLocation("/login")}>
              Go to sign in
            </Button>
          </div>
        ) : (
          <div className="bg-card border rounded-xl p-8 space-y-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-primary mb-4">
                <UserCheck className="h-5 w-5" />
                <span className="font-semibold">You've been invited!</span>
              </div>
              <div className="bg-muted/50 rounded-lg p-4 space-y-1">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{inv.organisation?.name}</span>
                </div>
                <p className="text-sm text-muted-foreground pl-6">
                  Role: <span className="font-medium text-foreground">{roleLabel(inv.role)}</span>
                </p>
                <p className="text-sm text-muted-foreground pl-6">
                  For: <span className="font-medium text-foreground">{inv.email}</span>
                </p>
              </div>
            </div>

            {/* PATH A: Already logged in */}
            {isAuthenticated && myProfile ? (
              myProfile.email === inv.email ? (
                <div className="space-y-4">
                  <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-center gap-3">
                    <UserCheck className="h-5 w-5 text-primary shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Signed in as {myProfile.email}</p>
                      <p className="text-xs text-muted-foreground">Click below to accept with your current account.</p>
                    </div>
                  </div>
                  <Button className="w-full" disabled={busy} onClick={() => doAccept()}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                    Accept invitation & join team
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3">
                    <p className="text-sm font-medium text-destructive">Wrong account</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      You're signed in as <strong>{myProfile.email}</strong>, but this invitation is for{" "}
                      <strong>{inv.email}</strong>. Please sign out and use the invite link again.
                    </p>
                  </div>
                  <Link href="/login">
                    <Button variant="outline" className="w-full">
                      <LogIn className="h-4 w-4 mr-2" />
                      Sign out & switch account
                    </Button>
                  </Link>
                </div>
              )
            ) : (
              /* PATH B & C: Not logged in — show Create / Sign In tabs */
              <div className="space-y-4">
                <div className="flex rounded-lg border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setTab("create")}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${
                      tab === "create"
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    Create account
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("signin")}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${
                      tab === "signin"
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    Sign in to accept
                  </button>
                </div>

                {tab === "create" ? (
                  <form onSubmit={handleCreateSubmit} className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Create a new account using <strong>{inv.email}</strong>.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="firstName">First name</Label>
                        <Input
                          id="firstName"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="Arjun"
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
                      <Label htmlFor="passwordCreate">Password *</Label>
                      <Input
                        id="passwordCreate"
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
                      Create account & join
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={handleSignInSubmit} className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Already have an account with <strong>{inv.email}</strong>? Enter your password to accept.
                    </p>
                    <div>
                      <Label htmlFor="passwordSignIn">Password *</Label>
                      <Input
                        id="passwordSignIn"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Your existing password"
                        required
                        disabled={busy}
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={busy}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <LogIn className="h-4 w-4 mr-2" />}
                      Sign in & accept
                    </Button>
                  </form>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
