import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  useGetMyProfile,
  useListProjects,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, ShieldCheck, Trash2, KeyRound, Building2, Shield } from "lucide-react";

type AdminUser = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string | null;
  organisationId: string | null;
  organisationName: string | null;
  customRoleId: string | null;
  customRoleName: string | null;
  createdAt: string | null;
};

type CustomRole = {
  id: string;
  organisationId: string | null;
  name: string;
  description: string | null;
  permissions: string[];
  createdAt: string | null;
  updatedAt: string | null;
};

type CapabilityDef = {
  key: string;
  group: string;
  label: string;
  description: string;
};

type AdminOrg = {
  id: string;
  name: string;
  maxProjects: number | null;
  projectCount: number;
  userCount: number;
  createdAt: string | null;
};

type ProjectLite = { id: string; name: string; organisationId: string | null };

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  owner: "Site Owner",
  pm: "Project Manager",
  site_engineer: "Site Engineer",
  qs: "Quantity Surveyor",
  finance: "Finance",
  contractor: "Contractor",
  qc: "Quality Control",
  store: "Store",
  hr: "HR",
};

const ROLE_BADGE: Record<string, string> = {
  super_admin: "bg-violet-600 text-white",
  admin: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200",
  owner: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  pm: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
};

function api<T = any>(method: string, path: string, body?: any): Promise<T> {
  const url = `/api${path}`;
  return fetch(url, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => {
    if (r.status === 204) return undefined as any;
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || `${r.status} ${r.statusText}`);
    return data;
  });
}

