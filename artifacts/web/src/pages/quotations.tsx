import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearch, useLocation } from "wouter";
import { Plus, Search, Trash2, Edit2, ArrowRight, FileText, CheckCircle2, Clock, XCircle, Link2, Send } from "lucide-react";
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

const STATUSES: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: "bg-slate-100 text-slate-700" },
  sent: { label: "Sent", color: "bg-blue-100 text-blue-700" },
  accepted: { label: "Accepted", color: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-700" },
  expired: { label: "Expired", color: "bg-gray-100 text-gray-500" },
};

const EMPTY: any = { title: "", quotationNumber: "", customerId: "", preEstimationId: "", leadId: "", totalValue: "", validUntil: "", notes: "", rejectedReason: "" };

function fmt(v: number) {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(1)}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`;
  return `₹${v.toLocaleString("en-IN")}`;
}

export default function QuotationsPage() {
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
  const fromPreEstId = urlParams.get("fromPreEstimation");
  const [form, setForm] = useState<any>({
    ...EMPTY,
    preEstimationId: fromPreEstId ?? "",
    title: urlParams.get("title") ?? "",
    totalValue: urlParams.get("value") ?? "",
    customerId: urlParams.get("customerId") ?? "",
  });
  const [autoOpened, setAutoOpened] = useState(false);
  if (fromPreEstId && !autoOpened && !dialogOpen) { setDialogOpen(true); setAutoOpened(true); }

  const { data: items = [] } = useQuery({
    queryKey: ["quotations", statusFilter],
    queryFn: () => {
      const params = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      return fetch(api(`/quotations${params}`), { credentials: "include" }).then(r => r.json());
    },
  });
  const { data: stats } = useQuery({
    queryKey: ["quotations-stats"],
    queryFn: () => fetch(api("/quotations/stats"), { credentials: "include" }).then(r => r.json()),
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers-list"],
    queryFn: () => fetch(api("/customers"), { credentials: "include" }).then(r => r.json()),
  });

  const filtered = search ? items.filter((i: any) => i.title.toLowerCase().includes(search.toLowerCase())) : items;

  function openCreate() { setForm({ ...EMPTY, preEstimationId: fromPreEstId ?? "" }); setEditing(null); setDialogOpen(true); }
  function openEdit(item: any) { setForm({ ...item, totalValue: item.totalValue ?? "", validUntil: item.validUntil ? item.validUntil.slice(0, 10) : "", rejectedReason: item.rejectedReason ?? "", notes: item.notes ?? "" }); setEditing(item); setDialogOpen(true); }

  async function save() {
    setSaving(true);
    try {
      const body = { ...form, totalValue: form.totalValue ? Number(form.totalValue) : null };
      const url = editing ? api(`/quotations/${editing.id}`) : api("/quotations");
      const res = await fetch(url, { method: editing ? "PATCH" : "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed"); }
      qc.invalidateQueries({ queryKey: ["quotations"] });
      qc.invalidateQueries({ queryKey: ["quotations-stats"] });
      setDialogOpen(false);
      toast({ title: editing ? "Updated" : "Quotation created" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setSaving(false);
  }

  async function changeStatus(id: string, status: string) {
    const res = await fetch(api(`/quotations/${id}`), { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (!res.ok) return;
    qc.invalidateQueries({ queryKey: ["quotations"] });
    toast({ title: `Status: ${STATUSES[status]?.label}` });
  }

  async function del(id: string) {
    if (!confirm("Delete this quotation?")) return;
    await fetch(api(`/quotations/${id}`), { method: "DELETE", credentials: "include" });
    qc.invalidateQueries({ queryKey: ["quotations"] });
    toast({ title: "Deleted" });
  }

  const acceptanceRate = stats?.acceptanceRate ?? 0;
  const totalValue = stats?.totalValue ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><FileText className="h-6 w-6 text-primary" /> Quotations</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Formal price offers — accepted quotations convert to Tenders</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> New Quotation</Button>
      </div>

      {fromPreEstId && (
        <div className="flex items-start gap-3 bg-purple-50 dark:bg-purple-950/20 border border-purple-200 rounded-xl px-4 py-3">
          <Link2 className="h-4 w-4 text-purple-600 mt-0.5" />
          <p className="text-sm text-purple-800">Creating quotation from approved Pre-Estimation — form is pre-filled.</p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Object.entries(STATUSES).map(([k, s]) => (
          <Card key={k} className={`cursor-pointer ${statusFilter === k ? "ring-2 ring-primary" : ""}`} onClick={() => setStatusFilter(statusFilter === k ? "all" : k)}>
            <CardContent className="pt-3 pb-2 text-center">
              <p className="text-xl font-bold">{stats?.byStatus?.[k]?.count ?? 0}</p>
              <Badge className={`text-xs ${s.color}`}>{s.label}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card><CardContent className="pt-3 pb-2"><p className="text-xs text-muted-foreground">Acceptance Rate</p><p className="text-xl font-bold">{acceptanceRate}%</p></CardContent></Card>
        <Card><CardContent className="pt-3 pb-2"><p className="text-xs text-muted-foreground">Accepted Value</p><p className="text-xl font-bold">{fmt(totalValue)}</p></CardContent></Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search quotations…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && <div className="text-center py-16 text-muted-foreground">No quotations found.</div>}
        {filtered.map((item: any) => {
          const S = STATUSES[item.status] ?? STATUSES.draft;
          const customer = customers.find((c: any) => c.id === item.customerId);
          return (
            <Card key={item.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {item.quotationNumber && <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{item.quotationNumber}</span>}
                      <h3 className="font-semibold">{item.title}</h3>
                      <Badge className={`text-xs ${S.color}`}>{S.label}</Badge>
                      {customer && <Badge variant="outline" className="text-xs">{customer.name}</Badge>}
                    </div>
                    <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                      {item.totalValue && <span className="font-medium text-foreground">{fmt(Number(item.totalValue))}</span>}
                      {item.validUntil && <span>Valid until {new Date(item.validUntil).toLocaleDateString("en-IN")}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
                    {item.status === "draft" && <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => changeStatus(item.id, "sent")}><Send className="h-3 w-3" />Send</Button>}
                    {item.status === "sent" && (
                      <>
                        <Button size="sm" variant="outline" className="text-xs h-7 text-emerald-600" onClick={() => changeStatus(item.id, "accepted")}>Accept</Button>
                        <Button size="sm" variant="outline" className="text-xs h-7 text-red-600" onClick={() => changeStatus(item.id, "rejected")}>Reject</Button>
                      </>
                    )}
                    {item.status === "accepted" && (
                      <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => setLocation(`/tenders?fromQuotation=${item.id}&title=${encodeURIComponent(item.title)}&estValue=${item.totalValue ?? ""}&customerId=${item.customerId ?? ""}`)}>
                        Tender <ArrowRight className="h-3 w-3" />
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
          <DialogHeader><DialogTitle>{editing ? "Edit Quotation" : "New Quotation"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Quotation No.</Label><Input value={form.quotationNumber} onChange={e => setForm((f: any) => ({ ...f, quotationNumber: e.target.value }))} placeholder="QTN-2024-001" /></div>
              <div>
                <Label>Customer</Label>
                <Select value={form.customerId} onValueChange={v => setForm((f: any) => ({ ...f, customerId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>{customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Title *</Label><Input value={form.title} onChange={e => setForm((f: any) => ({ ...f, title: e.target.value }))} placeholder="Quotation for…" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Total Value (₹)</Label><Input type="number" value={form.totalValue} onChange={e => setForm((f: any) => ({ ...f, totalValue: e.target.value }))} /></div>
              <div><Label>Valid Until</Label><Input type="date" value={form.validUntil} onChange={e => setForm((f: any) => ({ ...f, validUntil: e.target.value }))} /></div>
            </div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm((f: any) => ({ ...f, notes: e.target.value }))} rows={2} /></div>
            {editing?.status === "rejected" && <div><Label>Rejection Reason</Label><Textarea value={form.rejectedReason} onChange={e => setForm((f: any) => ({ ...f, rejectedReason: e.target.value }))} rows={2} /></div>}
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
