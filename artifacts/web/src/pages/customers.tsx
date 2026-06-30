import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearch, useLocation } from "wouter";
import { Plus, Search, Trash2, Edit2, ArrowRight, Users2, Building, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (path: string) => `${BASE}/api${path}`;

const CLIENT_TYPES: Record<string, { label: string; color: string }> = {
  govt: { label: "Government", color: "bg-blue-100 text-blue-700" },
  psu: { label: "PSU", color: "bg-indigo-100 text-indigo-700" },
  private: { label: "Private", color: "bg-slate-100 text-slate-700" },
  ngo: { label: "NGO", color: "bg-green-100 text-green-700" },
  other: { label: "Other", color: "bg-gray-100 text-gray-700" },
};

const STATES = ["Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal","Delhi","Jammu & Kashmir","Ladakh","Puducherry","Chandigarh"];

const EMPTY: any = { name: "", contactPerson: "", email: "", phone: "", gstin: "", pan: "", address: "", city: "", state: "", pincode: "", clientType: "private", notes: "", leadId: "" };

export default function CustomersPage() {
  const [, setLocation] = useLocation();
  const searchStr = useSearch();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const urlParams = new URLSearchParams(searchStr);
  const fromLeadId = urlParams.get("fromLead");
  const [form, setForm] = useState<any>({
    ...EMPTY,
    leadId: fromLeadId ?? "",
    name: urlParams.get("name") ?? "",
    contactPerson: urlParams.get("contact") ?? "",
    email: urlParams.get("email") ?? "",
    phone: urlParams.get("phone") ?? "",
  });
  const [autoOpened, setAutoOpened] = useState(false);
  if (fromLeadId && !autoOpened && !dialogOpen) { setDialogOpen(true); setAutoOpened(true); }

  const { data: customers = [] } = useQuery({
    queryKey: ["customers", typeFilter],
    queryFn: () => fetch(api("/customers"), { credentials: "include" }).then(r => r.json()),
  });
  const { data: stats } = useQuery({
    queryKey: ["customers-stats"],
    queryFn: () => fetch(api("/customers/stats"), { credentials: "include" }).then(r => r.json()),
  });

  const filtered = customers.filter((c: any) => {
    const matchType = typeFilter === "all" || c.clientType === typeFilter;
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.contactPerson ?? "").toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  function openCreate() { setForm(EMPTY); setEditing(null); setDialogOpen(true); }
  function openEdit(c: any) { setForm({ ...c, notes: c.notes ?? "", gstin: c.gstin ?? "", pan: c.pan ?? "", address: c.address ?? "", city: c.city ?? "", state: c.state ?? "", pincode: c.pincode ?? "" }); setEditing(c); setDialogOpen(true); }

  async function save() {
    setSaving(true);
    try {
      const url = editing ? api(`/customers/${editing.id}`) : api("/customers");
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed"); }
      const created = await res.json();
      if (fromLeadId && !editing) {
        await fetch(api(`/leads/${fromLeadId}`), { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerId: created.id }) });
      }
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customers-stats"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      setDialogOpen(false);
      toast({ title: editing ? "Customer updated" : "Customer created" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setSaving(false);
  }

  async function del(id: string) {
    if (!confirm("Delete this customer?")) return;
    await fetch(api(`/customers/${id}`), { method: "DELETE", credentials: "include" });
    qc.invalidateQueries({ queryKey: ["customers"] });
    toast({ title: "Customer deleted" });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Users2 className="h-6 w-6 text-primary" /> Customers</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Client registry — linked from Leads, feeding into Pre-Estimations</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> New Customer</Button>
      </div>

      {fromLeadId && (
        <div className="flex items-start gap-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 rounded-xl px-4 py-3">
          <Link2 className="h-4 w-4 text-blue-600 mt-0.5" />
          <p className="text-sm text-blue-800">Creating customer from Lead — form is pre-filled. Complete and save to link them.</p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Object.entries(CLIENT_TYPES).map(([k, t]) => (
          <Card key={k} className={`cursor-pointer transition-all ${typeFilter === k ? "ring-2 ring-primary" : ""}`} onClick={() => setTypeFilter(typeFilter === k ? "all" : k)}>
            <CardContent className="pt-3 pb-2 text-center">
              <p className="text-lg font-bold">{stats?.byType?.[k] ?? 0}</p>
              <p className="text-xs text-muted-foreground">{t.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search customers…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && <div className="text-center py-16 text-muted-foreground">No customers found.</div>}
        {filtered.map((c: any) => (
          <Card key={c.id} className="hover:shadow-sm transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">{c.name}</h3>
                    <Badge className={`text-xs ${CLIENT_TYPES[c.clientType]?.color}`}>{CLIENT_TYPES[c.clientType]?.label ?? c.clientType}</Badge>
                    {c.leadId && <Badge variant="outline" className="text-xs gap-1"><Link2 className="h-2.5 w-2.5" />Lead</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{[c.contactPerson, c.phone, c.email, c.city].filter(Boolean).join(" · ")}</p>
                  {(c.gstin || c.pan) && <p className="text-xs text-muted-foreground mt-0.5">{c.gstin ? `GSTIN: ${c.gstin}` : ""}{c.gstin && c.pan ? " · " : ""}{c.pan ? `PAN: ${c.pan}` : ""}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => setLocation(`/pre-estimations?fromCustomer=${c.id}&customerName=${encodeURIComponent(c.name)}`)}>
                    Pre-Est <ArrowRight className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(c)}><Edit2 className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Customer" : "New Customer"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Customer / Organisation Name *</Label><Input value={form.name} onChange={e => setForm((f: any) => ({ ...f, name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Client Type</Label>
                <Select value={form.clientType} onValueChange={v => setForm((f: any) => ({ ...f, clientType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(CLIENT_TYPES).map(([v, t]) => <SelectItem key={v} value={v}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Contact Person</Label><Input value={form.contactPerson} onChange={e => setForm((f: any) => ({ ...f, contactPerson: e.target.value }))} /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm((f: any) => ({ ...f, phone: e.target.value }))} /></div>
              <div><Label>Email</Label><Input value={form.email} onChange={e => setForm((f: any) => ({ ...f, email: e.target.value }))} /></div>
              <div><Label>GSTIN</Label><Input value={form.gstin} onChange={e => setForm((f: any) => ({ ...f, gstin: e.target.value }))} placeholder="22AAAAA0000A1Z5" /></div>
              <div><Label>PAN</Label><Input value={form.pan} onChange={e => setForm((f: any) => ({ ...f, pan: e.target.value }))} placeholder="AAAAA0000A" /></div>
            </div>
            <div><Label>Address</Label><Textarea value={form.address} onChange={e => setForm((f: any) => ({ ...f, address: e.target.value }))} rows={2} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>City</Label><Input value={form.city} onChange={e => setForm((f: any) => ({ ...f, city: e.target.value }))} /></div>
              <div>
                <Label>State</Label>
                <Select value={form.state} onValueChange={v => setForm((f: any) => ({ ...f, state: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                  <SelectContent>{STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Pincode</Label><Input value={form.pincode} onChange={e => setForm((f: any) => ({ ...f, pincode: e.target.value }))} /></div>
            </div>
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
