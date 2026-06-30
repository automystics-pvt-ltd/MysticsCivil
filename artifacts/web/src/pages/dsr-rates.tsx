import { useState, useMemo, useRef } from "react";
import {
  useListDsrRates,
  useCreateDsrRate,
  useUpdateDsrRate,
  useDeleteDsrRate,
  useListRateSources,
  useCreateRateSource,
  useUpdateRateSource,
  useDeleteRateSource,
  useSyncRateSource,
  useBulkUpsertDsrRates,
  useEscalateDsrRates,
  useGetMyProfile,
  getListDsrRatesQueryKey,
  getListRateSourcesQueryKey,
} from "@workspace/api-client-react";
import type { DsrRate, RateSource } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import Papa from "papaparse";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Search, Edit2, Check, X, BookOpen, RefreshCw, Trash2, Upload, TrendingUp, Cloud, AlertCircle, CheckCircle2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const TRADES = [
  "Earthwork","RCC","Masonry","Plaster","Flooring","Tiling","Waterproofing",
  "Painting","MEP-Electrical","MEP-Plumbing","MEP-HVAC","Facade","Structural Steel",
  "Piling","Roads","External Works","Landscaping","Prelims","Finishing","Glazing",
];

const STATES = [
  "Delhi","Haryana","Maharashtra","Karnataka","Tamil Nadu","Telangana",
  "Gujarat","Rajasthan","Uttar Pradesh","West Bengal","Madhya Pradesh","Chhattisgarh",
];

const CITY_TIERS = ["T1", "T2", "T3"];
const SOURCES = ["DSR", "SSR", "MoRTH", "CPWD", "Market", "Quoted"];
const SOURCE_TYPES = [
  { value: "csv", label: "CSV URL" },
  { value: "json", label: "JSON URL" },
  { value: "gsheet", label: "Google Sheet" },
  { value: "escalation", label: "Annual Escalation Rule" },
] as const;

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    success: { cls: "bg-emerald-100 text-emerald-800 border-emerald-300", label: "Success" },
    partial: { cls: "bg-amber-100 text-amber-800 border-amber-300", label: "Partial" },
    error: { cls: "bg-rose-100 text-rose-800 border-rose-300", label: "Error" },
    never: { cls: "bg-muted text-muted-foreground", label: "Never" },
  };
  const v = map[status] ?? map.never;
  return <Badge variant="outline" className={`text-[10px] ${v.cls}`}>{v.label}</Badge>;
}

function NewRateDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: "", description: "", trade: TRADES[0], unit: "", state: STATES[0], cityTier: "T2", rate: "", source: "DSR", effectiveYear: new Date().getFullYear() });
  const { toast } = useToast();
  const qc = useQueryClient();
  const createRate = useCreateDsrRate();

  const submit = () => {
    if (!form.code || !form.description || !form.unit || !form.rate) {
      toast({ title: "Fill all required fields", variant: "destructive" }); return;
    }
    createRate.mutate(
      { data: { ...form, rate: Number(form.rate) } },
      {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListDsrRatesQueryKey({}) }); toast({ title: "Rate added" }); setOpen(false); setForm(f => ({ ...f, code: "", description: "", unit: "", rate: "" })); },
        onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Add Rate</Button></DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add DSR/SSR Rate</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
          <div><label className="text-xs font-medium">Code</label><Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="e.g. DSR-5.1.2" /></div>
          <div>
            <label className="text-xs font-medium">Trade</label>
            <Select value={form.trade} onValueChange={v => setForm(f => ({ ...f, trade: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TRADES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><label className="text-xs font-medium">Description</label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Full item description" /></div>
          <div><label className="text-xs font-medium">Unit</label><Input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="e.g. cum, sqm, MT" /></div>
          <div><label className="text-xs font-medium">Rate (₹)</label><Input type="number" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} /></div>
          <div>
            <label className="text-xs font-medium">State</label>
            <Select value={form.state} onValueChange={v => setForm(f => ({ ...f, state: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium">City Tier</label>
            <Select value={form.cityTier} onValueChange={v => setForm(f => ({ ...f, cityTier: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CITY_TIERS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium">Source</label>
            <Select value={form.source} onValueChange={v => setForm(f => ({ ...f, source: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><label className="text-xs font-medium">Effective Year</label><Input type="number" value={form.effectiveYear} onChange={e => setForm(f => ({ ...f, effectiveYear: Number(e.target.value) }))} /></div>
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={createRate.isPending}>Add Rate</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RateRow({ rate, canDelete }: { rate: DsrRate; canDelete: boolean }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(rate.rate));
  const updateRate = useUpdateDsrRate();
  const deleteRate = useDeleteDsrRate();
  const qc = useQueryClient();
  const { toast } = useToast();

  const save = () => {
    updateRate.mutate(
      { rateId: rate.id, data: { rate: Number(val) } },
      {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListDsrRatesQueryKey({}) }); setEditing(false); toast({ title: "Rate updated" }); },
        onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
      },
    );
  };

  const remove = () => {
    if (!confirm(`Delete rate ${rate.code}?`)) return;
    deleteRate.mutate(
      { rateId: rate.id },
      {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListDsrRatesQueryKey({}) }); toast({ title: "Rate deleted" }); },
        onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
      },
    );
  };

  return (
    <tr className="border-b last:border-0 hover:bg-muted/30 group">
      <td className="py-2 px-2 text-xs font-mono text-muted-foreground">{rate.code}</td>
      <td className="py-2 px-2 text-sm">{rate.description}</td>
      <td className="py-2 px-2"><Badge variant="outline" className="text-[10px]">{rate.trade}</Badge></td>
      <td className="py-2 px-2 text-center text-xs">{rate.unit}</td>
      <td className="py-2 px-2 text-xs text-muted-foreground">{rate.state}</td>
      <td className="py-2 px-2 text-center text-xs">{rate.cityTier}</td>
      <td className="py-2 px-2 text-right tabular-nums font-medium">
        {editing ? (
          <div className="flex items-center gap-1">
            <Input type="number" value={val} onChange={e => setVal(e.target.value)} className="h-6 w-24 text-right text-xs" />
            <button onClick={save} className="text-emerald-600"><Check className="h-3 w-3" /></button>
            <button onClick={() => setEditing(false)} className="text-rose-500"><X className="h-3 w-3" /></button>
          </div>
        ) : (
          <span>₹{Number(rate.rate).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
        )}
      </td>
      <td className="py-2 px-2 text-center text-xs text-muted-foreground">{rate.effectiveYear}</td>
      <td className="py-2 px-2 text-xs text-muted-foreground">{rate.source}</td>
      <td className="py-2 px-2">
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100">
          <button onClick={() => setEditing(true)} className="text-muted-foreground hover:text-primary" title="Edit">
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          {canDelete && (
            <button onClick={remove} className="text-muted-foreground hover:text-rose-600" title="Delete">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

interface SourceFormState {
  label: string;
  type: "csv" | "json" | "gsheet" | "escalation";
  url: string;
  defaultState: string;
  defaultSource: string;
  defaultEffectiveYear: string;
  enabled: boolean;
  escalationPct: string;
  escalationFilterTrade: string;
  escalationFilterState: string;
  escalationFromYear: string;
  escalationToYear: string;
}

const emptySource = (): SourceFormState => ({
  label: "",
  type: "csv",
  url: "",
  defaultState: "",
  defaultSource: "DSR",
  defaultEffectiveYear: String(new Date().getFullYear()),
  enabled: true,
  escalationPct: "",
  escalationFilterTrade: "",
  escalationFilterState: "",
  escalationFromYear: "",
  escalationToYear: "",
});

function SourceDialog({ trigger, existing, onClose }: { trigger: React.ReactNode; existing?: RateSource; onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<SourceFormState>(() => existing ? {
    label: existing.label,
    type: existing.type as any,
    url: existing.url ?? "",
    defaultState: existing.defaultState ?? "",
    defaultSource: existing.defaultSource ?? "DSR",
    defaultEffectiveYear: existing.defaultEffectiveYear ? String(existing.defaultEffectiveYear) : "",
    enabled: existing.enabled,
    escalationPct: existing.escalationPct != null ? String(existing.escalationPct) : "",
    escalationFilterTrade: existing.escalationFilterTrade ?? "",
    escalationFilterState: existing.escalationFilterState ?? "",
    escalationFromYear: existing.escalationFromYear ? String(existing.escalationFromYear) : "",
    escalationToYear: existing.escalationToYear ? String(existing.escalationToYear) : "",
  } : emptySource());
  const create = useCreateRateSource();
  const update = useUpdateRateSource();
  const qc = useQueryClient();
  const { toast } = useToast();
  const pending = create.isPending || update.isPending;

  const close = () => { setOpen(false); onClose?.(); };

  const submit = () => {
    if (!form.label) { toast({ title: "Label required", variant: "destructive" }); return; }
    if (form.type !== "escalation" && !form.url) {
      toast({ title: "URL required for this source type", variant: "destructive" }); return;
    }
    if (form.type === "escalation" && !form.escalationPct) {
      toast({ title: "Escalation % required", variant: "destructive" }); return;
    }
    const data: any = {
      label: form.label,
      type: form.type,
      enabled: form.enabled,
      defaultSource: form.defaultSource || "DSR",
    };
    if (form.type !== "escalation") data.url = form.url;
    if (form.defaultState) data.defaultState = form.defaultState;
    if (form.defaultEffectiveYear) data.defaultEffectiveYear = Number(form.defaultEffectiveYear);
    if (form.type === "escalation") {
      data.escalationPct = Number(form.escalationPct);
      if (form.escalationFilterTrade) data.escalationFilterTrade = form.escalationFilterTrade;
      if (form.escalationFilterState) data.escalationFilterState = form.escalationFilterState;
      if (form.escalationFromYear) data.escalationFromYear = Number(form.escalationFromYear);
      if (form.escalationToYear) data.escalationToYear = Number(form.escalationToYear);
    }
    const handlers = {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListRateSourcesQueryKey() });
        toast({ title: existing ? "Source updated" : "Source added" });
        close();
      },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    };
    if (existing) update.mutate({ id: existing.id, data }, handlers);
    else create.mutate({ data }, handlers);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) onClose?.(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{existing ? "Edit Source" : "Add Auto-sync Source"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
          <div className="col-span-2">
            <label className="text-xs font-medium">Label</label>
            <Input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. CPWD DSR 2024 Delhi" />
          </div>
          <div>
            <label className="text-xs font-medium">Type</label>
            <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as any }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SOURCE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-end gap-2 pt-5">
            <span className="text-xs">Enabled</span>
            <Switch checked={form.enabled} onCheckedChange={(v) => setForm(f => ({ ...f, enabled: v }))} />
          </div>
          {form.type !== "escalation" && (
            <div className="col-span-2">
              <label className="text-xs font-medium">{form.type === "gsheet" ? "Google Sheet URL" : "URL"}</label>
              <Input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder={form.type === "gsheet" ? "https://docs.google.com/spreadsheets/d/.../edit#gid=0" : "https://example.com/rates.csv"} />
              {form.type === "gsheet" && <p className="text-[10px] text-muted-foreground mt-1">Sheet must be "anyone with link → viewer". CSV export URL is derived automatically.</p>}
            </div>
          )}
          {form.type !== "escalation" && (
            <>
              <div>
                <label className="text-xs font-medium">Default State (fallback)</label>
                <Select value={form.defaultState || "_none"} onValueChange={v => setForm(f => ({ ...f, defaultState: v === "_none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None</SelectItem>
                    {STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium">Default Source Label</label>
                <Select value={form.defaultSource} onValueChange={v => setForm(f => ({ ...f, defaultSource: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium">Default Effective Year</label>
                <Input type="number" value={form.defaultEffectiveYear} onChange={e => setForm(f => ({ ...f, defaultEffectiveYear: e.target.value }))} />
              </div>
            </>
          )}
          {form.type === "escalation" && (
            <>
              <div>
                <label className="text-xs font-medium">Escalation %</label>
                <Input type="number" step="0.01" value={form.escalationPct} onChange={e => setForm(f => ({ ...f, escalationPct: e.target.value }))} placeholder="e.g. 5" />
              </div>
              <div>
                <label className="text-xs font-medium">Filter Trade (optional)</label>
                <Select value={form.escalationFilterTrade || "_all"} onValueChange={v => setForm(f => ({ ...f, escalationFilterTrade: v === "_all" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All trades</SelectItem>
                    {TRADES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium">Filter State (optional)</label>
                <Select value={form.escalationFilterState || "_all"} onValueChange={v => setForm(f => ({ ...f, escalationFilterState: v === "_all" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All states</SelectItem>
                    {STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium">From Year</label>
                <Input type="number" value={form.escalationFromYear} onChange={e => setForm(f => ({ ...f, escalationFromYear: e.target.value }))} placeholder={String(new Date().getFullYear() - 1)} />
              </div>
              <div>
                <label className="text-xs font-medium">To Year</label>
                <Input type="number" value={form.escalationToYear} onChange={e => setForm(f => ({ ...f, escalationToYear: e.target.value }))} placeholder={String(new Date().getFullYear())} />
              </div>
              <div className="col-span-2 text-[10px] text-muted-foreground">
                If <em>From</em> and <em>To</em> differ, escalated rates are <strong>inserted</strong> under the new year. Otherwise, existing rates are updated in place.
              </div>
            </>
          )}
        </div>
        <DialogFooter className="mt-3">
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button onClick={submit} disabled={pending}>{existing ? "Save" : "Add Source"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkUploadButton() {
  const ref = useRef<HTMLInputElement>(null);
  const bulk = useBulkUpsertDsrRates();
  const qc = useQueryClient();
  const { toast } = useToast();

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const rows = result.data as any[];
        if (!rows.length) { toast({ title: "Empty CSV", variant: "destructive" }); return; }
        bulk.mutate(
          { data: { rows } },
          {
            onSuccess: (r) => {
              qc.invalidateQueries({ queryKey: getListDsrRatesQueryKey({}) });
              toast({ title: "Upload complete", description: `${r.inserted} inserted, ${r.updated} updated, ${r.skipped} skipped` });
            },
            onError: (err: any) => toast({ title: "Upload failed", description: err?.message, variant: "destructive" }),
          },
        );
      },
      error: (err) => toast({ title: "CSV parse error", description: err.message, variant: "destructive" }),
    });
    if (ref.current) ref.current.value = "";
  };

  return (
    <>
      <input ref={ref} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
      <Button variant="outline" size="sm" onClick={() => ref.current?.click()} disabled={bulk.isPending}>
        <Upload className="h-3.5 w-3.5 mr-1" /> Bulk Upload CSV
      </Button>
    </>
  );
}

function EscalationDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ pct: "", trade: "", state: "", fromYear: "", toYear: String(new Date().getFullYear()) });
  const escalate = useEscalateDsrRates();
  const qc = useQueryClient();
  const { toast } = useToast();

  const submit = () => {
    const pct = Number(form.pct);
    if (!Number.isFinite(pct)) { toast({ title: "Enter a valid % ", variant: "destructive" }); return; }
    const data: any = { pct };
    if (form.trade) data.trade = form.trade;
    if (form.state) data.state = form.state;
    if (form.fromYear) data.fromYear = Number(form.fromYear);
    if (form.toYear) data.toYear = Number(form.toYear);
    escalate.mutate({ data }, {
      onSuccess: (r) => {
        qc.invalidateQueries({ queryKey: getListDsrRatesQueryKey({}) });
        toast({ title: "Escalation applied", description: `${r.inserted} inserted, ${r.updated} updated${r.errors.length ? ` (${r.errors[0]})` : ""}` });
        setOpen(false);
      },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><TrendingUp className="h-3.5 w-3.5 mr-1" /> Apply Escalation</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Apply Annual Escalation</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
          <div className="col-span-2">
            <label className="text-xs font-medium">Escalation %</label>
            <Input type="number" step="0.01" value={form.pct} onChange={e => setForm(f => ({ ...f, pct: e.target.value }))} placeholder="e.g. 5" />
          </div>
          <div>
            <label className="text-xs font-medium">Trade (optional)</label>
            <Select value={form.trade || "_all"} onValueChange={v => setForm(f => ({ ...f, trade: v === "_all" ? "" : v }))}>
              <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All trades</SelectItem>
                {TRADES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium">State (optional)</label>
            <Select value={form.state || "_all"} onValueChange={v => setForm(f => ({ ...f, state: v === "_all" ? "" : v }))}>
              <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All states</SelectItem>
                {STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium">From Year</label>
            <Input type="number" value={form.fromYear} onChange={e => setForm(f => ({ ...f, fromYear: e.target.value }))} placeholder="any" />
          </div>
          <div>
            <label className="text-xs font-medium">To Year</label>
            <Input type="number" value={form.toYear} onChange={e => setForm(f => ({ ...f, toYear: e.target.value }))} />
          </div>
          <p className="col-span-2 text-[10px] text-muted-foreground">If <em>To Year</em> differs from matched rates, escalated copies are inserted under the new year. Otherwise rates are updated in place.</p>
        </div>
        <DialogFooter className="mt-3">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={escalate.isPending}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SourceRow({ src }: { src: RateSource }) {
  const sync = useSyncRateSource();
  const del = useDeleteRateSource();
  const qc = useQueryClient();
  const { toast } = useToast();

  const doSync = () => {
    sync.mutate({ id: src.id }, {
      onSuccess: (r) => {
        qc.invalidateQueries({ queryKey: getListRateSourcesQueryKey() });
        qc.invalidateQueries({ queryKey: getListDsrRatesQueryKey({}) });
        const note = `${r.inserted} new, ${r.updated} updated, ${r.skipped} skipped`;
        if (r.errors.length) toast({ title: "Sync partial", description: `${note}. First error: ${r.errors[0]}`, variant: "destructive" });
        else toast({ title: "Sync complete", description: note });
      },
      onError: (e: any) => toast({ title: "Sync failed", description: e?.message, variant: "destructive" }),
    });
  };

  const remove = () => {
    if (!confirm(`Delete source "${src.label}"?`)) return;
    del.mutate({ id: src.id }, {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getListRateSourcesQueryKey() }); toast({ title: "Source deleted" }); },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    });
  };

  return (
    <tr className="border-b last:border-0 hover:bg-muted/30">
      <td className="py-2 px-2">
        <div className="text-sm font-medium">{src.label}</div>
        {src.url && <div className="text-[10px] text-muted-foreground truncate max-w-[280px]">{src.url}</div>}
      </td>
      <td className="py-2 px-2"><Badge variant="outline" className="text-[10px] capitalize">{src.type}</Badge></td>
      <td className="py-2 px-2 text-center">
        {src.enabled
          ? <CheckCircle2 className="h-4 w-4 text-emerald-600 inline" />
          : <X className="h-4 w-4 text-muted-foreground inline" />}
      </td>
      <td className="py-2 px-2 text-xs text-muted-foreground">{relativeTime(src.lastSyncAt)}</td>
      <td className="py-2 px-2 text-xs tabular-nums">
        <span className="text-emerald-700">+{src.lastSyncRowsInserted}</span>{" "}
        <span className="text-blue-700">~{src.lastSyncRowsUpdated}</span>{" "}
        {src.lastSyncRowsSkipped > 0 && <span className="text-amber-700">×{src.lastSyncRowsSkipped}</span>}
      </td>
      <td className="py-2 px-2"><StatusBadge status={src.lastSyncStatus} /></td>
      <td className="py-2 px-2">
        <div className="flex items-center gap-1 justify-end">
          <Button size="sm" variant="ghost" onClick={doSync} disabled={sync.isPending} title="Sync Now">
            <RefreshCw className={`h-3.5 w-3.5 ${sync.isPending ? "animate-spin" : ""}`} />
          </Button>
          <SourceDialog existing={src} trigger={<Button size="sm" variant="ghost" title="Edit"><Edit2 className="h-3.5 w-3.5" /></Button>} />
          <Button size="sm" variant="ghost" onClick={remove} disabled={del.isPending} title="Delete">
            <Trash2 className="h-3.5 w-3.5 text-rose-600" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function RateSourcesPanel() {
  const { data: sources = [], isLoading } = useListRateSources({ query: { enabled: true } as any });
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Cloud className="h-4 w-4 text-primary" /> Auto-sync Sources
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Pull rates from CSV/JSON URLs or Google Sheets, or apply annual escalation. Runs nightly at 2 AM.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BulkUploadButton />
          <EscalationDialog />
          <SourceDialog trigger={<Button size="sm"><Plus className="h-3.5 w-3.5 mr-1" /> Add Source</Button>} />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-2">{[1,2].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : sources.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No sources configured. Add one to enable nightly auto-sync.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase text-muted-foreground border-b bg-muted/30">
                <tr>
                  <th className="text-left py-2 px-2">Source</th>
                  <th className="text-left py-2 px-2">Type</th>
                  <th className="text-center py-2 px-2">On</th>
                  <th className="text-left py-2 px-2">Last Sync</th>
                  <th className="text-left py-2 px-2">Rows</th>
                  <th className="text-left py-2 px-2">Status</th>
                  <th className="text-right py-2 px-2 w-32">Actions</th>
                </tr>
              </thead>
              <tbody>{sources.map(s => <SourceRow key={s.id} src={s} />)}</tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SyncBanner({ sources }: { sources: RateSource[] }) {
  const recent = sources
    .filter(s => s.lastSyncAt && Date.now() - new Date(s.lastSyncAt).getTime() < 24 * 3600 * 1000)
    .sort((a, b) => new Date(b.lastSyncAt!).getTime() - new Date(a.lastSyncAt!).getTime());
  if (recent.length === 0) return null;
  const top = recent[0];
  const totalNew = recent.reduce((s, r) => s + r.lastSyncRowsInserted, 0);
  const totalUpd = recent.reduce((s, r) => s + r.lastSyncRowsUpdated, 0);
  const hasError = recent.some(r => r.lastSyncStatus === "error" || r.lastSyncStatus === "partial");
  return (
    <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-md border ${hasError ? "bg-amber-50 border-amber-200 text-amber-900" : "bg-emerald-50 border-emerald-200 text-emerald-900"}`}>
      {hasError ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
      <span>
        Last auto-sync ({top.label}, {relativeTime(top.lastSyncAt)}): <strong>{totalNew} new</strong>, <strong>{totalUpd} updated</strong> across {recent.length} source{recent.length === 1 ? "" : "s"}.
      </span>
    </div>
  );
}

export default function DsrRatesPage() {
  const [q, setQ] = useState("");
  const [filterTrade, setFilterTrade] = useState("all");
  const [filterState, setFilterState] = useState("all");
  const [filterTier, setFilterTier] = useState("all");
  const { data: profile } = useGetMyProfile();
  const role = profile?.role;
  const canManageSources = role === "admin" || role === "owner" || role === "qs";
  const canDeleteRates = role === "admin" || role === "owner";
  const { data: rates = [], isLoading } = useListDsrRates({ q: q || undefined, trade: filterTrade !== "all" ? filterTrade : undefined, state: filterState !== "all" ? filterState : undefined, cityTier: filterTier !== "all" ? filterTier : undefined });
  const { data: sources = [] } = useListRateSources({ query: { enabled: canManageSources } as any });

  const tradeGroups = useMemo(() => {
    const g: Record<string, number> = {};
    for (const r of rates) g[r.trade] = (g[r.trade] ?? 0) + 1;
    return Object.entries(g).sort((a, b) => b[1] - a[1]);
  }, [rates]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <BookOpen className="h-7 w-7 text-primary" /> DSR / SSR Rate Library
          </h1>
          <p className="text-muted-foreground mt-1">Searchable rate database — editable by QS. Rates auto-populate estimation forms.</p>
        </div>
        <NewRateDialog />
      </div>

      {sources.length > 0 && <SyncBanner sources={sources} />}

      {canManageSources && <RateSourcesPanel />}

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search description or code…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Select value={filterTrade} onValueChange={setFilterTrade}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All trades" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All trades</SelectItem>
            {TRADES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterState} onValueChange={setFilterState}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All states" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All states</SelectItem>
            {STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterTier} onValueChange={setFilterTier}>
          <SelectTrigger className="w-28"><SelectValue placeholder="All tiers" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tiers</SelectItem>
            {CITY_TIERS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{rates.length}</span> rates
        {tradeGroups.slice(0, 4).map(([t, c]) => <span key={t} className="text-xs bg-muted px-2 py-0.5 rounded">{t}: {c}</span>)}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : rates.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">No rates found. Adjust filters or add new rates.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase text-muted-foreground border-b bg-muted/30">
                  <tr>
                    <th className="text-left py-2 px-2">Code</th>
                    <th className="text-left py-2 px-2">Description</th>
                    <th className="text-left py-2 px-2">Trade</th>
                    <th className="text-center py-2 px-2">Unit</th>
                    <th className="text-left py-2 px-2">State</th>
                    <th className="text-center py-2 px-2">Tier</th>
                    <th className="text-right py-2 px-2">Rate ₹</th>
                    <th className="text-center py-2 px-2">Year</th>
                    <th className="text-left py-2 px-2">Source</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {rates.map(r => <RateRow key={r.id} rate={r} canDelete={canDeleteRates} />)}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
