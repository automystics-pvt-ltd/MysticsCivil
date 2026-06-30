import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Loader2, UserPlus, MoreHorizontal, Trash2, Shield, Mail, Users, Clock, Zap,
} from "lucide-react";
import {
  useGetMyProfile,
  useListOrgMembers,
  useListOrgInvitations,
  useCreateOrgInvitation,
  useRevokeOrgInvitation,
  useUpdateOrgMemberRole,
  useRemoveOrgMember,
  useListOrgCustomRoles,
  getListOrgMembersQueryKey,
  getListOrgInvitationsQueryKey,
} from "@workspace/api-client-react";

import { useQueryClient } from "@tanstack/react-query";

const USER_ROLES = ["owner","pm","site_engineer","qs","finance","contractor","qc","store","hr","admin"] as const;

function roleLabel(role: string) {
  const map: Record<string, string> = {
    owner: "Owner", pm: "Project Manager", site_engineer: "Site Engineer",
    qs: "QS Engineer", finance: "Finance", contractor: "Contractor",
    qc: "QC Engineer", store: "Store Manager", hr: "HR", admin: "Admin",
  };
  return map[role] ?? role;
}

function initials(first: string | null | undefined, last: string | null | undefined, email: string | null | undefined) {
  const f = first?.[0]?.toUpperCase() ?? "";
  const l = last?.[0]?.toUpperCase() ?? "";
  if (f || l) return `${f}${l}`;
  return email?.[0]?.toUpperCase() ?? "?";
}

function inviteStatusBadge(status: string) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "Pending", variant: "secondary" },
    accepted: { label: "Accepted", variant: "default" },
    revoked: { label: "Revoked", variant: "destructive" },
    expired: { label: "Expired", variant: "outline" },
  };
  const info = map[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={info.variant}>{info.label}</Badge>;
}

