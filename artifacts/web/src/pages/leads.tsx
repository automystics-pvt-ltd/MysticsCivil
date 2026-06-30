import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearch, useLocation } from "wouter";
import { Plus, Search, Trash2, Edit2, ArrowRight, Link2, FolderOpen, Target, TrendingUp, DollarSign, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";

const api = (path: string) => `/api${path}`;

const STAGES: Record<string, { label: string; color: string }> = {
  prospect: { label: "Prospect", color: "bg-slate-100 text-slate-700" },
  qualified: { label: "Qualified", color: "bg-blue-100 text-blue-700" },
  proposal: { label: "Proposal", color: "bg-violet-100 text-violet-700" },
  negotiation: { label: "Negotiation", color: "bg-amber-100 text-amber-700" },
  won: { label: "Won", color: "bg-emerald-100 text-emerald-700" },
  lost: { label: "Lost", color: "bg-red-100 text-red-700" },
};

const WORK_TYPES = ["Roads & Highways","Bridges","Buildings","Water Supply","Sewerage","Irrigation","Railways","Electrical","Other"];
const SOURCES = [
  { value: "direct", label: "Direct" },
  { value: "referral", label: "Referral" },
  { value: "portal", label: "Portal" },
  { value: "tender_notice", label: "Tender Notice" },
  { value: "repeat_client", label: "Repeat Client" },
  { value: "other", label: "Other" },
];

const EMPTY: any = { title: "", clientName: "", clientContact: "", email: "", phone: "", location: "", workType: "", estimatedValue: "", stage: "prospect", source: "direct", probability: 20, expectedCloseDate: "", notes: "", lostReason: "" };

function fmt(v: number) {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(1)}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`;
  return `₹${v.toLocaleString("en-IN")}`;
}

export default function LeadsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>(EMPTY);
  const [saving, setSaving] = useState(false);
  const { confirm: askConfirm, dialog: confirmDialog } = useConfirm();

  const { data: leads = [] } = useQuery({
    queryKey: ["leads", stageFilter],
    queryFn: () => fetch(api(`/leads${stageFilter !== "all" ? `?stage=${stageFilter}` : ""}`), { credentials: "include" }).then(r => r.json()),
  });
  const { data: stats } = useQuery({
    queryKey: ["leads-stats"],
    queryFn: () => fetch(api("/leads/stats"), { credentials: "include" }).then(r => r.json()),
  });

  const filtered = search ? leads.filter((l: any) => l.title.toLowerCase().includes(search.toLowerCase()) || l.clientName.toLowerCase().includes(search.toLowerCase())) : leads;

  function openCreate() { setForm(EMPTY); setEditing(null); setDialogOpen(true); }
  function openEdit(lead: any) {
    setForm({ ...lead, estimatedValue: lead.estimatedValue ?? "", expectedCloseDate: lead.expectedCloseDate ? lead.expectedCloseDate.slice(0, 10) : "", lostReason: lead.lostReason ?? "", notes: lead.notes ?? "", clientContact: lead.clientContact ?? "", phone: lead.phone ?? "", email: lead.email ?? "", location: lead.location ?? "", source: lead.source ?? "" });
    setEditing(lead);
    setDialogOpen(true);
  }

  async function save() {
    setSaving(true);
    try {
      const body = { ...form, estimatedValue: form.estimatedValue ? Number(form.estimatedValue) : null, probability: Number(form.probability) };
      const url = editing ? api(`/leads/${editing.id}`) : api("/leads");
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed"); }
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["leads-stats"] });
      setDialogOpen(false);
      toast({ title: editing ? "Lead updated" : "Lead created" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setSaving(false);
  }

  async function deleteLead(id: string) {
    if (!confirm("Delete this lead?")) return;
    await fetch(api(`/leads/${id}`), { method: "DELETE", credentials: "include" });
    qc.invalidateQueries({ queryKey: ["leads"] });
    qc.invalidateQueries({ queryKey: ["leads-stats"] });
    toast({ title: "Lead deleted" });
  }

  function goToCustomer(lead: any) {
    setLocation(`/customers?fromLead=${lead.id}&name=${encodeURIComponent(lead.clientName)}&contact=${encodeURIComponent(lead.clientContact ?? "")}&email=${encodeURIComponent(lead.email ?? "")}&phone=${encodeURIComponent(lead.phone ?? "")}&leadTitle=${encodeURIComponent(lead.title)}`);
  }

  function goToTender(lead: any) {
    setLocation(`/tenders?fromLead=${lead.id}&title=${encodeURIComponent(lead.title)}&client=${encodeURIComponent(lead.clientName)}&location=${encodeURIComponent(lead.location ?? "")}&estValue=${lead.estimatedValue ?? ""}&workType=${encodeURIComponent(lead.workType ?? "")}`);
  }

  const pipelineValue = stats?.pipelineValue ?? 0;
  const wonValue = stats?.wonValue ?? 0;
  const total = stats?.total ?? 0;
  const wonCount = stats?.byStage?.won?.count ?? 0;
  const winRate = total > 0 ? Math.round((wonCount / total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Target className="h-6 w-6 text-primary" /> Leads</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Track opportunities from prospect to win</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> New Lead</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Leads", value: total, icon: Target, color: "text-blue-500" },
          { label: "Win Rate", value: `${winRate}%`, icon: Award, color: "text-emerald-500" },
          { label: "Pipeline Value", value: fmt(pipelineValue), icon: TrendingUp, color: "text-violet-500" },
          { label: "Won Value", value: fmt(wonValue), icon: DollarSign, color: "text-amber-500" },
        ].map(k => (
          <Card key={k.label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <k.icon className={`h-4 w-4 ${k.color}`} />
                <span className="text-xs text-muted-foreground">{k.label}</span>
              </div>
              <p className="text-xl font-bold">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search leads…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="All stages" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {Object.entries(STAGES).map(([v, s]) => <SelectItem key={v} value={v}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && <div className="text-center py-16 text-muted-foreground">No leads found. Create your first lead.</div>}
        {filtered.map((lead: any) => (
          <Card key={lead.id} className="hover:shadow-sm transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold truncate">{lead.title}</h3>
                    <Badge className={`text-xs ${STAGES[lead.stage]?.color ?? "bg-gray-100 text-gray-700"}`}>{STAGES[lead.stage]?.label ?? lead.stage}</Badge>
                    {lead.customerId && <Badge variant="outline" className="text-xs gap-1"><Link2 className="h-2.5 w-2.5" />Customer</Badge>}
                    {lead.convertedToProjectId && <Badge className="text-xs bg-emerald-100 text-emerald-700 gap-1"><FolderOpen className="h-2.5 w-2.5" />Project</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{lead.clientName}{lead.location ? ` · ${lead.location}` : ""}{lead.workType ? ` · ${lead.workType}` : ""}</p>
                  <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
                    {lead.estimatedValue && <span className="font-medium text-foreground">{fmt(Number(lead.estimatedValue))}</span>}
                    <span>Probability: {lead.probability}%</span>
                    {lead.source && <span>Source: {SOURCES.find(s => s.value === lead.source)?.label ?? lead.source}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {!lead.customerId && (
                    <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => goToCustomer(lead)}>
                      Customer <ArrowRight className="h-3 w-3" />
                    </Button>
                  )}
                  {!lead.convertedToProjectId && (
                    <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => goToTender(lead)}>
                      Tender <ArrowRight className="h-3 w-3" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => openEdit(lead)}><Edit2 className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={async () => { if (!(await askConfirm({ title: "Delete lead?", description: `"${lead.title}" will be permanently removed.`, destructive: true }))) return; deleteLead(lead.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {confirmDialog}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Lead" : "New Lead"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-1 gap-3">
              <div><Label>Opportunity Title *</Label><Input value={form.title} onChange={e => setForm((f: any) => ({ ...f, title: e.target.value }))} placeholder="e.g. Road Widening — NH-44" /></div>
              <div><Label>Client / Authority *</Label><Input value={form.clientName} onChange={e => setForm((f: any) => ({ ...f, clientName: e.target.value }))} placeholder="Client or authority name" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Contact Person</Label><Input value={form.clientContact} onChange={e => setForm((f: any) => ({ ...f, clientContact: e.target.value }))} /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm((f: any) => ({ ...f, phone: e.target.value }))} /></div>
              <div><Label>Email</Label><Input value={form.email} onChange={e => setForm((f: any) => ({ ...f, email: e.target.value }))} /></div>
              <div><Label>Location</Label><Input value={form.location} onChange={e => setForm((f: any) => ({ ...f, location: e.target.value }))} /></div>
              <div>
                <Label>Work Type</Label>
                <Select value={form.workType} onValueChange={v => setForm((f: any) => ({ ...f, workType: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{WORK_TYPES.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Estimated Value (₹)</Label><Input type="number" value={form.estimatedValue} onChange={e => setForm((f: any) => ({ ...f, estimatedValue: e.target.value }))} /></div>
              <div>
                <Label>Stage</Label>
                <Select value={form.stage} onValueChange={v => setForm((f: any) => ({ ...f, stage: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(STAGES).map(([v, s]) => <SelectItem key={v} value={v}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Source</Label>
                <Select value={form.source} onValueChange={v => setForm((f: any) => ({ ...f, source: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SOURCES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Win Probability (%)</Label><Input type="number" min={0} max={100} value={form.probability} onChange={e => setForm((f: any) => ({ ...f, probability: e.target.value }))} /></div>
              <div><Label>Expected Close Date</Label><Input type="date" value={form.expectedCloseDate} onChange={e => setForm((f: any) => ({ ...f, expectedCloseDate: e.target.value }))} /></div>
            </div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm((f: any) => ({ ...f, notes: e.target.value }))} rows={2} /></div>
            {form.stage === "lost" && <div><Label>Lost Reason</Label><Textarea value={form.lostReason} onChange={e => setForm((f: any) => ({ ...f, lostReason: e.target.value }))} rows={2} /></div>}
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
