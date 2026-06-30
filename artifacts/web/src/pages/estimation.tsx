import { useState } from "react";
import { useParams } from "wouter";
import {
  useListProjectEstimates,
  useCreateEstimate,
  useUpdateEstimate,
  useListEstimateCostHeads,
  useReplaceEstimateCostHeads,
  useListBoqItems,
  useCreateBoqItem,
  useUpdateBoqItem,
  useDeleteBoqItem,
  useListRateAnalysisComponents,
  useReplaceRateAnalysisComponents,
  useListDsrRates,
  useGenerateAbstractBoqItems,
  useListWorkOrders,
  useCreateWorkOrder,
  useListWorkOrderItems,
  useReplaceWorkOrderItems,
  getListProjectEstimatesQueryKey,
  getListEstimateCostHeadsQueryKey,
  getListBoqItemsQueryKey,
  getListRateAnalysisComponentsQueryKey,
  getListWorkOrdersQueryKey,
  getListWorkOrderItemsQueryKey,
  useGetMyProfile,
  useGetOrgSubscription,
} from "@workspace/api-client-react";
import { FeatureGate } from "@/components/feature-gate";
import type { Estimate, EstimateCostHead, BoqItem } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatINR } from "@/lib/ocms-format";
import {
  Plus, ChevronRight, FileBarChart, Layers, Calculator,
  ClipboardList, Wrench, AlertTriangle, Lock, Unlock, Edit3, Check, X, Download, Upload, Trash2, Search,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

const LEVEL_ICONS: Record<string, any> = {
  L0: FileBarChart, L1: Layers, L2: ClipboardList, L3: ClipboardList, L4: Calculator, L5: Wrench,
};

const LEVEL_LABELS: Record<string, string> = {
  L0: "Concept Estimate",
  L1: "Preliminary Cost Plan",
  L2: "Abstract Estimate",
  L3: "Detailed BOQ",
  L4: "Rate Analysis",
  L5: "Work Order Estimate",
};

const LEVEL_COLORS = ["#4f46e5","#0891b2","#0d9488","#16a34a","#ca8a04","#dc2626"];

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  submitted: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  locked: "bg-rose-100 text-rose-700",
};

const L1_HEADS_COLORS = ["#4f46e5","#0891b2","#0d9488","#16a34a","#ca8a04","#dc2626","#7c3aed","#db2777","#2563eb","#d97706"];
const TRADES = ["Earthwork","RCC","Masonry","Plaster","Flooring","Tiling","Waterproofing","Painting","MEP-Electrical","MEP-Plumbing","MEP-HVAC","Facade","Structural Steel","Piling","Roads","External Works","Landscaping","Prelims"];
const COMP_TYPES = ["material","labour","plant","overhead"];
const PROJECT_TYPES = ["Residential","Commercial","Institutional","Industrial","Infrastructure","Mixed-Use"];
const CITY_TIERS = ["T1","T2","T3"];
const FINISHING_GRADES = ["Standard","Premium","Luxury"] as const;
const FINISHING_MULTIPLIER: Record<string, number> = { Standard: 1.0, Premium: 1.25, Luxury: 1.60 };

// Benchmark base rates per sqm by project type + city tier (INR/sqm) — multiply by FINISHING_MULTIPLIER
const BENCHMARK_RATES: Record<string, Record<string, number>> = {
  Residential:    { T1: 22000, T2: 18000, T3: 14000 },
  Commercial:     { T1: 28000, T2: 22000, T3: 18000 },
  Institutional:  { T1: 25000, T2: 20000, T3: 16000 },
  Industrial:     { T1: 18000, T2: 14000, T3: 11000 },
  Infrastructure: { T1: 35000, T2: 28000, T3: 22000 },
  "Mixed-Use":    { T1: 26000, T2: 21000, T3: 17000 },
};

function LockToggleButton({ estimate }: { estimate: Estimate }) {
  const updateEstimate = useUpdateEstimate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const isLocked = estimate.status === "locked";
  const canLock = ["L2", "L3", "L4"].includes(estimate.level);
  if (!canLock) return null;

  const toggle = () => {
    const newStatus = isLocked ? "draft" : "locked";
    updateEstimate.mutate(
      { estimateId: estimate.id, data: { status: newStatus } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListProjectEstimatesQueryKey(estimate.projectId) });
          toast({ title: isLocked ? "Estimate unlocked — BOQ editable" : "Estimate locked post-award — VO required to modify" });
        },
        onError: (e: any) => {
          const msg = (e?.body?.error ?? e?.message) as string | undefined;
          toast({ title: isLocked ? "Cannot unlock" : "Cannot lock", description: msg ?? "Unknown error", variant: "destructive" });
        },
      },
    );
  };

  return (
    <Button
      size="sm"
      variant={isLocked ? "outline" : "secondary"}
      onClick={toggle}
      disabled={updateEstimate.isPending}
      className={isLocked ? "border-rose-300 text-rose-700 hover:bg-rose-50" : ""}
    >
      {isLocked ? <Unlock className="h-3.5 w-3.5 mr-1" /> : <Lock className="h-3.5 w-3.5 mr-1" />}
      {isLocked ? "Unlock" : "Lock Post-Award"}
    </Button>
  );
}

function NewEstimateDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState("L1");
  const [name, setName] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();
  const createEstimate = useCreateEstimate();

  const submit = () => {
    if (!name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    createEstimate.mutate(
      { projectId, data: { level: level as any, name, totalAmount: totalAmount ? Number(totalAmount) : 0 } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListProjectEstimatesQueryKey(projectId) });
          toast({ title: "Estimate created" });
          setOpen(false); setName(""); setTotalAmount("");
        },
        onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-1" /> New Estimate</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create Estimate</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <label className="text-sm font-medium mb-1 block">Level</label>
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(LEVEL_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{k} — {v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Name</label>
            <Input placeholder={`e.g. ${LEVEL_LABELS[level]} Rev 1`} value={name} onChange={e => setName(e.target.value)} />
          </div>
          {level !== "L0" && (
            <div>
              <label className="text-sm font-medium mb-1 block">Total Amount (₹) <span className="text-muted-foreground font-normal">— optional seed value</span></label>
              <Input type="number" placeholder="0" value={totalAmount} onChange={e => setTotalAmount(e.target.value)} />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={createEstimate.isPending}>Create</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function L0Panel({ estimate }: { estimate: Estimate }) {
  const meta = (estimate.metadata as any) ?? {};
  const updateEstimate = useUpdateEstimate();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    projectType: meta.projectType ?? "Residential",
    cityTier: meta.cityTier ?? "T1",
    finishingGrade: (meta.finishingGrade ?? "Standard") as string,
    builtUpArea: String(meta.builtUpArea ?? ""),
    floors: String(meta.floors ?? ""),
    benchmarkRate: String(meta.benchmarkRate ?? ""),
  });

  const baseRate = BENCHMARK_RATES[form.projectType]?.[form.cityTier] ?? 22000;
  const finishingMult = FINISHING_MULTIPLIER[form.finishingGrade] ?? 1.0;
  const computedRate = form.benchmarkRate
    ? Number(form.benchmarkRate)
    : Math.round(baseRate * finishingMult);
  const bua = Number(form.builtUpArea) || 0;
  const total = bua * computedRate;

  const handleSave = () => {
    updateEstimate.mutate(
      {
        estimateId: estimate.id,
        data: {
          totalAmount: total,
          metadata: {
            projectType: form.projectType,
            cityTier: form.cityTier,
            finishingGrade: form.finishingGrade,
            builtUpArea: bua,
            floors: Number(form.floors) || 0,
            benchmarkRate: computedRate,
          },
        },
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListProjectEstimatesQueryKey(estimate.projectId) });
          toast({ title: "Concept estimate saved" });
          setEditing(false);
        },
        onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
      },
    );
  };

  const displayTotal = estimate.totalAmount > 0 ? estimate.totalAmount : total;
  const displayRate = meta.benchmarkRate ?? computedRate;
  const displayBUA = meta.builtUpArea ?? bua;
  const ranges = [
    { label: "Conservative (−15%)", value: displayTotal * 0.85 },
    { label: "Median", value: displayTotal },
    { label: "Optimistic (+15%)", value: displayTotal * 1.15 },
  ];
  const breakdown = [
    { name: "Civil & Structure", pct: 40 },
    { name: "Finishing & MEP", pct: 35 },
    { name: "Prelims & Fees", pct: 15 },
    { name: "Contingency", pct: 10 },
  ].map(d => ({ ...d, value: displayTotal * d.pct / 100 }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">5-input concept estimate — enter project parameters to compute the order-of-magnitude cost.</p>
        <Button size="sm" variant="outline" onClick={() => setEditing(!editing)}>
          <Edit3 className="h-3.5 w-3.5 mr-1" /> {editing ? "Cancel" : "Edit Inputs"}
        </Button>
      </div>

      {editing && (
        <Card className="border-primary/30 bg-primary/3">
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium mb-1 block">Project Type</label>
                <Select value={form.projectType} onValueChange={v => setForm(f => ({ ...f, projectType: v, benchmarkRate: "" }))}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{PROJECT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">City Tier</label>
                <Select value={form.cityTier} onValueChange={v => setForm(f => ({ ...f, cityTier: v, benchmarkRate: "" }))}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{CITY_TIERS.map(t => <SelectItem key={t} value={t}>Tier {t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Finishing Grade</label>
                <Select value={form.finishingGrade} onValueChange={v => setForm(f => ({ ...f, finishingGrade: v, benchmarkRate: "" }))}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Standard">Standard (1×)</SelectItem>
                    <SelectItem value="Premium">Premium (1.25×)</SelectItem>
                    <SelectItem value="Luxury">Luxury (1.6×)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Built-Up Area (sqm)</label>
                <Input className="h-8" type="number" placeholder="e.g. 12000" value={form.builtUpArea} onChange={e => setForm(f => ({ ...f, builtUpArea: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Number of Floors</label>
                <Input className="h-8" type="number" placeholder="e.g. 18" value={form.floors} onChange={e => setForm(f => ({ ...f, floors: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">
                  Benchmark Rate (₹/sqm)
                  <span className="text-muted-foreground font-normal ml-1">— leave blank to use preset: {formatINR(Math.round(baseRate * finishingMult))}</span>
                </label>
                <Input className="h-8" type="number" placeholder={String(Math.round(baseRate * finishingMult))} value={form.benchmarkRate} onChange={e => setForm(f => ({ ...f, benchmarkRate: e.target.value }))} />
              </div>
              <div className="flex flex-col justify-end">
                <div className="text-xs text-muted-foreground mb-1">Computed Total</div>
                <div className="text-xl font-bold text-primary">{formatINR(total)}</div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={updateEstimate.isPending || bua === 0}>
                <Check className="h-3.5 w-3.5 mr-1" /> Save & Compute
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm">Cost Range</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {ranges.map((r, i) => (
              <div key={r.label} className={`p-3 rounded-lg border-2 ${i === 1 ? "border-primary bg-primary/5" : "border-border"}`}>
                <div className="text-xs text-muted-foreground">{r.label}</div>
                <div className={`text-2xl font-bold ${i === 1 ? "text-primary" : ""}`}>{formatINR(r.value)}</div>
                {displayBUA > 0 && <div className="text-xs text-muted-foreground">{formatINR(r.value / displayBUA)} / sqm</div>}
              </div>
            ))}
            <div className="text-xs text-muted-foreground pt-2 border-t space-y-1">
              {meta.projectType && <div>Type: <span className="font-medium">{meta.projectType}</span></div>}
              {meta.cityTier && <div>City tier: <span className="font-medium">T{meta.cityTier}</span></div>}
              {meta.finishingGrade && <div>Finishing: <span className="font-medium">{meta.finishingGrade}</span></div>}
              {displayBUA > 0 && <div>BUA: <span className="font-medium">{displayBUA.toLocaleString()} sqm · {formatINR(displayRate)}/sqm</span></div>}
              {meta.floors && <div>Floors: <span className="font-medium">{meta.floors}</span></div>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Cost Breakdown</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={breakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, pct }) => `${name} ${pct}%`}>
                  {breakdown.map((_, i) => <Cell key={i} fill={LEVEL_COLORS[i % LEVEL_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => formatINR(v)} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function L1Panel({ estimate }: { estimate: Estimate }) {
  const { data: heads = [], isLoading } = useListEstimateCostHeads(estimate.id);
  const replaceHeads = useReplaceEstimateCostHeads();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Record<string, { pct: string; amount: string }>>({});
  const total = estimate.totalAmount;

  const handlePctChange = (id: string, pct: string) => {
    const p = parseFloat(pct) || 0;
    setEditing(prev => ({ ...prev, [id]: { pct, amount: String((total * p / 100).toFixed(2)) } }));
  };

  const save = () => {
    const updated = heads.map(h => {
      const e = editing[h.id];
      return { headCode: h.headCode, headName: h.headName, percentage: parseFloat(e?.pct ?? String(h.percentage)), amount: parseFloat(e?.amount ?? String(h.amount)) };
    });
    replaceHeads.mutate(
      { estimateId: estimate.id, data: updated },
      {
        onSuccess: () => { setEditing({}); qc.invalidateQueries({ queryKey: getListEstimateCostHeadsQueryKey(estimate.id) }); toast({ title: "Saved" }); },
        onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
      },
    );
  };

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  const chartData = heads.map(h => ({ name: h.headName, value: h.amount }));
  const totalPct = heads.reduce((s, h) => s + (parseFloat(editing[h.id]?.pct ?? String(h.percentage)) || 0), 0);

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-1">
        <div className="grid grid-cols-12 gap-2 text-xs uppercase text-muted-foreground font-medium py-1 px-2">
          <div className="col-span-5">Cost Head</div>
          <div className="col-span-3 text-right">%</div>
          <div className="col-span-4 text-right">Amount (₹)</div>
        </div>
        {heads.map((h) => {
          const e = editing[h.id];
          return (
            <div key={h.id} className="grid grid-cols-12 gap-2 items-center py-1.5 px-2 rounded hover:bg-muted/40">
              <div className="col-span-5 text-sm font-medium">{h.headName}</div>
              <div className="col-span-3">
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    className="h-7 text-right text-sm"
                    value={e?.pct ?? String(h.percentage)}
                    onChange={ev => handlePctChange(h.id, ev.target.value)}
                  />
                  <span className="text-muted-foreground text-xs">%</span>
                </div>
              </div>
              <div className="col-span-4 text-right text-sm tabular-nums">
                {formatINR(parseFloat(e?.amount ?? String(h.amount)) || 0)}
              </div>
            </div>
          );
        })}
        <div className="grid grid-cols-12 gap-2 py-2 px-2 border-t font-bold text-sm">
          <div className="col-span-5">Total</div>
          <div className={`col-span-3 text-right ${Math.abs(totalPct - 100) > 0.5 ? "text-rose-600" : "text-emerald-700"}`}>{totalPct.toFixed(1)}%</div>
          <div className="col-span-4 text-right">{formatINR(total)}</div>
        </div>
        {Object.keys(editing).length > 0 && (
          <Button size="sm" onClick={save} disabled={replaceHeads.isPending} className="mt-2">
            <Check className="h-3 w-3 mr-1" /> Save Changes
          </Button>
        )}
      </div>
      <Card>
        <CardHeader><CardTitle className="text-xs">Distribution</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}>
                {chartData.map((_, i) => <Cell key={i} fill={L1_HEADS_COLORS[i % L1_HEADS_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: any) => formatINR(v)} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function BoqPanel({ estimate }: { estimate: Estimate }) {
  const { data: items = [], isLoading } = useListBoqItems(estimate.id);
  const { data: profile } = useGetMyProfile();
  const orgId = profile?.organisationId ?? "";
  const { data: subData } = useGetOrgSubscription(orgId, { query: { enabled: !!orgId } } as any);
  const planFeatures = (subData?.plan?.features ?? {}) as Record<string, boolean | string>;
  const hasAdvancedEstimations = planFeatures.advanced_estimations === true || planFeatures.advanced_estimations === "true";
  const [newRow, setNewRow] = useState<any>(null);
  const [raItem, setRaItem] = useState<BoqItem | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [dsrSearch, setDsrSearch] = useState("");
  const createItem = useCreateBoqItem();
  const updateItem = useUpdateBoqItem();
  const deleteItem = useDeleteBoqItem();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: dsrResults = [] } = useListDsrRates(
    { q: dsrSearch, trade: newRow?.trade },
    { query: { enabled: dsrSearch.length >= 2 } as any },
  );

  const startEdit = (item: BoqItem) => {
    setEditingId(item.id);
    setEditForm({
      description: item.description,
      unit: item.unit,
      quantity: String(item.quantity),
      rate: String(item.rate),
      trade: item.trade,
    });
  };

  const saveEdit = (itemId: string) => {
    updateItem.mutate(
      { itemId, data: { description: editForm.description, unit: editForm.unit, quantity: Number(editForm.quantity), rate: Number(editForm.rate) } },
      {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListBoqItemsQueryKey(estimate.id) }); setEditingId(null); toast({ title: "Item updated" }); },
        onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
      },
    );
  };

  const confirmDelete = (itemId: string) => {
    deleteItem.mutate(
      { itemId },
      {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListBoqItemsQueryKey(estimate.id) }); toast({ title: "Item deleted" }); },
        onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
      },
    );
  };

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  const locked = estimate.status === "locked";
  const groupedByTrade = items.reduce<Record<string, BoqItem[]>>((acc, i) => {
    (acc[i.trade] ||= []).push(i);
    return acc;
  }, {});
  const total = items.reduce((s, i) => s + i.amount, 0);

  const addItem = () => {
    if (!newRow?.description || !newRow?.unit || !newRow?.trade) {
      toast({ title: "Description, unit and trade required", variant: "destructive" }); return;
    }
    createItem.mutate(
      { estimateId: estimate.id, data: { ...newRow, quantity: Number(newRow.quantity || 0), rate: Number(newRow.rate || 0), levelType: estimate.level as "L2" | "L3" } },
      {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListBoqItemsQueryKey(estimate.id) }); setNewRow(null); toast({ title: "Item added" }); },
        onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
      },
    );
  };

  const handleExport = () => {
    window.open(`/api/estimates/${estimate.id}/boq-items/export`, "_blank");
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`/api/estimates/${estimate.id}/boq-items/import`, { method: "POST", body: fd });
      if (!res.ok) { const err = await res.json(); toast({ title: "Import failed", description: err?.error, variant: "destructive" }); return; }
      const imported: any[] = await res.json();
      qc.invalidateQueries({ queryKey: getListBoqItemsQueryKey(estimate.id) });
      toast({ title: `Imported ${imported.length} BOQ items` });
    } catch {
      toast({ title: "Import error", description: "Could not parse file", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {items.length} items · Total: <span className="font-bold text-foreground">{formatINR(total)}</span>
          {estimate.level === "L3" && <span className="ml-2 text-xs">(excl. GST)</span>}
          {locked && <span className="ml-2 inline-flex items-center gap-1 text-rose-600 text-xs"><Lock className="h-3 w-3" />Locked — VO required to modify scope</span>}
        </div>
        <div className="flex gap-2">
          <FeatureGate hasAccess={hasAdvancedEstimations} featureName="BOQ Excel Export" planRequired="Professional">
            <Button size="sm" variant="outline" onClick={handleExport}>
              <Download className="h-3.5 w-3.5 mr-1" /> Export Excel
            </Button>
          </FeatureGate>
          {!locked && (
            <FeatureGate hasAccess={hasAdvancedEstimations} featureName="BOQ Excel Import" planRequired="Professional">
              <label>
                <input type="file" accept=".xlsx" className="sr-only" onChange={handleImport} />
                <Button size="sm" variant="outline" asChild>
                  <span className="cursor-pointer"><Upload className="h-3.5 w-3.5 mr-1" /> Import Excel</span>
                </Button>
              </label>
            </FeatureGate>
          )}
          {!locked && (
            <Button size="sm" variant="outline" onClick={() => setNewRow({ trade: TRADES[0], description: "", unit: "sqm", quantity: "0", rate: "0", hsnCode: "", gstRate: "18" })}>
              <Plus className="h-3 w-3 mr-1" /> Add Item
            </Button>
          )}
        </div>
      </div>

      {newRow && (
        <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
          <div className="grid grid-cols-12 gap-2">
            <Select value={newRow.trade} onValueChange={v => setNewRow((r: any) => ({ ...r, trade: v }))}>
              <SelectTrigger className="col-span-2 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>{TRADES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
            <div className="col-span-4 relative">
              <Input className="h-8 text-xs pr-6" placeholder="Description or search DSR…" value={newRow.description} onChange={e => { setNewRow((r: any) => ({ ...r, description: e.target.value })); setDsrSearch(e.target.value); }} />
              <Search className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            </div>
            <Input className="col-span-1 h-8 text-xs" placeholder="Unit" value={newRow.unit} onChange={e => setNewRow((r: any) => ({ ...r, unit: e.target.value }))} />
            <Input className="col-span-1 h-8 text-xs text-right" type="number" placeholder="Qty" value={newRow.quantity} onChange={e => setNewRow((r: any) => ({ ...r, quantity: e.target.value }))} />
            <Input className="col-span-2 h-8 text-xs text-right" type="number" placeholder="Rate ₹" value={newRow.rate} onChange={e => setNewRow((r: any) => ({ ...r, rate: e.target.value }))} />
            <div className="col-span-2 flex gap-1">
              <Button size="sm" className="h-8 flex-1" onClick={addItem}><Check className="h-3 w-3" /></Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => { setNewRow(null); setDsrSearch(""); }}><X className="h-3 w-3" /></Button>
            </div>
          </div>
          {dsrResults.length > 0 && (
            <div className="border rounded bg-background shadow-sm max-h-40 overflow-y-auto">
              <div className="text-[10px] text-muted-foreground px-2 py-1 border-b font-medium uppercase tracking-wide">DSR/SSR — click to auto-fill</div>
              {dsrResults.slice(0, 8).map(d => (
                <button
                  key={d.id}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/60 border-b last:border-0 flex items-center justify-between gap-2"
                  onClick={() => { setNewRow((r: any) => ({ ...r, description: d.description, unit: d.unit, rate: String(d.rate) })); setDsrSearch(""); }}
                >
                  <span className="flex-1 truncate">{d.code} — {d.description}</span>
                  <span className="text-muted-foreground shrink-0">{d.unit} · {formatINR(Number(d.rate))}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {Object.entries(groupedByTrade).map(([trade, tradeItems]) => (
        <div key={trade}>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-1 border-b mb-1">{trade}</div>
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="text-left pb-1 w-8">#</th>
                <th className="text-left pb-1">Description</th>
                <th className="text-right pb-1 w-16">Unit</th>
                <th className="text-right pb-1 w-20">Qty</th>
                <th className="text-right pb-1 w-24">Rate ₹</th>
                <th className="text-right pb-1 w-28">Amount ₹</th>
                {estimate.level === "L3" && <th className="text-right pb-1 w-16">GST%</th>}
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {tradeItems.map((item, idx) => {
                const isEditing = editingId === item.id;
                return isEditing ? (
                  <tr key={item.id} className="border-b last:border-0 bg-primary/5">
                    <td className="py-1 text-muted-foreground text-xs">{idx + 1}</td>
                    <td className="py-1">
                      <Input className="h-7 text-xs" value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
                    </td>
                    <td className="py-1 text-right">
                      <Input className="h-7 text-xs w-16 text-right" value={editForm.unit} onChange={e => setEditForm(f => ({ ...f, unit: e.target.value }))} />
                    </td>
                    <td className="py-1 text-right">
                      <Input className="h-7 text-xs w-20 text-right" type="number" value={editForm.quantity} onChange={e => setEditForm(f => ({ ...f, quantity: e.target.value }))} />
                    </td>
                    <td className="py-1 text-right">
                      <Input className="h-7 text-xs w-24 text-right" type="number" value={editForm.rate} onChange={e => setEditForm(f => ({ ...f, rate: e.target.value }))} />
                    </td>
                    <td className="py-1 text-right tabular-nums font-medium text-xs text-muted-foreground">
                      {formatINR((Number(editForm.quantity) || 0) * (Number(editForm.rate) || 0))}
                    </td>
                    {estimate.level === "L3" && <td className="py-1 text-right">{item.gstRate}%</td>}
                    <td className="py-1 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => saveEdit(item.id)} className="text-emerald-600 hover:text-emerald-700" title="Save"><Check className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground" title="Cancel"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30 group">
                    <td className="py-1 text-muted-foreground text-xs">{idx + 1}</td>
                    <td className="py-1">
                      <div>{item.description}</div>
                      {item.itemCode && <div className="text-[10px] text-muted-foreground">{item.itemCode} {item.hsnCode && `· HSN ${item.hsnCode}`}</div>}
                    </td>
                    <td className="py-1 text-right">{item.unit}</td>
                    <td className="py-1 text-right tabular-nums">{item.quantity.toLocaleString()}</td>
                    <td className="py-1 text-right tabular-nums">{formatINR(item.rate)}</td>
                    <td className="py-1 text-right tabular-nums font-medium">{formatINR(item.amount)}</td>
                    {estimate.level === "L3" && <td className="py-1 text-right">{item.gstRate}%</td>}
                    <td className="py-1 text-right">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                        {item.locked && <Lock className="h-3 w-3 text-rose-500" />}
                        {!locked && (
                          <button onClick={() => startEdit(item)} className="text-muted-foreground hover:text-primary" title="Edit row">
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button onClick={() => setRaItem(item)} className="text-muted-foreground hover:text-primary" title="Rate Analysis (L4)">
                          <Calculator className="h-3.5 w-3.5" />
                        </button>
                        {!locked && (
                          <button onClick={() => confirmDelete(item.id)} className="text-muted-foreground hover:text-rose-600" title="Delete row">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {raItem && <RateAnalysisModal item={raItem} onClose={() => setRaItem(null)} />}
    </div>
  );
}

function RateAnalysisModal({ item, onClose }: { item: BoqItem; onClose: () => void }) {
  const { data: comps = [], isLoading } = useListRateAnalysisComponents(item.id);
  const replaceComps = useReplaceRateAnalysisComponents();
  const qc = useQueryClient();
  const { toast } = useToast();
  // rows = edited state; null means use comps from server
  const [rows, setRows] = useState<any[] | null>(null);

  const displayRows = rows ?? comps.map(c => ({ ...c, quantity: String(c.quantity), marketRate: String(c.marketRate), dsrRate: String(c.dsrRate) }));

  const updateRow = (i: number, field: string, value: string) => {
    setRows(prev => {
      const base = prev ?? comps.map(c => ({ ...c, quantity: String(c.quantity), marketRate: String(c.marketRate), dsrRate: String(c.dsrRate) }));
      return base.map((r, idx) => idx === i ? { ...r, [field]: value } : r);
    });
  };

  const addRow = () => {
    setRows(prev => {
      const base = prev ?? comps.map(c => ({ ...c, quantity: String(c.quantity), marketRate: String(c.marketRate), dsrRate: String(c.dsrRate) }));
      return [...base, { componentType: "material", description: "", unit: "kg", quantity: "1", marketRate: "0", dsrRate: "0" }];
    });
  };

  const removeRow = (i: number) => {
    setRows(prev => {
      const base = prev ?? comps.map(c => ({ ...c, quantity: String(c.quantity), marketRate: String(c.marketRate), dsrRate: String(c.dsrRate) }));
      return base.filter((_, idx) => idx !== i);
    });
  };

  const handleSave = () => {
    const toSave = displayRows.map(r => ({
      componentType: r.componentType,
      description: r.description,
      unit: r.unit,
      quantity: parseFloat(r.quantity) || 0,
      marketRate: parseFloat(r.marketRate) || 0,
      dsrRate: parseFloat(r.dsrRate) || 0,
    }));
    replaceComps.mutate(
      { itemId: item.id, data: toSave },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListRateAnalysisComponentsQueryKey(item.id) });
          toast({ title: "Rate analysis saved" });
          setRows(null);
          onClose();
        },
        onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
      },
    );
  };

  const total = displayRows.reduce((s, c) => s + (parseFloat(c.quantity) || 0) * (parseFloat(c.marketRate) || 0), 0);
  const byType = COMP_TYPES.map(t => ({
    name: t,
    value: displayRows.filter(c => c.componentType === t).reduce((s, c) => s + (parseFloat(c.quantity) || 0) * (parseFloat(c.marketRate) || 0), 0),
  })).filter(d => d.value > 0);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rate Analysis (L4) — {item.description}</DialogTitle>
          <p className="text-xs text-muted-foreground">Audit-grade drill-down: material, labour, plant, overhead components per unit of work.</p>
        </DialogHeader>
        {isLoading ? <Skeleton className="h-32 w-full" /> : (
          <div className="grid md:grid-cols-4 gap-4">
            <div className="md:col-span-3 space-y-2">
              <div className="grid grid-cols-12 gap-1 text-[10px] uppercase text-muted-foreground font-medium px-1">
                <div className="col-span-2">Type</div>
                <div className="col-span-3">Description</div>
                <div className="col-span-1">Unit</div>
                <div className="col-span-1 text-right">Qty</div>
                <div className="col-span-2 text-right">Market ₹</div>
                <div className="col-span-2 text-right">DSR ₹</div>
                <div className="col-span-1 text-right">Amt ₹</div>
              </div>
              {displayRows.map((c, i) => (
                <div key={i} className="grid grid-cols-12 gap-1 items-center border-b pb-1 last:border-0">
                  <div className="col-span-2">
                    <Select value={c.componentType} onValueChange={v => updateRow(i, "componentType", v)}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{COMP_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3">
                    <Input className="h-7 text-xs" value={c.description} onChange={e => updateRow(i, "description", e.target.value)} placeholder="Description" />
                  </div>
                  <div className="col-span-1">
                    <Input className="h-7 text-xs" value={c.unit} onChange={e => updateRow(i, "unit", e.target.value)} placeholder="Unit" />
                  </div>
                  <div className="col-span-1">
                    <Input className="h-7 text-xs text-right" type="number" value={c.quantity} onChange={e => updateRow(i, "quantity", e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <Input className="h-7 text-xs text-right" type="number" value={c.marketRate} onChange={e => updateRow(i, "marketRate", e.target.value)} placeholder="0" />
                  </div>
                  <div className="col-span-2">
                    <Input className="h-7 text-xs text-right" type="number" value={c.dsrRate} onChange={e => updateRow(i, "dsrRate", e.target.value)} placeholder="0" />
                  </div>
                  <div className="col-span-1 flex items-center justify-end gap-1">
                    <span className="text-xs tabular-nums font-medium">{formatINR((parseFloat(c.quantity) || 0) * (parseFloat(c.marketRate) || 0))}</span>
                    <button onClick={() => removeRow(i)} className="text-muted-foreground hover:text-rose-500 ml-1"><X className="h-3 w-3" /></button>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between border-t pt-2 mt-1">
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={addRow}><Plus className="h-3 w-3 mr-1" /> Add Row</Button>
                  <Button size="sm" onClick={handleSave} disabled={replaceComps.isPending}>Save</Button>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Analysis Total</div>
                  <div className="font-bold">{formatINR(total)}</div>
                  <div className="text-[10px] text-muted-foreground">BOQ Rate: {formatINR(item.rate)}</div>
                  {total > 0 && item.rate > 0 && (
                    <div className={`text-[10px] font-medium ${total > item.rate * 1.05 ? "text-rose-500" : "text-emerald-600"}`}>
                      {total > item.rate * 1.05 ? "⚠ Analysis exceeds BOQ rate" : "✓ Within BOQ rate"}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div>
              <div className="text-xs font-medium mb-2 text-muted-foreground">Cost Mix</div>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={byType} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={55}>
                    {byType.map((_, i) => <Cell key={i} fill={LEVEL_COLORS[i % LEVEL_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => formatINR(v)} />
                  <Legend wrapperStyle={{ fontSize: 9 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function L5Panel({ projectId, estimates }: { projectId: string; estimates: Estimate[] }) {
  const { data: workOrders = [], isLoading: woLoading } = useListWorkOrders(projectId);
  const createWO = useCreateWorkOrder();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedWoId, setSelectedWoId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ subcontractor: "", workPackage: "", l3EstimateId: "", notes: "" });

  const l3Estimates = estimates.filter(e => e.level === "L3");
  const selectedWo = workOrders.find(w => w.id === selectedWoId) ?? (workOrders.length > 0 ? workOrders[0] : null);

  const { data: woItems = [], isLoading: itemsLoading } = useListWorkOrderItems(selectedWo?.id ?? "");
  const replaceItems = useReplaceWorkOrderItems();
  // formBoqItems: keyed on the CREATE form's l3EstimateId — always fresh at create-time
  const { data: formBoqItems = [] } = useListBoqItems(form.l3EstimateId || "");

  const [editRows, setEditRows] = useState<any[] | null>(null);

  const handleCreate = () => {
    if (!form.subcontractor.trim() || !form.workPackage.trim()) {
      toast({ title: "Sub-contractor and work package required", variant: "destructive" }); return;
    }
    createWO.mutate(
      { projectId, data: { subcontractor: form.subcontractor, workPackage: form.workPackage, l3EstimateId: form.l3EstimateId || undefined, notes: form.notes || undefined } },
      {
        onSuccess: (wo: any) => {
          qc.invalidateQueries({ queryKey: getListWorkOrdersQueryKey(projectId) });
          toast({ title: "Work order created" });
          setShowCreate(false);
          setSelectedWoId(wo.id);
          setForm({ subcontractor: "", workPackage: "", l3EstimateId: "", notes: "" });
          // Auto-populate items from L3 estimate BOQ (use formBoqItems — fetched by form.l3EstimateId, not selectedWo)
          if (form.l3EstimateId && formBoqItems.length) {
            const rows = formBoqItems.map(b => ({
              boqItemId: b.id,
              description: b.description,
              unit: b.unit,
              quantity: b.quantity,
              boqRate: b.rate,
              negotiatedRate: b.rate,
            }));
            replaceItems.mutate({ woId: wo.id, data: rows }, {
              onSuccess: () => qc.invalidateQueries({ queryKey: getListWorkOrderItemsQueryKey(wo.id) }),
            });
          }
        },
        onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
      },
    );
  };

  const displayItems = editRows ?? woItems.map(i => ({
    ...i,
    quantity: String(i.quantity),
    boqRate: String(i.boqRate),
    negotiatedRate: String(i.negotiatedRate),
  }));

  const updateItemRow = (i: number, field: string, value: string) => {
    setEditRows(prev => {
      const base = prev ?? woItems.map(i => ({ ...i, quantity: String(i.quantity), boqRate: String(i.boqRate), negotiatedRate: String(i.negotiatedRate) }));
      return base.map((r, idx) => idx === i ? { ...r, [field]: value } : r);
    });
  };

  const handleSaveItems = () => {
    if (!selectedWo) return;
    const toSave = displayItems.map(r => ({
      boqItemId: r.boqItemId ?? r.id,
      description: r.description,
      unit: r.unit,
      quantity: parseFloat(r.quantity) || 0,
      boqRate: parseFloat(r.boqRate) || 0,
      negotiatedRate: parseFloat(r.negotiatedRate) || 0,
    }));
    replaceItems.mutate(
      { woId: selectedWo.id, data: toSave },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListWorkOrderItemsQueryKey(selectedWo.id) });
          qc.invalidateQueries({ queryKey: getListWorkOrdersQueryKey(projectId) });
          toast({ title: "Work order saved" });
          setEditRows(null);
        },
        onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
      },
    );
  };

  const totalBoq = displayItems.reduce((s, r) => s + (parseFloat(r.quantity) || 0) * (parseFloat(r.boqRate) || 0), 0);
  const totalNeg = displayItems.reduce((s, r) => s + (parseFloat(r.quantity) || 0) * (parseFloat(r.negotiatedRate) || 0), 0);
  const margin = totalBoq > 0 ? ((totalBoq - totalNeg) / totalBoq) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Work order estimates — sub-contract agreements linked to L3 BOQ items.</div>
        <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> New Work Order
        </Button>
      </div>

      {showCreate && (
        <Card className="border-primary/30">
          <CardContent className="pt-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block">Sub-contractor Name *</label>
                <Input className="h-8" placeholder="e.g. M/s Sharma Constructions" value={form.subcontractor} onChange={e => setForm(f => ({ ...f, subcontractor: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Work Package *</label>
                <Input className="h-8" placeholder="e.g. RCC Works — Superstructure" value={form.workPackage} onChange={e => setForm(f => ({ ...f, workPackage: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block">Source L3 Estimate <span className="text-muted-foreground font-normal">(auto-populate BOQ)</span></label>
                <Select
                  value={form.l3EstimateId || "none"}
                  onValueChange={v => setForm(f => ({ ...f, l3EstimateId: v === "none" ? "" : v }))}
                >
                  <SelectTrigger className="h-8"><SelectValue placeholder="Select L3 BOQ..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {l3Estimates.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Notes</label>
                <Input className="h-8" placeholder="e.g. Back-to-back sub-contract" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={createWO.isPending}>Create</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-4 gap-4">
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wide font-semibold text-muted-foreground mb-2">Work Orders</div>
          {woLoading && [1,2].map(i => <Skeleton key={i} className="h-14 w-full" />)}
          {!woLoading && workOrders.length === 0 && (
            <div className="text-xs text-muted-foreground p-3 border border-dashed rounded text-center">No work orders yet.</div>
          )}
          {workOrders.map(wo => (
            <button key={wo.id} onClick={() => { setSelectedWoId(wo.id); setEditRows(null); }}
              className={`w-full text-left p-2.5 rounded-lg border transition-all text-sm ${selectedWo?.id === wo.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
              <div className="font-medium truncate">{wo.subcontractor}</div>
              <div className="text-xs text-muted-foreground truncate">{wo.workPackage}</div>
              <div className="text-xs tabular-nums mt-0.5">{formatINR(wo.totalNegotiatedAmount)}</div>
            </button>
          ))}
        </div>

        <div className="lg:col-span-3">
          {selectedWo ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{selectedWo.subcontractor}</div>
                  <div className="text-xs text-muted-foreground">{selectedWo.workPackage} · {selectedWo.status}</div>
                </div>
                <div className="flex gap-3 text-right text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">BOQ Value</div>
                    <div className="font-bold">{formatINR(totalBoq || selectedWo.totalBoqAmount)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Negotiated</div>
                    <div className="font-bold">{formatINR(totalNeg || selectedWo.totalNegotiatedAmount)}</div>
                  </div>
                  <div className={`p-2 rounded text-center ${margin >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                    <div className="text-xs">B2B Margin</div>
                    <div className="font-bold">{margin.toFixed(1)}%</div>
                  </div>
                </div>
              </div>

              {itemsLoading ? <Skeleton className="h-32 w-full" /> : (
                <>
                  <table className="w-full text-xs">
                    <thead className="text-[10px] uppercase text-muted-foreground">
                      <tr>
                        <th className="text-left pb-1">Description</th>
                        <th className="text-right pb-1 w-12">Unit</th>
                        <th className="text-right pb-1 w-16">Qty</th>
                        <th className="text-right pb-1 w-24">BOQ Rate ₹</th>
                        <th className="text-right pb-1 w-28">Negotiated ₹</th>
                        <th className="text-right pb-1 w-24">Amount ₹</th>
                        <th className="text-right pb-1 w-16">Margin%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayItems.map((item, idx) => {
                        const neg = (parseFloat(item.quantity) || 0) * (parseFloat(item.negotiatedRate) || 0);
                        const boq = (parseFloat(item.quantity) || 0) * (parseFloat(item.boqRate) || 0);
                        const rowMargin = boq > 0 ? ((boq - neg) / boq) * 100 : 0;
                        return (
                          <tr key={idx} className="border-b last:border-0">
                            <td className="py-1 pr-1">{item.description}</td>
                            <td className="py-1 text-right">{item.unit}</td>
                            <td className="py-1">
                              <Input className="h-6 text-xs text-right" type="number" value={item.quantity} onChange={e => updateItemRow(idx, "quantity", e.target.value)} />
                            </td>
                            <td className="py-1 text-right tabular-nums text-muted-foreground">{formatINR(parseFloat(item.boqRate) || 0)}</td>
                            <td className="py-1">
                              <Input className="h-6 text-xs text-right" type="number" value={item.negotiatedRate} onChange={e => updateItemRow(idx, "negotiatedRate", e.target.value)} />
                            </td>
                            <td className="py-1 text-right tabular-nums font-medium">{formatINR(neg)}</td>
                            <td className={`py-1 text-right text-[10px] ${rowMargin < 0 ? "text-rose-500" : "text-emerald-600"}`}>{rowMargin.toFixed(1)}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {editRows && (
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditRows(null)}>Discard</Button>
                      <Button size="sm" onClick={handleSaveItems} disabled={replaceItems.isPending}>
                        <Check className="h-3 w-3 mr-1" /> Save Work Order
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-40 border border-dashed rounded-lg text-muted-foreground text-sm">
              Select or create a work order
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function L2AbstractPanel({ estimate }: { estimate: Estimate }) {
  const [open, setOpen] = useState(false);
  const [builtUpArea, setBuiltUpArea] = useState("");
  const [cityTier, setCityTier] = useState("T1");
  const [state, setState] = useState("Maharashtra");
  const generateAbstract = useGenerateAbstractBoqItems();
  const qc = useQueryClient();
  const { toast } = useToast();

  const handleGenerate = () => {
    const bua = Number(builtUpArea);
    if (!bua || bua <= 0) {
      toast({ title: "Enter a valid built-up area", variant: "destructive" }); return;
    }
    generateAbstract.mutate(
      { estimateId: estimate.id, data: { builtUpArea: bua, cityTier, state } },
      {
        onSuccess: (items) => {
          qc.invalidateQueries({ queryKey: getListBoqItemsQueryKey(estimate.id) });
          qc.invalidateQueries({ queryKey: getListProjectEstimatesQueryKey(estimate.projectId) });
          toast({ title: `Generated ${items.length} trade-wise abstract rows from DSR` });
          setOpen(false);
          setBuiltUpArea("");
        },
        onError: (e: any) => toast({ title: "Error", description: e?.message ?? "Failed to generate abstract", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="mb-4 p-3 rounded-lg border bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">L2 Abstract Estimate</p>
          <p className="text-xs text-amber-700 dark:text-amber-400">Auto-generate trade-wise rows from DSR/SSR benchmark rates. Existing rows will be replaced.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="shrink-0 border-amber-400 text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:border-amber-700">
              <Calculator className="h-3.5 w-3.5 mr-1" /> Generate Abstract
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Generate Trade-wise Abstract from DSR</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-1">
              <p className="text-sm text-muted-foreground">Creates one BOQ row per trade using DSR/SSR benchmark rates scaled to built-up area. Existing items will be replaced.</p>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Built-Up Area (sqm) <span className="text-destructive">*</span></label>
                <Input type="number" min="1" placeholder="e.g. 12000" value={builtUpArea} onChange={e => setBuiltUpArea(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">City Tier</label>
                <Select value={cityTier} onValueChange={setCityTier}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="T1">Tier 1 — Mumbai, Delhi, Bengaluru…</SelectItem>
                    <SelectItem value="T2">Tier 2</SelectItem>
                    <SelectItem value="T3">Tier 3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">State</label>
                <Input value={state} onChange={e => setState(e.target.value)} placeholder="Maharashtra" />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={handleGenerate} disabled={generateAbstract.isPending}>
                  <Calculator className="h-4 w-4 mr-1.5" />
                  {generateAbstract.isPending ? "Generating…" : "Generate from DSR"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

export default function EstimationPage({ projectId: propProjectId }: { projectId?: string } = {}) {
  const params = useParams<{ id: string }>();
  const projectId = propProjectId ?? params.id;
  const { data: estimates = [], isLoading } = useListProjectEstimates(projectId);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Derive from live query data — stays fresh after any mutation/invalidation
  const activeEst = estimates.find(e => e.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Estimation</h1>
          <p className="text-sm text-muted-foreground">L0 concept through L5 work order — full estimation workflow.</p>
        </div>
        <NewEstimateDialog projectId={projectId} />
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide font-semibold text-muted-foreground mb-2">Estimates</div>
          {isLoading && [1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
          {!isLoading && estimates.length === 0 && (
            <div className="text-sm text-muted-foreground p-4 border border-dashed rounded-lg text-center">No estimates yet.</div>
          )}
          {estimates.map(est => {
            const Icon = LEVEL_ICONS[est.level] ?? FileBarChart;
            return (
              <button
                key={est.id}
                onClick={() => setSelectedId(est.id)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${activeEst?.id === est.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{est.name}</div>
                    <div className="text-xs text-muted-foreground">{est.level} · {LEVEL_LABELS[est.level]}</div>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${STATUS_BADGE[est.status] ?? ""}`}>{est.status}</span>
                </div>
                <div className="text-xs tabular-nums text-muted-foreground mt-1">{formatINR(est.totalAmount)}</div>
              </button>
            );
          })}
        </div>

        <div className="lg:col-span-3">
          {!activeEst ? (
            <div className="flex items-center justify-center h-64 border border-dashed rounded-lg text-muted-foreground text-sm">
              Select an estimate to view details
            </div>
          ) : (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">{activeEst.name}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">{activeEst.level} — {LEVEL_LABELS[activeEst.level]}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded border ${STATUS_BADGE[activeEst.status] ?? ""}`}>{activeEst.status}</span>
                  <LockToggleButton estimate={activeEst} />
                  <div className="text-sm font-bold">{formatINR(activeEst.totalAmount)}</div>
                </div>
              </CardHeader>
              <CardContent>
                {activeEst.level === "L0" && <L0Panel estimate={activeEst} />}
                {activeEst.level === "L1" && <L1Panel estimate={activeEst} />}
                {activeEst.level === "L2" && <><L2AbstractPanel estimate={activeEst} /><BoqPanel estimate={activeEst} /></>}
                {activeEst.level === "L3" && <BoqPanel estimate={activeEst} />}
                {activeEst.level === "L4" && <BoqPanel estimate={activeEst} />}
                {activeEst.level === "L5" && <L5Panel projectId={projectId} estimates={estimates} />}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
