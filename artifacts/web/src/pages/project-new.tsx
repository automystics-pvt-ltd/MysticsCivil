import { useEffect, useRef, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLocation, useSearch, Link } from "wouter";
import {
  useCreateProject,
  useListOrganisations,
  useGetMyProfile,
  useReverseGeocode,
  getListProjectsQueryKey,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, MapPin, Plus, Trash2, Upload, X, Loader2, Building, ClipboardList } from "lucide-react";

const milestoneSchema = z.object({
  name: z.string().min(1, "Required"),
  targetDate: z.string().min(1, "Required"),
  description: z.string().optional(),
});

const projectSchema = z.object({
  organisationId: z.string().min(1, "Organisation is required"),
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  clientName: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  reraNumber: z.string().optional(),
  contractValue: z.coerce.number().min(0).optional(),
  startDate: z.string().optional(),
  targetEndDate: z.string().optional(),
  coverImageUrl: z.string().optional(),
  milestones: z.array(milestoneSchema).default([]),
});

type ProjectFormValues = z.infer<typeof projectSchema>;

export default function NewProject() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [gpsBusy, setGpsBusy] = useState(false);

  // ── Tender prefill ───────────────────────────────────────────────────────
  const sp = new URLSearchParams(search);
  const fromTenderId = sp.get("fromTender") ?? null;
  const tenderPrefill = fromTenderId
    ? {
        name: sp.get("name") ?? "",
        clientName: sp.get("clientName") ?? "",
        contractValue: Number(sp.get("contractValue") ?? 0) || 0,
        location: sp.get("location") ?? "",
        loaRef: sp.get("loaRef") ?? "",
      }
    : null;

  const { data: orgs } = useListOrganisations();
  const { data: profile } = useGetMyProfile();
  const isAdmin = profile?.role === "admin";
  const createProject = useCreateProject();

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      organisationId: "", code: "", name: tenderPrefill?.name ?? "",
      clientName: tenderPrefill?.clientName ?? "", description: "",
      location: tenderPrefill?.location ?? "", latitude: "", longitude: "", reraNumber: "",
      contractValue: tenderPrefill?.contractValue ?? 0, startDate: "", targetEndDate: "",
      coverImageUrl: "", milestones: [],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "milestones" });

  // Auto-select org when loaded (for tender prefill flow)
  const orgPrefilled = useRef(false);
  useEffect(() => {
    if (!tenderPrefill || orgPrefilled.current || !orgs?.length) return;
    orgPrefilled.current = true;
    form.setValue("organisationId", orgs[0].id);
  }, [orgs, tenderPrefill, form]);

  const captureGps = () => {
    if (!navigator.geolocation) {
      toast({ title: "GPS unavailable", description: "Geolocation not supported by this browser.", variant: "destructive" });
      return;
    }
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        form.setValue("latitude", pos.coords.latitude.toFixed(6));
        form.setValue("longitude", pos.coords.longitude.toFixed(6));
        setGpsBusy(false);
        toast({ title: "GPS captured", description: `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}` });
      },
      (err) => { setGpsBusy(false); toast({ title: "GPS failed", description: err.message, variant: "destructive" }); },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  // ── Reverse geocode (debounced) ──────────────────────────────────────────
  const latStr = form.watch("latitude");
  const lonStr = form.watch("longitude");
  const geocode = useReverseGeocode();
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [geocodeState, setGeocodeState] = useState<"idle" | "loading" | "error" | "done">("idle");
  const lastReqKey = useRef<string>("");

  useEffect(() => {
    const lat = parseFloat(latStr || "");
    const lon = parseFloat(lonStr || "");
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      setSuggestion(null);
      setGeocodeState("idle");
      return;
    }
    const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
    if (key === lastReqKey.current) return;
    lastReqKey.current = key;
    const handle = setTimeout(() => {
      setGeocodeState("loading");
      geocode.mutate(
        { data: { lat, lon } },
        {
          onSuccess: (resp) => {
            if (resp.address) {
              setSuggestion(resp.address);
              setGeocodeState("done");
            } else {
              setSuggestion(null);
              setGeocodeState("error");
            }
          },
          onError: () => { setSuggestion(null); setGeocodeState("error"); },
        },
      );
    }, 600);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latStr, lonStr]);

  // ── Cover image upload ───────────────────────────────────────────────────
  const upload = useUpload();
  const coverFileRef = useRef<HTMLInputElement>(null);
  const coverImageUrl = form.watch("coverImageUrl");
  const onCoverPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const uploaded = await upload.uploadFile(f);
    if (!uploaded) {
      toast({ title: "Upload failed", description: upload.error?.message ?? "Could not upload cover image", variant: "destructive" });
      return;
    }
    form.setValue("coverImageUrl", `/api/storage${uploaded.objectPath}`, { shouldDirty: true, shouldValidate: true });
  };

  // ── Org selection details ────────────────────────────────────────────────
  const selectedOrgId = form.watch("organisationId");
  const selectedOrg = orgs?.find((o) => o.id === selectedOrgId);

  function onSubmit(data: ProjectFormValues) {
    const payload: any = { ...data };
    if (!payload.latitude) delete payload.latitude;
    if (!payload.longitude) delete payload.longitude;
    if (!payload.coverImageUrl) delete payload.coverImageUrl;
    createProject.mutate(
      { data: payload },
      {
        onSuccess: (project) => {
          queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          if (fromTenderId) {
            fetch(`/api/tenders/${fromTenderId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ convertedToProjectId: project.id, status: "won" }),
            }).catch((e: any) => console.warn("Tender link failed:", e?.message));
          }
          toast({ title: "Project created", description: `${project.name} is ready.` });
          setLocation(`/projects/${project.id}`);
        },
        onError: (error: any) => {
          toast({ title: "Error", description: error?.message || "Failed to create project", variant: "destructive" });
        },
      },
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/projects" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Project</h1>
          <p className="text-muted-foreground mt-1">Set up the site, contract, location, compliance and contractual milestones.</p>
        </div>
      </div>

      {fromTenderId && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 flex items-start gap-2">
          <ClipboardList className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-600" />
          <div>
            <span className="font-semibold">Pre-filled from Tender</span>
            {tenderPrefill?.name && <span className="text-blue-700"> — {tenderPrefill.name}</span>}
            <p className="text-xs text-blue-600 mt-0.5">
              Review the fields below and fill in the project code and schedule before creating.
              The tender will be automatically linked once the project is saved.
            </p>
          </div>
        </div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Identity & Org Hierarchy</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              <FormField control={form.control} name="organisationId" render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Organisation</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger data-testid="org-select"><SelectValue placeholder="Select an organisation" /></SelectTrigger></FormControl>
                    <SelectContent>{orgs?.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
                  </Select>
                  {orgs && orgs.length === 0 ? (
                    <p className="text-xs text-amber-700 mt-1" data-testid="org-empty-cta">
                      No organisations yet —{" "}
                      <Link href="/organisations" className="font-semibold underline hover:text-amber-900">
                        create one
                      </Link>{" "}
                      to continue.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">This project rolls up under the chosen company for billing & reporting.</p>
                  )}
                  {selectedOrg && (
                    <div className="mt-3 rounded-lg border bg-muted/40 p-3 text-xs" data-testid="org-details-panel">
                      <div className="flex items-start gap-2">
                        <Building className="h-4 w-4 mt-0.5 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm">{selectedOrg.name}</div>
                          {(selectedOrg.city || selectedOrg.state) && (
                            <div className="text-muted-foreground">
                              {[selectedOrg.city, selectedOrg.state].filter(Boolean).join(", ")}
                            </div>
                          )}
                          {isAdmin && (
                            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                              {selectedOrg.legalName && (<><dt className="text-muted-foreground">Legal name</dt><dd>{selectedOrg.legalName}</dd></>)}
                              {selectedOrg.gstin && (<><dt className="text-muted-foreground">GSTIN</dt><dd className="font-mono">{selectedOrg.gstin}</dd></>)}
                              {selectedOrg.pan && (<><dt className="text-muted-foreground">PAN</dt><dd className="font-mono">{selectedOrg.pan}</dd></>)}
                              {selectedOrg.pincode && (<><dt className="text-muted-foreground">Pincode</dt><dd>{selectedOrg.pincode}</dd></>)}
                              {selectedOrg.address && (<><dt className="text-muted-foreground col-span-2">Address</dt><dd className="col-span-2 whitespace-pre-wrap">{selectedOrg.address}</dd></>)}
                            </dl>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="code" render={({ field }) => (
                <FormItem><FormLabel>Project Code</FormLabel><FormControl><Input placeholder="e.g. DLF-OAK" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Project Name</FormLabel><FormControl><Input placeholder="Enter project name" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="clientName" render={({ field }) => (
                <FormItem><FormLabel>Client Name</FormLabel><FormControl><Input placeholder="e.g. DLF Home Developers" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="contractValue" render={({ field }) => (
                <FormItem><FormLabel>Contract Value (₹)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Location & GPS</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              <div className="md:col-span-2 space-y-2">
                {geocodeState !== "idle" && (
                  <div
                    className={`rounded-lg border px-3 py-2 text-xs flex items-start gap-2 ${
                      geocodeState === "done"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                        : geocodeState === "loading"
                          ? "border-border bg-muted/40 text-muted-foreground"
                          : "border-border bg-muted/40 text-muted-foreground"
                    }`}
                    data-testid="address-suggestion"
                  >
                    <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      {geocodeState === "loading" && (
                        <span className="inline-flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" /> Looking up address from coordinates…
                        </span>
                      )}
                      {geocodeState === "done" && suggestion && (
                        <>
                          <span className="font-medium">Suggested:</span>{" "}
                          <span className="break-words">{suggestion}</span>
                        </>
                      )}
                      {geocodeState === "error" && <span>Could not resolve address from these coordinates.</span>}
                    </div>
                    {geocodeState === "done" && suggestion && (
                      <button
                        type="button"
                        className="text-emerald-700 hover:text-emerald-900 font-semibold underline whitespace-nowrap"
                        onClick={() => form.setValue("location", suggestion, { shouldDirty: true, shouldValidate: true })}
                        data-testid="address-use-suggestion"
                      >
                        Use this
                      </button>
                    )}
                  </div>
                )}
                <FormField control={form.control} name="location" render={({ field }) => (
                  <FormItem><FormLabel>Site Address</FormLabel><FormControl><Input placeholder="Sector, City, State" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="latitude" render={({ field }) => (
                <FormItem><FormLabel>Latitude</FormLabel><FormControl><Input placeholder="28.4089" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="longitude" render={({ field }) => (
                <FormItem><FormLabel>Longitude</FormLabel><FormControl><Input placeholder="76.9854" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="md:col-span-2">
                <Button type="button" variant="outline" onClick={captureGps} disabled={gpsBusy}>
                  <MapPin className="h-4 w-4 mr-1" /> {gpsBusy ? "Locating…" : "Capture from device GPS"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Compliance</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              <FormField control={form.control} name="reraNumber" render={({ field }) => (
                <FormItem className="md:col-span-2"><FormLabel>RERA Registration Number</FormLabel><FormControl><Input placeholder="e.g. RERA-DLF-OAK-2024" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Schedule</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              <FormField control={form.control} name="startDate" render={({ field }) => (
                <FormItem><FormLabel>Start Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="targetEndDate" render={({ field }) => (
                <FormItem><FormLabel>Target End Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Contractual Milestones</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">Optional — define key dates now or add them later.</p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => append({ name: "", targetDate: "", description: "" })}>
                <Plus className="h-4 w-4 mr-1" /> Add milestone
              </Button>
            </CardHeader>
            <CardContent>
              {fields.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">No milestones yet.</div>
              ) : (
                <div className="space-y-3">
                  {fields.map((field, idx) => (
                    <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                      <FormField control={form.control} name={`milestones.${idx}.name`} render={({ field }) => (
                        <FormItem className="col-span-5"><FormControl><Input placeholder="Milestone name" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name={`milestones.${idx}.targetDate`} render={({ field }) => (
                        <FormItem className="col-span-3"><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name={`milestones.${idx}.description`} render={({ field }) => (
                        <FormItem className="col-span-3"><FormControl><Input placeholder="Notes" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <button type="button" onClick={() => remove(idx)} className="col-span-1 text-muted-foreground hover:text-rose-600 mt-2 justify-self-center">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Description & Cover</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea rows={3} className="resize-none" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div>
                <Label>Cover Image</Label>
                <input
                  ref={coverFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onCoverPick}
                  data-testid="cover-file-input"
                />
                {coverImageUrl ? (
                  <div className="mt-2 relative inline-block rounded-lg overflow-hidden border bg-muted">
                    <img src={coverImageUrl} alt="Cover preview" className="h-40 w-auto object-cover" />
                    <button
                      type="button"
                      onClick={() => form.setValue("coverImageUrl", "", { shouldDirty: true })}
                      className="absolute top-1.5 right-1.5 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                      aria-label="Remove cover image"
                      data-testid="cover-remove"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="mt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => coverFileRef.current?.click()}
                      disabled={upload.isUploading}
                      data-testid="cover-upload-btn"
                    >
                      {upload.isUploading ? (
                        <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Uploading…</>
                      ) : (
                        <><Upload className="h-4 w-4 mr-1" /> Upload cover image</>
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-1">PNG, JPG up to 10 MB.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button variant="outline" type="button" onClick={() => setLocation("/projects")}>Cancel</Button>
            <Button type="submit" disabled={createProject.isPending}>
              {createProject.isPending ? "Creating…" : "Create Project"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