export default function SettingsTeam() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: profile } = useGetMyProfile();
  const orgId = profile?.organisationId ?? "";

  const { data: members = [], isLoading: loadingMembers } = useListOrgMembers(orgId, { query: { enabled: !!orgId } as any });
  const { data: invitations = [], isLoading: loadingInvites } = useListOrgInvitations(orgId, { query: { enabled: !!orgId } as any });
  const { data: customRoles = [] } = useListOrgCustomRoles();

  const createInvite = useCreateOrgInvitation();
  const revokeInvite = useRevokeOrgInvitation();
  const updateRole = useUpdateOrgMemberRole();
  const removeMember = useRemoveOrgMember();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("site_engineer");
  const [inviteBusy, setInviteBusy] = useState(false);

  const [removeTarget, setRemoveTarget] = useState<{ userId: string; name: string } | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  // Plan limit check: count active members + pending invitations vs planMaxUsers
  const pendingInvites = (invitations || []).filter((i) => i.status === "pending");
  const planMaxUsers = profile?.planMaxUsers ?? null;
  const currentCount = members.length + pendingInvites.length;
  const atPlanLimit = planMaxUsers !== null && currentCount >= planMaxUsers;

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || inviteBusy) return;
    setInviteBusy(true);
    try {
      await createInvite.mutateAsync({ organisationId: orgId, data: { email: inviteEmail.trim().toLowerCase(), role: inviteRole as any } });
      toast({ title: "Invitation sent", description: `Invite sent to ${inviteEmail}.` });
      setInviteEmail("");
      setInviteRole("site_engineer");
      setInviteOpen(false);
      queryClient.invalidateQueries({ queryKey: getListOrgInvitationsQueryKey(orgId) });
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? "Could not send invite";
      const isPlanLimit = err?.response?.data?.code === "PLAN_LIMIT_REACHED";
      toast({
        title: isPlanLimit ? "Team member limit reached" : "Error",
        description: isPlanLimit
          ? "Your current plan has reached its user limit. Please upgrade to invite more members."
          : msg,
        variant: "destructive",
      });
    } finally {
      setInviteBusy(false);
    }
  }

  async function handleRevoke(invitationId: string, email: string) {
    try {
      await revokeInvite.mutateAsync({ organisationId: orgId, invitationId });
      toast({ title: "Invitation revoked", description: `Invite for ${email} has been revoked.` });
      queryClient.invalidateQueries({ queryKey: getListOrgInvitationsQueryKey(orgId) });
    } catch (err: any) {
      toast({ title: "Error", description: err?.response?.data?.error ?? err?.message, variant: "destructive" });
    }
  }

  async function handleRoleChange(userId: string, newRole: string, customRoleId?: string | null) {
    try {
      const data: any = { role: newRole };
      if (customRoleId !== undefined) data.customRoleId = customRoleId;
      await updateRole.mutateAsync({ organisationId: orgId, userId, data });
      toast({ title: "Role updated" });
      queryClient.invalidateQueries({ queryKey: getListOrgMembersQueryKey(orgId) });
    } catch (err: any) {
      toast({ title: "Error", description: err?.response?.data?.error ?? err?.message, variant: "destructive" });
    }
  }

  async function handleRemoveMember() {
    if (!removeTarget || !orgId || removeBusy) return;
    setRemoveBusy(true);
    try {
      await removeMember.mutateAsync({ organisationId: orgId, userId: removeTarget.userId });
      toast({ title: "Member removed", description: `${removeTarget.name} has been removed from the team.` });
      setRemoveTarget(null);
      queryClient.invalidateQueries({ queryKey: getListOrgMembersQueryKey(orgId) });
    } catch (err: any) {
      toast({ title: "Error", description: err?.response?.data?.error ?? err?.message, variant: "destructive" });
    } finally {
      setRemoveBusy(false);
    }
  }

  const currentUserId = profile?.userId;
  const isAdminRole = profile?.role === "owner" || profile?.role === "admin";

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Team</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your organisation members and invitations.
            {planMaxUsers !== null && (
              <span className="ml-2 text-xs">
                {currentCount} / {planMaxUsers} seats used
              </span>
            )}
          </p>
        </div>
        {isAdminRole && (
          atPlanLimit ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block">
                  <Button disabled>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Invite member
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-xs">
                <div className="flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <span>You've reached the {planMaxUsers}-seat limit on your current plan. Upgrade to invite more members.</span>
                </div>
              </TooltipContent>
            </Tooltip>
          ) : (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Invite member
            </Button>
          )
        )}
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">Members ({loadingMembers ? "…" : members.length})</h2>
        </div>

        {loadingMembers ? (
          <div className="flex items-center gap-2 py-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
        ) : members.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4">No members yet.</p>
        ) : (
          <div className="border rounded-lg divide-y">
            {members.map((m) => {
              const name = [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email || m.userId;
              const isMe = m.userId === currentUserId;
              return (
                <div key={m.userId} className="flex items-center gap-4 p-4">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={m.profileImageUrl ?? undefined} />
                    <AvatarFallback>{initials(m.firstName, m.lastName, m.email)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm truncate">{name}</p>
                      {isMe && <Badge variant="outline" className="text-xs">You</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                    {m.designation && <p className="text-xs text-muted-foreground">{m.designation}</p>}
                    <p className="text-xs text-muted-foreground">
                      Joined {m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : "—"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant="secondary">{roleLabel(m.role)}</Badge>
                    {(m as any).customRoleId && (() => {
                      const cr = customRoles.find((r) => r.id === (m as any).customRoleId);
                      return cr ? <Badge variant="outline" className="text-[10px]">+{cr.name}</Badge> : null;
                    })()}
                  </div>
                  {isAdminRole && !isMe && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-[200px]">
                        <div className="px-2 py-1.5">
                          <p className="text-xs text-muted-foreground mb-1.5 font-medium">Base role</p>
                          {USER_ROLES.map((r) => (
                            <DropdownMenuItem
                              key={r}
                              onSelect={() => handleRoleChange(m.userId, r, null)}
                              className={m.role === r && !(m as any).customRoleId ? "font-medium text-primary" : ""}
                            >
                              <Shield className="h-3.5 w-3.5 mr-2" />
                              {roleLabel(r)}
                            </DropdownMenuItem>
                          ))}
                        </div>
                        {customRoles.length > 0 && (
                          <>
                            <DropdownMenuSeparator />
                            <div className="px-2 py-1.5">
                              <p className="text-xs text-muted-foreground mb-1.5 font-medium">Custom role overlay</p>
                              <DropdownMenuItem
                                onSelect={() => handleRoleChange(m.userId, m.role, null)}
                                className={!(m as any).customRoleId ? "font-medium text-primary" : ""}
                              >
                                <Shield className="h-3.5 w-3.5 mr-2" />
                                None
                              </DropdownMenuItem>
                              {customRoles.map((cr) => (
                                <DropdownMenuItem
                                  key={cr.id}
                                  onSelect={() => handleRoleChange(m.userId, m.role, cr.id)}
                                  className={(m as any).customRoleId === cr.id ? "font-medium text-primary" : ""}
                                >
                                  <Shield className="h-3.5 w-3.5 mr-2" />
                                  {cr.name}
                                </DropdownMenuItem>
                              ))}
                            </div>
                          </>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => setRemoveTarget({ userId: m.userId, name: name ?? "this member" })}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" />
                          Remove from team
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {pendingInvites.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold">Pending invitations ({pendingInvites.length})</h2>
          </div>
          <div className="border rounded-lg divide-y">
            {pendingInvites.map((inv) => (
              <div key={inv.id} className="flex items-center gap-4 p-4">
                <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">{roleLabel(inv.role)} · Expires {new Date(inv.expiresAt).toLocaleDateString()}</p>
                </div>
                {inviteStatusBadge(inv.status)}
                {isAdminRole && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRevoke(inv.id, inv.email)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite team member</DialogTitle>
            <DialogDescription>
              They'll receive a link to join your organisation. Invitation expires in 7 days.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSendInvite} className="space-y-4 pt-2">
            <div>
              <Label htmlFor="iEmail">Email address *</Label>
              <Input
                id="iEmail"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
                required
                disabled={inviteBusy}
              />
            </div>
            <div>
              <Label htmlFor="iRole">Role *</Label>
              <select
                id="iRole"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background mt-1"
                disabled={inviteBusy}
              >
                {USER_ROLES.map((r) => (
                  <option key={r} value={r}>{roleLabel(r)}</option>
                ))}
              </select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)} disabled={inviteBusy}>
                Cancel
              </Button>
              <Button type="submit" disabled={inviteBusy}>
                {inviteBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                Send invitation
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove team member?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <strong>{removeTarget?.name}</strong> from your organisation. They'll lose access to all projects immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveMember}
              disabled={removeBusy}
              className="bg-destructive hover:bg-destructive/90"
            >
              {removeBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Remove member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
