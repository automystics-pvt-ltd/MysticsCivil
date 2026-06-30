import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearch, useLocation } from "wouter";
import { Plus, Search, Trash2, Edit2, ArrowRight, FileSearch, CheckCircle2, Clock, XCircle, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const api = (path: string) => `/api${path}`;

const STATUSES: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: "Draft", color: "bg-slate-100 text-slate-700", icon: Clock },
  under_review: { label: "Under Review", color: "bg-amber-100 text-amber-700", icon: Clock },
  approved: { label: "Approved", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-700", icon: XCircle },
};

const METHODS = [
  { value: "parametric", label: "Parametric" },
  { value: "detailed", label: "Detailed" },
  { value: "analogous", label: "Analogous" },
];

const WORK_TYPES = ["Roads & Highways","Bridges","Buildings","Water Supply","Sewerage","Irrigation","Railways","Electrical","Other"];

const EMPTY: any = { title: "", customerId: "", leadId: "", workType: "", location: "", scopeDescription: "", preliminaryValue: "", estimationMethod: "parametric", notes: "" };

function fmt(v: number) {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(1)}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`;
  return `₹${v.toLocaleString("en-IN")}`;
}

export default function PreEstimationsPage() {
  const [, setLocation] = useLocation();
  const searchStr = useSearch();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const urlParams = new URLSearchParams(searchStr);
  const fromCustomerId = urlParams.get("fromCustomer");
  const fromCustomerName = urlParams.get("customerName") ?? "";
  const [form, setForm] = useState<any>({ ...EMPTY, customerId: fromCustomerId ?? "" });
  const [autoOpened, setAutoOpened] = useState(false);
  if (fromCustomerId && !autoOpened && !dialogOpen) { setDialogOpen(true); setAutoOpened(true); }

  const { data: items = [] } = useQuery({
    queryKey: ["pre-estimations", statusFilter, fromCustomerId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (fromCustomerId) params.set("customerId", fromCustomerId);
      return fetch(api(`/pre-estimations?${params}`), { credentials: "include" }).then(r => r.json());
    },
  });
  const { data: stats } = useQuery({
    queryKey: ["pre-estimations-stats"],
    queryFn: () => fetch(api("/pre-estimations/stats"), { credentials: "include" }).then(r => r.json()),
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers-list"],
    queryFn: () => fetch(api("/customers"), { credentials: "include" }).then(r => r.json()),
  });

  const filtered = search ? items.filter((i: any) => i.title.toLowerCase().includes(search.toLowerCase())) : items;

  function openCreate() { setForm({ ...EMPTY, customerId: fromCustomerId ?? "" }); setEditing(null); setDialogOpen(true); }
  function openEdit(item: any) { setForm({ ...item, preliminaryValue: item.preliminaryValue ?? "", notes: item.notes ?? "", scopeDescription: item.scopeDescription ?? "", location: item.location ?? "", workType: item.workType ?? "", estimationMethod: item.estimationMethod ?? "parametric" }); setEditing(item); setDialogOpen(true); }

  async function save() {
    setSaving(true);
    try {
      const body = { ...form, preliminaryValue: form.preliminaryValue ? Number(form.preliminaryValue) : null };
      const url = editing ? api(`/pre-estimations/${editing.id}`) : api("/pre-estimations");
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed"); }
      qc.invalidateQueries({ queryKey: ["pre-estimations"] });
      qc.invalidateQueries({ queryKey: ["pre-estimations-stats"] });
      setDialogOpen(false);
      toast({ title: editing ? "Updated" : "Pre-Estimation created" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setSaving(false);
  }

  async function changeStatus(id: string, status: string) {
    const res = await fetch(api(`/pre-estimations/${id}`), { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (!res.ok) { toast({ title: "Error", variant: "destructive" }); return; }
    qc.invalidateQueries({ queryKey: ["pre-estimations"] });
    toast({ title: `Status updated to ${STATUSES[status]?.label}` });
  }

  async function del(id: string) {
    if (!confirm("Delete this pre-estimation?")) return;
    await fetch(api(`/pre-estimations/${id}`), { method: "DELETE", credentials: "include" });
    qc.invalidateQueries({ queryKey: ["pre-estimations"] });
    toast({ title: "Deleted" });
  }

  const totalValue = stats?.totalValue ?? 0;
  const totalCount = stats?.total ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><FileSearch className="h-6 w-6 text-primary" /> Pre-Estimations</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Preliminary cost estimates before formal quotation</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> New Pre-Estimation</Button>
      </div>

      {fromCustomerId && fromCustomerName && (
        <div className="flex items-start gap-3 bg-violet-50 dark:bg-violet-950/20 border border-violet-200 rounded-xl px-4 py-3">
          <Link2 className="h-4 w-4 text-violet-600 mt-0.5" />
          <p className="text-sm text-violet-800">Creating pre-estimation for <strong>{fromCustomerName}</strong></p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(STATUSES).map(([k, s]) => (
          <Card key={k} className={`cursor-pointer transition-all ${statusFilter === k ? "ring-2 ring-primary" : ""}`} onClick={() => setStatusFilter(statusFilter === k ? "all" : k)}>
            <CardContent className="pt-3 pb-2 text-center">
              <p className="text-xl font-bold">{stats?.byStatus?.[k]?.count ?? 0}</p>
              <Badge className={`text-xs ${s.color}`}>{s.label}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search pre-estimations…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} /></div>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && <div className="text-center py-16 text-muted-foreground">No pre-estimations found.</div>}
        {filtered.map((item: any) => {
          const S = STATUSES[item.status] ?? STATUSES.draft;
          const customer = customers.find((c: any) => c.id === item.customerId);
          return (
            <Card key={item.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{item.title}</h3>
                      <Badge className={`text-xs ${S.color}`}>{S.label}</Badge>
                      {customer && <Badge variant="outline" className="text-xs gap-1"><Link2 className="h-2.5 w-2.5" />{customer.name}</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{[item.workType, item.location, item.estimationMethod ? `Method: ${METHODS.find(m => m.value === item.estimationMethod)?.label}` : ""].filter(Boolean).join(" · ")}</p>
                    {item.preliminaryValue && <p className="text-sm font-medium mt-1">{fmt(Number(item.preliminaryValue))}</p>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
                    {item.status === "draft" && <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => changeStatus(item.id, "under_review")}>Submit for Review</Button>}
                    {item.status === "under_review" && (
                      <>
                        <Button size="sm" variant="outline" className="text-xs h-7 text-emerald-600" onClick={() => changeStatus(item.id, "approved")}>Approve</Button>
                        <Button size="sm" variant="outline" className="text-xs h-7 text-red-600" onClick={() => changeStatus(item.id, "rejected")}>Reject</Button>
                      </>
                    )}
                    {item.status === "approved" && (
                      <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => setLocation(`/quotations?fromPreEstimation=${item.id}&title=${encodeURIComponent(item.title)}&value=${item.preliminaryValue ?? ""}&customerId=${item.customerId ?? ""}`)}>
                        Quotation <ArrowRight className="h-3 w-3" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => openEdit(item)}><Edit2 className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del(item.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Pre-Estimation" : "New Pre-Estimation"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Title *</Label><Input value={form.title} onChange={e => setForm((f: any) => ({ ...f, title: e.target.value }))} placeholder="e.g. Road Widening — Preliminary Estimate" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Customer</Label>
                <Select value={form.customerId} onValueChange={v => setForm((f: any) => ({ ...f, customerId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>{customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Work Type</Label>
                <Select value={form.workType} onValueChange={v => setForm((f: any) => ({ ...f, workType: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{WORK_TYPES.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Location</Label><Input value={form.location} onChange={e => setForm((f: any) => ({ ...f, location: e.target.value }))} /></div>
              <div><Label>Preliminary Value (₹)</Label><Input type="number" value={form.preliminaryValue} onChange={e => setForm((f: any) => ({ ...f, preliminaryValue: e.target.value }))} /></div>
              <div className="col-span-2">
                <Label>Estimation Method</Label>
                <Select value={form.estimationMethod} onValueChange={v => setForm((f: any) => ({ ...f, estimationMethod: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Scope Description</Label><Textarea value={form.scopeDescription} onChange={e => setForm((f: any) => ({ ...f, scopeDescription: e.target.value }))} rows={3} placeholder="Describe the work scope…" /></div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm((f: any) => ({ ...f, notes: e.target.value }))} rows={2} /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : editing ? "Update" : "Create"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
