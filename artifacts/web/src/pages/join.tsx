import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HardHat, Loader2, ArrowRight, AlertTriangle, Building2, UserCheck } from "lucide-react";
import { useGetInvitationByToken, useAcceptInvitation } from "@workspace/api-client-react";

function roleLabel(role: string) {
  const map: Record<string, string> = {
    owner: "Owner", pm: "Project Manager", site_engineer: "Site Engineer",
    qs: "QS Engineer", finance: "Finance", contractor: "Contractor",
    qc: "QC Engineer", store: "Store Manager", hr: "HR", admin: "Admin",
  };
  return map[role] ?? role;
}

export default function JoinPage() {
  const [, params] = useRoute("/join/:token");
  const token = params?.token ?? "";
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: inv, isLoading, error } = useGetInvitationByToken(token, {
    query: { enabled: !!token, retry: false } as any,
  });

  const acceptMutation = useAcceptInvitation();

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await acceptMutation.mutateAsync({
        token,
        data: {
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
          password: password || undefined,
        },
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

            <form onSubmit={handleAccept} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Create your account to accept this invitation.
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
                <p className="text-xs text-muted-foreground mt-1">
                  If you already have an account with this email, enter your current password.
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                Accept invitation & join team
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
