import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LocationSelect } from "@/components/location-select";
import {
  useListOrganisations,
  useCreateOrganisation,
  useUpdateOrganisation,
  useUpdateOrganisationModules,
  useListModules,
  useGetMyProfile,
  getListOrganisationsQueryKey,
  type Organisation,
} from "@workspace/api-client-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { MODULE_LABELS } from "@/lib/modules";
import { useUpload } from "@workspace/object-storage-web";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Building, Pencil, Upload, Loader2, X, AlertCircle } from "lucide-react";

type OrgForm = {
  name: string;
  legalName: string;
  gstin: string;
  pan: string;
  address: string;
  country: string;
  city: string;
  state: string;
  pincode: string;
  logoUrl: string;
};

const EMPTY_FORM: OrgForm = {
  name: "", legalName: "", gstin: "", pan: "", address: "", country: "IN", city: "", state: "", pincode: "", logoUrl: "",
};

function toForm(o: Organisation): OrgForm {
  return {
    name: o.name ?? "",
    legalName: o.legalName ?? "",
    gstin: o.gstin ?? "",
    pan: o.pan ?? "",
    address: o.address ?? "",
    country: (o as any).country ?? "IN",
    city: o.city ?? "",
    state: o.state ?? "",
    pincode: o.pincode ?? "",
    logoUrl: o.logoUrl ?? "",
  };
}

