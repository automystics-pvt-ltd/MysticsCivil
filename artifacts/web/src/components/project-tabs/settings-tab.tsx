import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetProject,
  useListModules,
  useUpdateProjectModules,
  useListProjectAccess,
  useGrantProjectAccess,
  useRevokeProjectAccess,
  useListOrganisationUsers,
  useGetMyProfile,
  useListOrganisations,
  getGetProjectQueryKey,
  getListProjectsQueryKey,
  getListProjectAccessQueryKey,
  getListOrganisationUsersQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MODULE_LABELS } from "@/lib/modules";
import { Loader2, Trash2, UserPlus } from "lucide-react";

const PROJ_WRITE_ROLES = new Set(["admin", "owner", "pm"]);
const ACCESS_WRITE_ROLES = new Set(["admin", "owner", "pm"]);

export function SettingsTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { data: profile } = useGetMyProfile();
  const { data: project } = useGetProject(projectId, {
    query: { enabled: !!projectId, queryKey: getGetProjectQueryKey(projectId) },
  });
  const { data: modulesResp } = useListModules();
  const { data: orgs } = useListOrganisations();
  const org = useMemo(
    () => (orgs ?? []).find((o) => o.id === project?.organisationId),
    [orgs, project?.organisationId],
  );

  const allModules = modulesResp?.modules ?? [];
  const orgEnabled = org?.enabledModules ?? null; // null = all
  const projOverride = project?.enabledModulesOverride ?? null; // null = inherit

  const role = profile?.role ?? "";
  const canWriteModules = PROJ_WRITE_ROLES.has(role);
  const canWriteAccess = ACCESS_WRITE_ROLES.has(role);

  // ── Modules override ────────────────────────────────────────────────
  const updateModules = useUpdateProjectModules();
  const [draftOverride, setDraftOverride] = useState<string[] | null | undefined>(undefined);
  const effectiveDraft = draftOverride === undefined ? projOverride : draftOverride;
  const useOverride = effectiveDraft !== null;

  const orgEnabledSet = orgEnabled == null ? null : new Set(orgEnabled);
  const projSet = effectiveDraft == null ? null : new Set(effectiveDraft);

  const setUseOverride = (on: boolean) => {
    if (!on) setDraftOverride(null);
    else setDraftOverride(orgEnabled ? [...orgEnabled] : [...allModules]);
  };
  const toggleModule = (key: string) => {
    const cur = new Set(effectiveDraft ?? allModules);
    if (cur.has(key)) cur.delete(key);
    else cur.add(key);
    setDraftOverride([...cur]);
  };
  const saveModules = () => {
    const payload = draftOverride === undefined ? projOverride : draftOverride;
    updateModules.mutate(
      { projectId, data: { enabled: payload } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
          qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          setDraftOverride(undefined);
        },
      },
    );
  };
  const moduleDirty = draftOverride !== undefined;

  // ── Project access ──────────────────────────────────────────────────
  const { data: accessRows } = useListProjectAccess(projectId, {
    query: {
      enabled: !!projectId && canWriteAccess,
      queryKey: getListProjectAccessQueryKey(projectId),
    },
  });
  const { data: orgUsers } = useListOrganisationUsers(project?.organisationId ?? "", {
    query: {
      enabled: !!project?.organisationId && canWriteAccess,
      queryKey: getListOrganisationUsersQueryKey(project?.organisationId ?? ""),
    },
  });
  const grant = useGrantProjectAccess();
  const revoke = useRevokeProjectAccess();
  const accessUserIds = new Set((accessRows ?? []).map((r) => r.userId));
  const candidateUsers = (orgUsers ?? []).filter(
    (u) => !accessUserIds.has(u.userId) && !["admin", "owner"].includes(u.role),
  );
  const [selectedUserId, setSelectedUserId] = useState("");

  const onGrant = () => {
    if (!selectedUserId) return;
    grant.mutate(
      { projectId, data: { userId: selectedUserId } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListProjectAccessQueryKey(projectId) });
          setSelectedUserId("");
        },
      },
    );
  };
  const onRevoke = (userId: string) => {
    revoke.mutate(
      { projectId, userId },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListProjectAccessQueryKey(projectId) });
        },
      },
    );
  };

  if (!project) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6 max-w-4xl" data-testid="project-settings-tab">
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Modules</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Choose which modules are available for this project. By default, it inherits the
            organisation's enabled modules.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              checked={useOverride}
              disabled={!canWriteModules}
              onCheckedChange={setUseOverride}
              data-testid="settings-override-toggle"
            />
            <Label className="text-sm">
              Use custom module set
              {!useOverride && <span className="text-muted-foreground ml-2">(inheriting from organisation)</span>}
            </Label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {allModules.map((key) => {
              const orgOn = orgEnabledSet === null || orgEnabledSet.has(key);
              const projOn = projSet === null ? orgOn : projSet.has(key);
              const checked = useOverride ? projOn : orgOn;
              const blockedByOrg = !orgOn && useOverride;
              return (
                <label
                  key={key}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                    blockedByOrg ? "opacity-50" : ""
                  }`}
                  data-testid={`settings-module-${key}`}
                >
                  <Switch
                    checked={checked && (orgOn || !useOverride)}
                    disabled={!useOverride || !canWriteModules || blockedByOrg}
                    onCheckedChange={() => toggleModule(key)}
                  />
                  <span className="flex-1 text-sm font-medium">{MODULE_LABELS[key] ?? key}</span>
                  {blockedByOrg && (
                    <Badge variant="outline" className="text-[10px]">Org disabled</Badge>
                  )}
                </label>
              );
            })}
          </div>

          {canWriteModules && (
            <div className="flex justify-end gap-2">
              {moduleDirty && (
                <Button variant="ghost" size="sm" onClick={() => setDraftOverride(undefined)}>
                  Cancel
                </Button>
              )}
              <Button
                size="sm"
                onClick={saveModules}
                disabled={!moduleDirty || updateModules.isPending}
                data-testid="settings-modules-save"
              >
                {updateModules.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                Save modules
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {canWriteAccess && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Project Access</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Admins and owners always have access. Assign other org users below to grant them
              visibility to this project.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label className="text-xs">Add user</Label>
                <select
                  className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  data-testid="settings-access-user-select"
                >
                  <option value="">— select a user —</option>
                  {candidateUsers.map((u) => (
                    <option key={u.userId} value={u.userId}>
                      {`${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || u.userId} ({u.role})
                    </option>
                  ))}
                </select>
              </div>
              <Button
                onClick={onGrant}
                disabled={!selectedUserId || grant.isPending}
                data-testid="settings-access-grant"
              >
                {grant.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4 mr-1" />
                )}
                Grant access
              </Button>
            </div>

            <div className="rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                    <th className="py-2 px-3 font-semibold">Name</th>
                    <th className="py-2 px-3 font-semibold">Email</th>
                    <th className="py-2 px-3 font-semibold">Role</th>
                    <th className="py-2 px-3 font-semibold w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(accessRows ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-xs text-muted-foreground">
                        No additional users assigned. Admins and owners already have access.
                      </td>
                    </tr>
                  ) : (
                    (accessRows ?? []).map((r) => (
                      <tr key={r.id} data-testid={`settings-access-row-${r.userId}`}>
                        <td className="py-2 px-3 font-medium">
                          {`${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || "—"}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground">{r.email ?? "—"}</td>
                        <td className="py-2 px-3">
                          <Badge variant="outline">{r.role ?? "—"}</Badge>
                        </td>
                        <td className="py-2 px-3 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onRevoke(r.userId)}
                            disabled={revoke.isPending}
                            data-testid={`settings-access-revoke-${r.userId}`}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