export default function AdminPage() {
  const { data: me, isLoading: meLoading } = useGetMyProfile();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const role = (me as any)?.role as string | undefined;
  const isSuper = role === "super_admin";
  const isAdmin = role === "admin" || isSuper;

  // Redirect non-admins.
  useEffect(() => {
    if (!meLoading && me && !isAdmin) setLocation("/");
  }, [meLoading, me, isAdmin, setLocation]);

  const [tab, setTab] = useState<"users" | "roles" | "orgs">("users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [orgs, setOrgs] = useState<AdminOrg[]>([]);
  const [assignableRoles, setAssignableRoles] = useState<string[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [capabilities, setCapabilities] = useState<CapabilityDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { data: projects } = useListProjects();
  const projectList: ProjectLite[] = useMemo(
    () =>
      ((projects as any[] | undefined) ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        organisationId: p.organisationId ?? null,
      })),
    [projects],
  );

  async function reload() {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const [u, o, r, cr, caps] = await Promise.all([
        api<AdminUser[]>("GET", "/admin/users"),
        api<AdminOrg[]>("GET", "/admin/organisations"),
        api<{ roles: string[] }>("GET", "/admin/assignable-roles"),
        api<CustomRole[]>("GET", "/custom-roles"),
        api<CapabilityDef[]>("GET", "/custom-roles/capabilities"),
      ]);
      setUsers(u);
      setOrgs(o);
      setAssignableRoles(r.roles);
      setCustomRoles(cr);
      setCapabilities(caps);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAdmin) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // ─── Dialogs ──────────────────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [accessUser, setAccessUser] = useState<AdminUser | null>(null);
  const [quotaOrg, setQuotaOrg] = useState<AdminOrg | null>(null);
  const [roleEdit, setRoleEdit] = useState<CustomRole | "new" | null>(null);

  if (meLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-violet-600" /> Admin
          </h1>
          <p className="text-sm text-muted-foreground">
            {isSuper
              ? "Manage all organisations, users, and project access across the platform."
              : "Manage users and project access for your organisation."}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} data-testid="btn-create-user">
          <Plus className="h-4 w-4 mr-1" /> New user
        </Button>
      </header>

      <div className="flex gap-1 border-b">
        <button
          onClick={() => setTab("users")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${
            tab === "users"
              ? "border-violet-600 text-violet-700 dark:text-violet-300"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          data-testid="tab-users"
        >
          Users ({users.length})
        </button>
        <button
          onClick={() => setTab("roles")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${
            tab === "roles"
              ? "border-violet-600 text-violet-700 dark:text-violet-300"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          data-testid="tab-roles"
        >
          Custom roles ({customRoles.length})
        </button>
        {isSuper && (
          <button
            onClick={() => setTab("orgs")}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${
              tab === "orgs"
                ? "border-violet-600 text-violet-700 dark:text-violet-300"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-orgs"
          >
            Organisations ({orgs.length})
          </button>
        )}
      </div>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center text-muted-foreground py-12 justify-center">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : tab === "users" ? (
        <UsersTable
          users={users}
          isSuper={isSuper}
          onEdit={(u) => setEditUser(u)}
          onAccess={(u) => setAccessUser(u)}
          onDelete={async (u) => {
            if (!confirm(`Delete user ${u.email}? This cannot be undone.`)) return;
            try {
              await api("DELETE", `/admin/users/${u.id}`);
              toast({ title: "User deleted" });
              await reload();
            } catch (e: any) {
              toast({ title: "Delete failed", description: e?.message, variant: "destructive" });
            }
          }}
        />
      ) : tab === "roles" ? (
        <CustomRolesTable
          roles={customRoles}
          orgs={orgs}
          isSuper={isSuper}
          onCreate={() => setRoleEdit("new")}
          onEdit={(r) => setRoleEdit(r)}
          onDelete={async (r) => {
            const inUse = users.filter((u) => u.customRoleId === r.id).length;
            const warn = inUse
              ? `Delete custom role "${r.name}"? ${inUse} user${inUse === 1 ? "" : "s"} will lose its extra capabilities.`
              : `Delete custom role "${r.name}"?`;
            if (!confirm(warn)) return;
            try {
              await api("DELETE", `/custom-roles/${r.id}`);
              toast({ title: "Role deleted" });
              await reload();
            } catch (e: any) {
              toast({ title: "Delete failed", description: e?.message, variant: "destructive" });
            }
          }}
        />
      ) : (
        <OrgsTable orgs={orgs} onEditQuota={(o) => setQuotaOrg(o)} />
      )}

      {createOpen && (
        <CreateUserDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          orgs={orgs}
          assignableRoles={assignableRoles}
          defaultOrgId={isSuper ? "" : ((me as any)?.organisationId ?? "")}
          isSuper={isSuper}
          onCreated={async () => {
            setCreateOpen(false);
            toast({ title: "User created" });
            await reload();
          }}
        />
      )}

      {editUser && (
        <EditUserDialog
          user={editUser}
          orgs={orgs}
          assignableRoles={assignableRoles}
          customRoles={customRoles}
          isSuper={isSuper}
          onClose={() => setEditUser(null)}
          onSaved={async () => {
            setEditUser(null);
            toast({ title: "User updated" });
            await reload();
          }}
        />
      )}

      {roleEdit && (
        <CustomRoleDialog
          role={roleEdit === "new" ? null : roleEdit}
          orgs={orgs}
          capabilities={capabilities}
          isSuper={isSuper}
          defaultOrgId={isSuper ? "" : ((me as any)?.organisationId ?? "")}
          onClose={() => setRoleEdit(null)}
          onSaved={async () => {
            setRoleEdit(null);
            toast({ title: "Role saved" });
            await reload();
          }}
        />
      )}

      {accessUser && (
        <ProjectAccessDialog
          user={accessUser}
          projects={projectList.filter(
            (p) => !accessUser.organisationId || p.organisationId === accessUser.organisationId,
          )}
          onClose={() => setAccessUser(null)}
          onSaved={async () => {
            setAccessUser(null);
            toast({ title: "Project access updated" });
          }}
        />
      )}

      {quotaOrg && (
        <QuotaDialog
          org={quotaOrg}
          onClose={() => setQuotaOrg(null)}
          onSaved={async () => {
            setQuotaOrg(null);
            toast({ title: "Quota updated" });
            await reload();
          }}
        />
      )}
    </div>
  );
}

function RoleBadge({ role }: { role: string | null }) {
  if (!role) return <span className="text-muted-foreground text-xs">—</span>;
  const cls = ROLE_BADGE[role] ?? "bg-muted text-foreground";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>
      {ROLE_LABEL[role] ?? role}
    </span>
  );
}

function UsersTable({
  users,
  isSuper,
  onEdit,
  onAccess,
  onDelete,
}: {
  users: AdminUser[];
  isSuper: boolean;
  onEdit: (u: AdminUser) => void;
  onAccess: (u: AdminUser) => void;
  onDelete: (u: AdminUser) => void;
}) {
  if (!users.length) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground text-sm">
          No users yet.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-0 -mx-px">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Name</th>
                <th className="text-left px-4 py-3 font-semibold">Email</th>
                <th className="text-left px-4 py-3 font-semibold">Role</th>
                {isSuper && (
                  <th className="text-left px-4 py-3 font-semibold">Organisation</th>
                )}
                <th className="text-right px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((u) => (
                <tr key={u.id} data-testid={`user-row-${u.id}`}>
                  <td className="px-4 py-3 font-medium">
                    {[u.firstName, u.lastName].filter(Boolean).join(" ") || (
                      <span className="text-muted-foreground italic">unnamed</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{u.email ?? "—"}</td>
                  <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                  {isSuper && (
                    <td className="px-4 py-3 text-muted-foreground">
                      {u.organisationName ?? <span className="italic">none</span>}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onAccess(u)}
                        title="Project access"
                        data-testid={`btn-access-${u.id}`}
                      >
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onEdit(u)}
                        data-testid={`btn-edit-${u.id}`}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => onDelete(u)}
                        data-testid={`btn-delete-${u.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function OrgsTable({ orgs, onEditQuota }: { orgs: AdminOrg[]; onEditQuota: (o: AdminOrg) => void }) {
  if (!orgs.length) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground text-sm">
          No organisations.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-0 -mx-px">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Organisation</th>
                <th className="text-right px-4 py-3 font-semibold">Users</th>
                <th className="text-right px-4 py-3 font-semibold">Projects</th>
                <th className="text-right px-4 py-3 font-semibold">Quota</th>
                <th className="text-right px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {orgs.map((o) => {
                const over =
                  o.maxProjects != null && o.projectCount >= o.maxProjects;
                return (
                  <tr key={o.id} data-testid={`org-row-${o.id}`}>
                    <td className="px-4 py-3 font-medium flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      {o.name}
                    </td>
                    <td className="px-4 py-3 text-right">{o.userCount}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={over ? "text-destructive font-semibold" : ""}>
                        {o.projectCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {o.maxProjects == null ? (
                        <Badge variant="outline" className="text-[10px]">Unlimited</Badge>
                      ) : (
                        <span className={over ? "text-destructive font-semibold" : ""}>
                          {o.maxProjects}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => onEditQuota(o)} data-testid={`btn-quota-${o.id}`}>
                        Set quota
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateUserDialog({
  open,
  onClose,
  orgs,
  assignableRoles,
  defaultOrgId,
  isSuper,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  orgs: AdminOrg[];
  assignableRoles: string[];
  defaultOrgId: string;
  isSuper: boolean;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<string>("pm");
  const [organisationId, setOrganisationId] = useState(defaultOrgId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { toast } = useToast();

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await api("POST", "/admin/users", {
        email,
        password,
        firstName,
        lastName,
        role,
        organisationId: organisationId || null,
      });
      onCreated();
    } catch (e: any) {
      setErr(e?.message ?? "Create failed");
      toast({ title: "Create failed", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New user</DialogTitle>
          <DialogDescription>Create an account and assign role + organisation.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">First name</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} data-testid="input-firstName" />
            </div>
            <div>
              <Label className="text-xs">Last name</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} data-testid="input-lastName" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-email" />
          </div>
          <div>
            <Label className="text-xs">Password (min 8 chars)</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="input-password" />
          </div>
          <div>
            <Label className="text-xs">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger data-testid="select-role"><SelectValue /></SelectTrigger>
              <SelectContent>
                {assignableRoles.map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_LABEL[r] ?? r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Organisation</Label>
            <Select
              value={organisationId}
              onValueChange={setOrganisationId}
              disabled={!isSuper}
            >
              <SelectTrigger data-testid="select-org"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {orgs.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isSuper && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Admins can only create users within their own organisation.
              </p>
            )}
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !email || !password} data-testid="btn-submit-create">
            {busy && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({
  user,
  orgs,
  assignableRoles,
  customRoles,
  isSuper,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  orgs: AdminOrg[];
  assignableRoles: string[];
  customRoles: CustomRole[];
  isSuper: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [firstName, setFirstName] = useState(user.firstName ?? "");
  const [lastName, setLastName] = useState(user.lastName ?? "");
  const [role, setRole] = useState(user.role ?? "pm");
  const [organisationId, setOrganisationId] = useState(user.organisationId ?? "");
  const [customRoleId, setCustomRoleId] = useState<string>(user.customRoleId ?? "__none__");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const customRoleOptions = customRoles.filter(
    (r) => !organisationId || r.organisationId === organisationId,
  );

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = {
        firstName,
        lastName,
        role,
        organisationId,
        customRoleId: customRoleId === "__none__" ? null : customRoleId,
      };
      if (password) body.password = password;
      await api("PATCH", `/admin/users/${user.id}`, body);
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {user.email}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">First name</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Last name</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {assignableRoles.map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_LABEL[r] ?? r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Organisation</Label>
            <Select
              value={organisationId}
              onValueChange={setOrganisationId}
              disabled={!isSuper}
            >
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {orgs.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Custom role (optional)</Label>
            <Select value={customRoleId} onValueChange={setCustomRoleId}>
              <SelectTrigger data-testid="select-custom-role"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— None —</SelectItem>
                {customRoleOptions.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">
              Adds extra capabilities on top of the built-in role.
            </p>
          </div>
          <div>
            <Label className="text-xs">Reset password (optional)</Label>
            <Input type="password" placeholder="Leave blank to keep" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CustomRolesTable({
  roles,
  orgs,
  isSuper,
  onCreate,
  onEdit,
  onDelete,
}: {
  roles: CustomRole[];
  orgs: AdminOrg[];
  isSuper: boolean;
  onCreate: () => void;
  onEdit: (r: CustomRole) => void;
  onDelete: (r: CustomRole) => void;
}) {
  const orgName = (id: string | null) =>
    id ? (orgs.find((o) => o.id === id)?.name ?? "—") : "—";
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={onCreate} data-testid="btn-create-role">
          <Plus className="h-4 w-4 mr-1" /> New role
        </Button>
      </div>
      {roles.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            No custom roles yet. Create one to grant extra capabilities to specific users
            without changing their built-in role.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 -mx-px">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">Name</th>
                    {isSuper && <th className="text-left px-4 py-3 font-semibold">Organisation</th>}
                    <th className="text-left px-4 py-3 font-semibold">Capabilities</th>
                    <th className="text-right px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {roles.map((r) => (
                    <tr key={r.id} data-testid={`role-row-${r.id}`}>
                      <td className="px-4 py-3 font-medium flex items-center gap-2">
                        <Shield className="h-4 w-4 text-violet-600" /> {r.name}
                        {r.description && (
                          <span className="text-muted-foreground font-normal text-xs">
                            — {r.description}
                          </span>
                        )}
                      </td>
                      {isSuper && (
                        <td className="px-4 py-3 text-muted-foreground">
                          {orgName(r.organisationId)}
                        </td>
                      )}
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {r.permissions.length === 0
                          ? <span className="italic">none</span>
                          : `${r.permissions.length} capability${r.permissions.length === 1 ? "" : "ies"}`}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => onEdit(r)} data-testid={`btn-edit-role-${r.id}`}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => onDelete(r)}
                            data-testid={`btn-delete-role-${r.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CustomRoleDialog({
  role,
  orgs,
  capabilities,
  isSuper,
  defaultOrgId,
  onClose,
  onSaved,
}: {
  role: CustomRole | null;
  orgs: AdminOrg[];
  capabilities: CapabilityDef[];
  isSuper: boolean;
  defaultOrgId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!role;
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [organisationId, setOrganisationId] = useState(role?.organisationId ?? defaultOrgId);
  const [perms, setPerms] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const groups = useMemo(() => {
    const m = new Map<string, CapabilityDef[]>();
    for (const c of capabilities) {
      if (!m.has(c.group)) m.set(c.group, []);
      m.get(c.group)!.push(c);
    }
    return Array.from(m.entries());
  }, [capabilities]);

  function toggle(k: string) {
    setPerms((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });
  }

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || null,
        permissions: [...perms],
      };
      if (!isEdit) body.organisationId = organisationId || null;
      if (isEdit) {
        await api("PATCH", `/custom-roles/${role!.id}`, body);
      } else {
        await api("POST", "/custom-roles", body);
      }
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit role — ${role!.name}` : "New custom role"}</DialogTitle>
          <DialogDescription>
            Pick the extra capabilities this role grants. Users keep every capability from
            their built-in role plus the ones ticked here.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 overflow-y-auto pr-1">
          <div>
            <Label className="text-xs">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Junior PM"
              data-testid="input-role-name"
            />
          </div>
          <div>
            <Label className="text-xs">Description (optional)</Label>
            <Input
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short summary shown in admin"
            />
          </div>
          {!isEdit && isSuper && (
            <div>
              <Label className="text-xs">Organisation</Label>
              <Select value={organisationId} onValueChange={setOrganisationId}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {orgs.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs">Capabilities ({perms.size} selected)</Label>
            <div className="space-y-3 mt-1 border rounded-lg p-3 max-h-[40vh] overflow-y-auto">
              {groups.map(([group, items]) => (
                <div key={group} className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group}
                  </p>
                  {items.map((c) => (
                    <label
                      key={c.key}
                      className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-muted/60 cursor-pointer"
                      data-testid={`cap-${c.key}`}
                    >
                      <Checkbox
                        checked={perms.has(c.key)}
                        onCheckedChange={() => toggle(c.key)}
                        className="mt-0.5"
                      />
                      <span className="flex-1">
                        <span className="text-sm font-medium block">{c.label}</span>
                        <span className="text-[11px] text-muted-foreground">{c.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
        </div>
        <DialogFooter className="pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={busy || !name.trim() || (!isEdit && !organisationId)}
            data-testid="btn-save-role"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            {isEdit ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProjectAccessDialog({
  user,
  projects,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  projects: ProjectLite[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<{ projectIds: string[] }>("GET", `/admin/users/${user.id}/project-access`)
      .then((d) => setSelected(new Set(d.projectIds)))
      .catch((e) => setErr(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, [user.id]);

  function toggle(pid: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(pid)) n.delete(pid);
      else n.add(pid);
      return n;
    });
  }

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await api("PUT", `/admin/users/${user.id}/project-access`, {
        projectIds: [...selected],
      });
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const bypass = user.role === "super_admin" || user.role === "admin" || user.role === "owner";

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Project access — {user.email}</DialogTitle>
          <DialogDescription>
            {bypass
              ? `${ROLE_LABEL[user.role!] ?? user.role} sees every project in their scope by default. Grants below are still recorded but redundant.`
              : "Tick the projects this user can see and act on."}
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
          </div>
        ) : projects.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No projects available in this organisation.</p>
        ) : (
          <div className="max-h-72 overflow-y-auto space-y-1 border rounded-lg p-2">
            {projects.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/60 cursor-pointer"
                data-testid={`access-row-${p.id}`}
              >
                <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggle(p.id)} />
                <span className="text-sm">{p.name}</span>
              </label>
            ))}
          </div>
        )}
        {err && <p className="text-xs text-destructive">{err}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || loading}>
            {busy && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Save access
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuotaDialog({
  org,
  onClose,
  onSaved,
}: {
  org: AdminOrg;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState<string>(org.maxProjects == null ? "" : String(org.maxProjects));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const trimmed = value.trim();
      await api("PATCH", `/admin/organisations/${org.id}/quota`, {
        maxProjects: trimmed === "" ? null : Number(trimmed),
      });
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Project quota — {org.name}</DialogTitle>
          <DialogDescription>
            Currently using {org.projectCount} project{org.projectCount === 1 ? "" : "s"}.
            Leave blank for unlimited.
          </DialogDescription>
        </DialogHeader>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Max projects</CardDescription>
            <CardTitle className="text-xl">
              <Input
                type="number"
                min={0}
                placeholder="Unlimited"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                data-testid="input-quota"
              />
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            When the org reaches this number, new project creation is blocked until you raise it.
          </CardContent>
        </Card>
        {err && <p className="text-xs text-destructive">{err}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