export default function Organisations() {
  const qc = useQueryClient();
  const { data: profile } = useGetMyProfile();
  const isAdmin = profile?.role === "admin";

  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<OrgForm>(EMPTY_FORM);

  const { data } = useListOrganisations({
    query: { queryKey: getListOrganisationsQueryKey() },
  });
  const create = useCreateOrganisation();
  const update = useUpdateOrganisation();
  const upload = useUpload();
  const logoFileRef = useRef<HTMLInputElement>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  const editing = data?.find((o) => o.id === editingId) ?? null;

  useEffect(() => {
    if (editing) setForm(toForm(editing));
  }, [editing]);

  const onClose = () => {
    setCreateOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setLogoError(null);
  };

  const onLogoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setLogoError(null);
    const uploaded = await upload.uploadFile(f);
    if (!uploaded) {
      setLogoError(upload.error?.message ?? "Could not upload logo.");
      return;
    }
    setForm((prev) => ({ ...prev, logoUrl: `/api/storage${uploaded.objectPath}` }));
  };

  const submit = () => {
    if (!form.name.trim()) return;
    const payload: Record<string, string> = {};
    (Object.keys(form) as (keyof OrgForm)[]).forEach((k) => {
      const v = form[k]?.trim();
      if (v) payload[k] = v;
    });
    if (editingId) {
      update.mutate(
        { organisationId: editingId, data: payload },
        {
          onSuccess: () => {
            qc.invalidateQueries({ queryKey: getListOrganisationsQueryKey() });
            onClose();
          },
        },
      );
    } else {
      create.mutate(
        { data: payload as { name: string } },
        {
          onSuccess: () => {
            qc.invalidateQueries({ queryKey: getListOrganisationsQueryKey() });
            onClose();
          },
        },
      );
    }
  };

  const dialogOpen = createOpen || !!editingId;
  const setDialogOpen = (open: boolean) => { if (!open) onClose(); };
  const busy = create.isPending || update.isPending || upload.isUploading;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Organisations</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isAdmin
              ? "Companies and entities billing on this tenant. Admin-only access to legal details."
              : "Companies set up on this tenant."}
          </p>
        </div>
        {isAdmin && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { setEditingId(null); setForm(EMPTY_FORM); setCreateOpen(true); }} data-testid="org-new-btn">
                <Plus className="h-4 w-4 mr-1" /> New Organisation
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editingId ? "Edit Organisation" : "New Organisation"}</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="col-span-2"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="org-input-name" /></div>
                <div className="col-span-2"><Label>Legal Name</Label><Input value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} /></div>
                <div><Label>GSTIN</Label><Input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} /></div>
                <div><Label>PAN</Label><Input value={form.pan} onChange={(e) => setForm({ ...form, pan: e.target.value })} /></div>
                <div className="col-span-2"><Label>Address</Label><Textarea rows={2} className="resize-none" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
                <div className="col-span-2">
                  <LocationSelect
                    country={form.country}
                    state={form.state}
                    city={form.city}
                    onCountryChange={v => setForm({ ...form, country: v, state: "", city: "" })}
                    onStateChange={v => setForm({ ...form, state: v, city: "" })}
                    onCityChange={v => setForm({ ...form, city: v })}
                  />
                </div>
                <div><Label>Pincode</Label><Input value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} /></div>
                <div className="col-span-2">
                  <Label>Logo</Label>
                  <input
                    ref={logoFileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onLogoPick}
                    data-testid="org-logo-input"
                  />
                  {form.logoUrl ? (
                    <div className="mt-2 flex items-center gap-3">
                      <div className="relative inline-block rounded-lg overflow-hidden border bg-muted">
                        <img src={form.logoUrl} alt="Logo preview" className="h-20 w-20 object-contain bg-muted" data-testid="org-logo-preview" />
                        <button
                          type="button"
                          onClick={() => { setForm({ ...form, logoUrl: "" }); setLogoError(null); }}
                          className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                          aria-label="Remove logo"
                          data-testid="org-logo-remove"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => logoFileRef.current?.click()}
                        disabled={upload.isUploading}
                        data-testid="org-logo-replace"
                      >
                        {upload.isUploading ? (
                          <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Uploading…</>
                        ) : (
                          <><Upload className="h-4 w-4 mr-1" /> Replace</>
                        )}
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => logoFileRef.current?.click()}
                        disabled={upload.isUploading}
                        data-testid="org-logo-upload-btn"
                      >
                        {upload.isUploading ? (
                          <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Uploading…</>
                        ) : (
                          <><Upload className="h-4 w-4 mr-1" /> Upload logo</>
                        )}
                      </Button>
                      <p className="text-xs text-muted-foreground mt-1">PNG, JPG up to 10 MB.</p>
                    </div>
                  )}
                  {logoError && (
                    <div className="mt-2 flex items-start gap-2 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded p-2">
                      <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                      <span>{logoError}</span>
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
                <Button onClick={submit} disabled={busy || !form.name.trim()} data-testid="org-submit">
                  {busy ? "Saving…" : editingId ? "Save changes" : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isAdmin && <OrgModulesSection organisations={data ?? []} />}

      <Card>
        <CardHeader><CardTitle className="text-base">All Organisations</CardTitle></CardHeader>
        <CardContent>
          {!data?.length ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No organisations yet.
              {isAdmin && <> Click <strong>New Organisation</strong> to add one.</>}
            </div>
          ) : isAdmin ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="org-table">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                    <th className="py-2 pr-3 font-semibold">Name</th>
                    <th className="py-2 pr-3 font-semibold">Legal name</th>
                    <th className="py-2 pr-3 font-semibold">GSTIN</th>
                    <th className="py-2 pr-3 font-semibold">PAN</th>
                    <th className="py-2 pr-3 font-semibold">Address</th>
                    <th className="py-2 pr-3 font-semibold">Logo</th>
                    <th className="py-2 pr-3 font-semibold w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.map((o) => (
                    <tr key={o.id} data-testid={`org-row-${o.id}`}>
                      <td className="py-3 pr-3 font-semibold">{o.name}</td>
                      <td className="py-3 pr-3 text-muted-foreground">{o.legalName || "—"}</td>
                      <td className="py-3 pr-3 font-mono text-xs">{o.gstin || "—"}</td>
                      <td className="py-3 pr-3 font-mono text-xs">{o.pan || "—"}</td>
                      <td className="py-3 pr-3 text-xs text-muted-foreground max-w-xs">
                        {[o.address, [o.city, o.state, o.pincode].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="py-3 pr-3">
                        {o.logoUrl ? (
                          <img src={o.logoUrl} alt="" className="h-8 w-8 rounded object-contain bg-muted border" />
                        ) : (
                          <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center text-primary">
                            <Building className="h-4 w-4" />
                          </div>
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setCreateOpen(false); setEditingId(o.id); }}
                          data-testid={`org-edit-${o.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="divide-y">
              {data.map((o) => (
                <div key={o.id} className="flex items-center gap-4 py-3" data-testid={`org-name-row-${o.id}`}>
                  <div className="p-2 rounded-md bg-primary/10 text-primary">
                    <Building className="h-5 w-5" />
                  </div>
                  <div className="font-medium">{o.name}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OrgModulesSection({ organisations }: { organisations: Organisation[] }) {
  const qc = useQueryClient();
  const { data: modulesResp } = useListModules();
  const update = useUpdateOrganisationModules();
  const allModules = modulesResp?.modules ?? [];
  const [drafts, setDrafts] = useState<Record<string, string[] | null>>({});

  const enabledFor = (o: Organisation): string[] | null => {
    if (o.id in drafts) return drafts[o.id];
    return (o.enabledModules as string[] | null | undefined) ?? null;
  };
  const setDraft = (id: string, val: string[] | null) =>
    setDrafts((d) => ({ ...d, [id]: val }));
  const isDirty = (o: Organisation) => o.id in drafts;

  const toggleAll = (o: Organisation, on: boolean) => {
    setDraft(o.id, on ? null : []);
  };
  const toggleModule = (o: Organisation, key: string) => {
    const cur = enabledFor(o);
    const list = cur === null ? [...allModules] : [...cur];
    const idx = list.indexOf(key);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(key);
    setDraft(o.id, list);
  };
  const save = (o: Organisation) => {
    const payload = enabledFor(o);
    update.mutate(
      { organisationId: o.id, data: { enabled: payload } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListOrganisationsQueryKey() });
          setDrafts((d) => {
            const { [o.id]: _omit, ...rest } = d;
            return rest;
          });
        },
      },
    );
  };

  if (!organisations.length) return null;

  return (
    <Card data-testid="org-modules-section">
      <CardHeader>
        <CardTitle className="text-base">Modules per Organisation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {organisations.map((o) => {
          const enabled = enabledFor(o);
          const allOn = enabled === null;
          const set = new Set(enabled ?? allModules);
          return (
            <div key={o.id} className="rounded-xl border p-4 space-y-3" data-testid={`org-modules-${o.id}`}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{o.name}</span>
                  {allOn && <Badge variant="outline" className="text-[10px]">All modules</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={allOn}
                    onCheckedChange={(on) => toggleAll(o, on)}
                    data-testid={`org-modules-${o.id}-all`}
                  />
                  <span className="text-xs text-muted-foreground">All modules</span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {allModules.map((k) => (
                  <label key={k} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
                    <Switch
                      checked={set.has(k)}
                      disabled={allOn}
                      onCheckedChange={() => toggleModule(o, k)}
                      data-testid={`org-modules-${o.id}-${k}`}
                    />
                    <span className="flex-1">{MODULE_LABELS[k] ?? k}</span>
                  </label>
                ))}
              </div>
              {isDirty(o) && (
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setDrafts((d) => { const { [o.id]: _, ...rest } = d; return rest; })}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={() => save(o)} disabled={update.isPending} data-testid={`org-modules-${o.id}-save`}>
                    {update.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />} Save
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
