import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListOrgCustomRoles,
  useListCapabilities,
  useCreateOrgCustomRole,
  useUpdateOrgCustomRole,
  useDeleteOrgCustomRole,
  getListOrgCustomRolesQueryKey,
  type OrgCustomRole,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Plus, Pencil, Trash2, ShieldCheck, ChevronDown, ChevronRight } from "lucide-react";

type CapabilityDef = { key: string; group: string; label: string; description: string };

function groupCapabilities(caps: CapabilityDef[]): Record<string, CapabilityDef[]> {
  const groups: Record<string, CapabilityDef[]> = {};
  for (const cap of caps) {
    if (!groups[cap.group]) groups[cap.group] = [];
    groups[cap.group].push(cap);
  }
  return groups;
}

interface RoleEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: OrgCustomRole | null;
  capabilities: CapabilityDef[];
  onSaved: () => void;
}

function RoleEditor({ open, onOpenChange, editing, capabilities, onSaved }: RoleEditorProps) {
  const { toast } = useToast();
  const createRole = useCreateOrgCustomRole();
  const updateRole = useUpdateOrgCustomRole();

  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set(editing?.permissions ?? []));
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Reset when editing target changes
  useState(() => {
    setName(editing?.name ?? "");
    setDescription(editing?.description ?? "");
    setSelected(new Set(editing?.permissions ?? []));
  });

  function toggleCap(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleGroup(group: string, caps: CapabilityDef[]) {
    const allOn = caps.every((c) => selected.has(c.key));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of caps) {
        if (allOn) next.delete(c.key);
        else next.add(c.key);
      }
      return next;
    });
  }

  function toggleCollapse(group: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  const groups = groupCapabilities(capabilities);

  async function handleSave() {
    if (!name.trim()) {
      toast({ title: "Role name is required", variant: "destructive" });
      return;
    }
    const data = { name: name.trim(), description: description.trim() || undefined, permissions: Array.from(selected) };
    try {
      if (editing) {
        await updateRole.mutateAsync({ roleId: editing.id, data: data as any });
        toast({ title: "Role updated" });
      } else {
        await createRole.mutateAsync({ data: data as any });
        toast({ title: "Role created" });
      }
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? "Failed to save role";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  }

  const busy = createRole.isPending || updateRole.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle>{editing ? "Edit role" : "New custom role"}</SheetTitle>
          <SheetDescription>
            Custom roles add extra capabilities on top of a member's base role.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          <div className="space-y-3">
            <div>
              <Label htmlFor="role-name">Role name *</Label>
              <Input
                id="role-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Senior Estimator"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="role-desc">Description</Label>
              <Textarea
                id="role-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional — what is this role for?"
                rows={2}
                className="mt-1 resize-none"
              />
            </div>
          </div>

          <Separator />

          <div>
            <p className="text-sm font-semibold mb-3">Permissions</p>
            <div className="space-y-3">
              {Object.entries(groups).map(([group, caps]) => {
                const allOn = caps.every((c) => selected.has(c.key));
                const someOn = caps.some((c) => selected.has(c.key));
                const collapsed = collapsedGroups.has(group);
                return (
                  <div key={group} className="rounded-lg border">
                    <button
                      type="button"
                      className="flex items-center justify-between w-full px-4 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors"
                      onClick={() => toggleCollapse(group)}
                    >
                      <div className="flex items-center gap-2">
                        {collapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        {group}
                        {someOn && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">
                            {caps.filter((c) => selected.has(c.key)).length}/{caps.length}
                          </Badge>
                        )}
                      </div>
                      <Checkbox
                        checked={allOn ? true : someOn ? "indeterminate" : false}
                        onCheckedChange={() => toggleGroup(group, caps)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </button>
                    {!collapsed && (
                      <div className="border-t divide-y">
                        {caps.map((cap) => (
                          <label key={cap.key} className="flex items-start gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors">
                            <Checkbox
                              checked={selected.has(cap.key)}
                              onCheckedChange={() => toggleCap(cap.key)}
                              className="mt-0.5"
                            />
                            <div>
                              <p className="text-sm font-medium">{cap.label}</p>
                              <p className="text-xs text-muted-foreground">{cap.description}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <SheetFooter className="px-6 py-4 border-t flex flex-row gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={busy || !name.trim()}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {editing ? "Save changes" : "Create role"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default function SettingsRoles() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: roles = [], isLoading } = useListOrgCustomRoles();
  const { data: capabilities = [] } = useListCapabilities();
  const deleteRole = useDeleteOrgCustomRole();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<OrgCustomRole | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrgCustomRole | null>(null);

  function openNew() {
    setEditingRole(null);
    setEditorOpen(true);
  }

  function openEdit(role: OrgCustomRole) {
    setEditingRole(role);
    setEditorOpen(true);
  }

  function handleSaved() {
    queryClient.invalidateQueries({ queryKey: getListOrgCustomRolesQueryKey() });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteRole.mutateAsync({ roleId: deleteTarget.id });
      toast({ title: "Role deleted" });
      queryClient.invalidateQueries({ queryKey: getListOrgCustomRolesQueryKey() });
    } catch (err: any) {
      toast({ title: "Error", description: err?.response?.data?.error ?? err?.message, variant: "destructive" });
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Custom Roles</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Define extra permission bundles that layer on top of built-in roles.
          </p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> New Role
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your custom roles</CardTitle>
          <CardDescription>
            Custom roles are additive — they grant extra capabilities on top of a member's base role.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !roles.length ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <ShieldCheck className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
              <p className="font-medium">No custom roles yet</p>
              <p className="mt-1">Create a role to grant specific permissions to team members.</p>
              <Button variant="outline" className="mt-4 gap-2" onClick={openNew}>
                <Plus className="h-4 w-4" /> Create your first role
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {roles.map((role) => (
                <div key={role.id} className="flex items-start justify-between py-3 gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{role.name}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {(role.permissions ?? []).length} permission{(role.permissions ?? []).length !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                    {role.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{role.description}</p>
                    )}
                    {(role.permissions ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {(role.permissions ?? []).slice(0, 5).map((p) => (
                          <Badge key={p} variant="outline" className="text-[10px] py-0 px-1.5 font-mono">{p}</Badge>
                        ))}
                        {(role.permissions ?? []).length > 5 && (
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-muted-foreground">
                            +{(role.permissions ?? []).length - 5} more
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(role)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(role)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <RoleEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editing={editingRole}
        capabilities={capabilities as CapabilityDef[]}
        onSaved={handleSaved}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the custom role and detach it from all team members who currently have it assigned.
              Their base role will remain unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleteRole.isPending}
            >
              {deleteRole.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
