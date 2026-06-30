import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearch, useLocation } from "wouter";
import { Plus, Search, Trash2, Edit2, ArrowRight, Briefcase, TrendingUp, DollarSign, Award, Link2, FolderOpen, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

const api = (path: string) => `/api${path}`;

const STATUSES: Record<string, { label: string; color: string }> = {
  upcoming: { label: "Upcoming", color: "bg-slate-100 text-slate-700" },
  in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-700" },
  submitted: { label: "Submitted", color: "bg-violet-100 text-violet-700" },
  under_evaluation: { label: "Under Evaluation", color: "bg-amber-100 text-amber-700" },
  won: { label: "Won 🏆", color: "bg-emerald-100 text-emerald-700" },
  lost: { label: "Lost", color: "bg-red-100 text-red-700" },
  cancelled: { label: "Cancelled", color: "bg-gray-100 text-gray-500" },
};

const TENDER_TYPES = [
  { value: "open", label: "Open" },
  { value: "limited", label: "Limited" },
  { value: "single", label: "Single Source" },
  { value: "emd_exempt", label: "EMD Exempt" },
];

const WORK_TYPES = ["Roads & Highways","Bridges","Buildings","Water Supply","Sewerage","Irrigation","Railways","Electrical","Other"];

const EMPTY: any = {
  title: "", nitNumber: "", tenderingAuthority: "", tenderType: "open", workType: "", location: "",
  estimatedValue: "", emdAmount: "", documentFee: "", documentFeeMode: "",
  bidSubmissionDate: "", openingDate: "", status: "upcoming",
  ourBidAmount: "", l1Amount: "", loaDate: "", loaReference: "", emdRefunded: false,
  lostReason: "", notes: "", leadId: "", quotationId: "",
};

function fmt(v: number) {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(1)}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`;
  return `₹${v.toLocaleString("en-IN")}`;
}

export default function TendersPage() {
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
  const fromLeadId = urlParams.get("fromLead");
  const fromQuotationId = urlParams.get("fromQuotation");
  const [form, setForm] = useState<any>({
    ...EMPTY,
    leadId: fromLeadId ?? "",
    quotationId: fromQuotationId ?? "",
    title: urlParams.get("title") ?? "",
    location: urlParams.get("location") ?? "",
    estimatedValue: urlParams.get("estValue") ?? "",
    workType: urlParams.get("workType") ?? "",
  });
  const [autoOpened, setAutoOpened] = useState(false);
  if ((fromLeadId || fromQuotationId) && !autoOpened && !dialogOpen) { setDialogOpen(true); setAutoOpened(true); }

  const { data: tenders = [] } = useQuery({
    queryKey: ["tenders", statusFilter],
    queryFn: () => {
      const params = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      return fetch(api(`/tenders${params}`), { credentials: "include" }).then(r => r.json());
    },
  });
  const { data: stats } = useQuery({
    queryKey: ["tenders-stats"],
    queryFn: () => fetch(api("/tenders/stats"), { credentials: "include" }).then(r => r.json()),
  });

  const filtered = search ? tenders.filter((t: any) => t.title.toLowerCase().includes(search.toLowerCase()) || (t.tenderingAuthority ?? "").toLowerCase().includes(search.toLowerCase())) : tenders;

  const wonTendersNeedingProject = tenders.filter((t: any) => t.status === "won" && !t.convertedToProjectId);

  function openCreate() { setForm({ ...EMPTY, leadId: fromLeadId ?? "", quotationId: fromQuotationId ?? "" }); setEditing(null); setDialogOpen(true); }
  function openEdit(t: any) {
    setForm({
      ...t,
      estimatedValue: t.estimatedValue ?? "", emdAmount: t.emdAmount ?? "", documentFee: t.documentFee ?? "",
      ourBidAmount: t.ourBidAmount ?? "", l1Amount: t.l1Amount ?? "",
      bidSubmissionDate: t.bidSubmissionDate ? t.bidSubmissionDate.slice(0, 10) : "",
      openingDate: t.openingDate ? t.openingDate.slice(0, 10) : "",
      loaDate: t.loaDate ? t.loaDate.slice(0, 10) : "",
      lostReason: t.lostReason ?? "", notes: t.notes ?? "", loaReference: t.loaReference ?? "",
    });
    setEditing(t);
    setDialogOpen(true);
  }

  async function save() {
    setSaving(true);
    try {
      const body = {
        ...form,
        estimatedValue: form.estimatedValue ? Number(form.estimatedValue) : null,
        emdAmount: form.emdAmount ? Number(form.emdAmount) : null,
        documentFee: form.documentFee ? Number(form.documentFee) : null,
        ourBidAmount: form.ourBidAmount ? Number(form.ourBidAmount) : null,
        l1Amount: form.l1Amount ? Number(form.l1Amount) : null,
      };
      const url = editing ? api(`/tenders/${editing.id}`) : api("/tenders");
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed"); }
      qc.invalidateQueries({ queryKey: ["tenders"] });
      qc.invalidateQueries({ queryKey: ["tenders-stats"] });
      setDialogOpen(false);
      toast({ title: editing ? "Tender updated" : "Tender created" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setSaving(false);
  }

  async function del(id: string) {
    if (!confirm("Delete this tender?")) return;
    await fetch(api(`/tenders/${id}`), { method: "DELETE", credentials: "include" });
    qc.invalidateQueries({ queryKey: ["tenders"] });
    toast({ title: "Tender deleted" });
  }

  function goToProject(t: any) {
    setLocation(`/projects/new?fromTender=${t.id}&name=${encodeURIComponent(t.title)}&clientName=${encodeURIComponent(t.tenderingAuthority ?? "")}&contractValue=${t.ourBidAmount ?? t.estimatedValue ?? ""}&location=${encodeURIComponent(t.location ?? "")}&loaRef=${encodeURIComponent(t.loaReference ?? "")}`);
  }

  const wonCount = stats?.byStatus?.won?.count ?? 0;
  const submitted = Object.entries(stats?.byStatus ?? {}).filter(([k]) => ["submitted","under_evaluation","won","lost"].includes(k)).reduce((a, [, v]: any) => a + v.count, 0);
  const successRate = stats?.successRate ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Briefcase className="h-6 w-6 text-primary" /> Tenders</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage bids from NIT to Letter of Award</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> New Tender</Button>
      </div>

      {(fromLeadId || fromQuotationId) && (
        <div className="flex items-start gap-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 rounded-xl px-4 py-3">
          <Link2 className="h-4 w-4 text-orange-600 mt-0.5" />
          <p className="text-sm text-orange-800">Creating tender from {fromLeadId ? "Lead" : "Quotation"} — form is pre-filled. Review and complete.</p>
        </div>
      )}

      {wonTendersNeedingProject.length > 0 && (
        <div className="flex items-start gap-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 rounded-xl px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-emerald-800">
            <strong>{wonTendersNeedingProject.length} won tender{wonTendersNeedingProject.length > 1 ? "s" : ""}</strong> need a project created.
            {" "}{wonTendersNeedingProject.map((t: any) => (
              <Button key={t.id} size="sm" variant="link" className="text-xs h-auto p-0 text-emerald-700" onClick={() => goToProject(t)}>
                Create for "{t.title.slice(0, 30)}…"
              </Button>
            ))}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Tenders", value: stats?.total ?? 0 },
          { label: "Won", value: wonCount },
          { label: "Success Rate", value: `${successRate}%` },
          { label: "Total Bid Value", value: fmt(stats?.totalBidValue ?? 0) },
        ].map(k => (
          <Card key={k.label}><CardContent className="pt-3 pb-2"><p className="text-xs text-muted-foreground">{k.label}</p><p className="text-xl font-bold">{k.value}</p></CardContent></Card>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search tenders…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(STATUSES).map(([v, s]) => <SelectItem key={v} value={v}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && <div className="text-center py-16 text-muted-foreground">No tenders found. Create your first tender.</div>}
        {filtered.map((t: any) => (
          <Card key={t.id} className="hover:shadow-sm transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {t.nitNumber && <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{t.nitNumber}</span>}
                    <h3 className="font-semibold truncate">{t.title}</h3>
                    <Badge className={`text-xs ${STATUSES[t.status]?.color}`}>{STATUSES[t.status]?.label ?? t.status}</Badge>
                    {t.leadId && <Badge variant="outline" className="text-xs gap-1"><Link2 className="h-2.5 w-2.5" />Lead</Badge>}
                    {t.quotationId && <Badge variant="outline" className="text-xs gap-1"><Link2 className="h-2.5 w-2.5" />Quotation</Badge>}
                    {t.convertedToProjectId && <Badge className="text-xs bg-emerald-100 text-emerald-700 gap-1"><FolderOpen className="h-2.5 w-2.5" />Project</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{[t.tenderingAuthority, t.location, t.workType].filter(Boolean).join(" · ")}</p>
                  <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                    {t.estimatedValue && <span>Est: <strong>{fmt(Number(t.estimatedValue))}</strong></span>}
                    {t.ourBidAmount && <span>Our Bid: <strong>{fmt(Number(t.ourBidAmount))}</strong></span>}
                    {t.bidSubmissionDate && <span>Submit by: {new Date(t.bidSubmissionDate).toLocaleDateString("en-IN")}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {t.status === "won" && !t.convertedToProjectId && (
                    <Button size="sm" variant="outline" className="text-xs h-7 gap-1 text-emerald-600 border-emerald-300" onClick={() => goToProject(t)}>
                      Project <ArrowRight className="h-3 w-3" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => openEdit(t)}><Edit2 className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del(t.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Tender" : "New Tender"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>Tender Title *</Label><Input value={form.title} onChange={e => setForm((f: any) => ({ ...f, title: e.target.value }))} placeholder="e.g. Construction of ROB at km 45" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>NIT / Tender No.</Label><Input value={form.nitNumber} onChange={e => setForm((f: any) => ({ ...f, nitNumber: e.target.value }))} /></div>
              <div><Label>Tendering Authority</Label><Input value={form.tenderingAuthority} onChange={e => setForm((f: any) => ({ ...f, tenderingAuthority: e.target.value }))} /></div>
              <div>
                <Label>Tender Type</Label>
                <Select value={form.tenderType} onValueChange={v => setForm((f: any) => ({ ...f, tenderType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TENDER_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
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
              <div><Label>Estimated Value (₹)</Label><Input type="number" value={form.estimatedValue} onChange={e => setForm((f: any) => ({ ...f, estimatedValue: e.target.value }))} /></div>
              <div><Label>EMD Amount (₹)</Label><Input type="number" value={form.emdAmount} onChange={e => setForm((f: any) => ({ ...f, emdAmount: e.target.value }))} /></div>
              <div><Label>Document Fee (₹)</Label><Input type="number" value={form.documentFee} onChange={e => setForm((f: any) => ({ ...f, documentFee: e.target.value }))} /></div>
              <div><Label>Bid Submission Date</Label><Input type="date" value={form.bidSubmissionDate} onChange={e => setForm((f: any) => ({ ...f, bidSubmissionDate: e.target.value }))} /></div>
              <div><Label>Opening Date</Label><Input type="date" value={form.openingDate} onChange={e => setForm((f: any) => ({ ...f, openingDate: e.target.value }))} /></div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm((f: any) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(STATUSES).map(([v, s]) => <SelectItem key={v} value={v}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            {["submitted","under_evaluation","won","lost"].includes(form.status) && (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Our Bid Amount (₹)</Label><Input type="number" value={form.ourBidAmount} onChange={e => setForm((f: any) => ({ ...f, ourBidAmount: e.target.value }))} /></div>
                <div><Label>L1 Amount (₹)</Label><Input type="number" value={form.l1Amount} onChange={e => setForm((f: any) => ({ ...f, l1Amount: e.target.value }))} /></div>
              </div>
            )}
            {form.status === "won" && (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>LoA Date</Label><Input type="date" value={form.loaDate} onChange={e => setForm((f: any) => ({ ...f, loaDate: e.target.value }))} /></div>
                <div><Label>LoA Reference</Label><Input value={form.loaReference} onChange={e => setForm((f: any) => ({ ...f, loaReference: e.target.value }))} /></div>
                <div className="col-span-2 flex items-center gap-2">
                  <Checkbox checked={form.emdRefunded} onCheckedChange={v => setForm((f: any) => ({ ...f, emdRefunded: Boolean(v) }))} id="emdRef" />
                  <Label htmlFor="emdRef">EMD Refunded</Label>
                </div>
              </div>
            )}
            {form.status === "lost" && <div><Label>Lost / Rejection Reason</Label><Textarea value={form.lostReason} onChange={e => setForm((f: any) => ({ ...f, lostReason: e.target.value }))} rows={2} /></div>}
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
