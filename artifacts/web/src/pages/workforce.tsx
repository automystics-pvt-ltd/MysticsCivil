import { useState, useEffect } from "react";
import { useConfirm } from "@/hooks/use-confirm";
import { useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Users, CalendarCheck, Wallet, FileSpreadsheet,
  ClipboardCheck, AlertTriangle, ShieldCheck, HardHat,
  Plus, CheckCircle, XCircle, Clock, Flame, Zap,
  Construction, AlertCircle, TrendingUp, BarChart3,
  FlaskConical, Banknote, Download, FileText, Activity,
} from "lucide-react";

const IS_CODE_TEST_TYPES = ["concrete_cube_7","concrete_cube_14","concrete_cube_28","tensile","sieve_analysis","proctor","water_absorption","compression_brick","cbr"] as const;
const IS_CODE_LABELS: Record<string,string> = {
  concrete_cube_7:"Concrete Cube (7-day)", concrete_cube_14:"Concrete Cube (14-day)", concrete_cube_28:"Concrete Cube (28-day)",
  tensile:"Tensile (Rebar)", sieve_analysis:"Sieve Analysis", proctor:"Proctor Compaction",
  water_absorption:"Water Absorption (Brick)", compression_brick:"Compression (Brick)", cbr:"CBR Test",
};
const IS_CODE_LIMITS: Record<string,{ref:string;unit:string;minValue?:number;maxValue?:number}> = {
  concrete_cube_7:{ref:"IS 456:2000 Cl 15.4",unit:"N/mm²",minValue:16},
  concrete_cube_14:{ref:"IS 456:2000 Cl 15.4",unit:"N/mm²",minValue:22},
  concrete_cube_28:{ref:"IS 456:2000 Cl 15.4",unit:"N/mm²",minValue:25},
  tensile:{ref:"IS 1786:2008",unit:"N/mm²",minValue:500},
  sieve_analysis:{ref:"IS 383:2016 Zone II",unit:"% FM",minValue:2.6,maxValue:3.2},
  proctor:{ref:"IS 2720 Part 7",unit:"kN/m³",minValue:18},
  water_absorption:{ref:"IS 1077:1992 Cl 8",unit:"%",maxValue:20},
  compression_brick:{ref:"IS 1077:1992 Cl 7.1",unit:"N/mm²",minValue:3.5},
  cbr:{ref:"IRC 37:2012",unit:"%",minValue:8},
};

const API = "/api";

async function api(path: string, opts?: RequestInit) {
  const r = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...opts,
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(text || r.statusText);
  }
  return r.json();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const TRADES = ["mason","carpenter","plumber","electrician","welder","painter","steel_fixer","helper","operator","driver","supervisor","other"];
const SKILLS = ["unskilled","semi_skilled","skilled","highly_skilled"];
const PPE_TYPES = ["helmet","vest","gloves","boots","harness","goggles","ear_protection","face_shield","respirator"];
const PERMIT_TYPES = ["hot_work","height","confined_space","electrical","excavation"];
const INCIDENT_CLASSES = ["near_miss","first_aid","lti","fatality","property_damage"];

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active: "bg-green-100 text-green-800", inactive: "bg-gray-100 text-gray-700",
    terminated: "bg-red-100 text-red-800", draft: "bg-gray-100 text-gray-700",
    computed: "bg-blue-100 text-blue-800", approved: "bg-green-100 text-green-800",
    paid: "bg-purple-100 text-purple-800", pending: "bg-yellow-100 text-yellow-800",
    passed: "bg-green-100 text-green-800", failed: "bg-red-100 text-red-800",
    open: "bg-red-100 text-red-800", capa_submitted: "bg-orange-100 text-orange-800",
    re_inspection: "bg-blue-100 text-blue-800", closed: "bg-gray-100 text-gray-700",
    minor: "bg-yellow-100 text-yellow-800", major: "bg-orange-100 text-orange-800",
    critical: "bg-red-100 text-red-800", extreme: "bg-red-200 text-red-900",
    high: "bg-orange-100 text-orange-800", medium: "bg-yellow-100 text-yellow-800",
    low: "bg-green-100 text-green-800", active_permit: "bg-green-100 text-green-800",
    near_miss: "bg-yellow-100 text-yellow-800", first_aid: "bg-blue-100 text-blue-800",
    lti: "bg-orange-100 text-orange-800", fatality: "bg-red-200 text-red-900",
    property_damage: "bg-purple-100 text-purple-800",
  };
  return map[status] ?? "bg-gray-100 text-gray-700";
}

function fmt(v: any) { return v != null && v !== "" ? String(v) : "—"; }
function fmtCur(v: any) { const n = parseFloat(v ?? "0"); return isNaN(n) ? "—" : `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`; }
function fmtDate(v: any) { if (!v) return "—"; return new Date(v).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" }); }
function permitIcon(type: string) {
  const map: Record<string, any> = { hot_work: Flame, height: Construction, electrical: Zap, confined_space: AlertTriangle, excavation: Construction };
  const Icon = map[type] ?? ShieldCheck;
  return <Icon className="h-4 w-4 inline mr-1" />;
}

// ─── Workers Tab ──────────────────────────────────────────────────────────────
function WorkersTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const { data: workers = [], isLoading } = useQuery({
    queryKey: ["workers", projectId],
    queryFn: () => api(`/projects/${projectId}/workers`),
    enabled: !!projectId,
  });

  const create = useMutation({
    mutationFn: (body: any) => api(`/projects/${projectId}/workers`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["workers", projectId] }); setOpen(false); setForm({}); toast({ title: "Worker registered" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const tradeCount: Record<string, number> = {};
  for (const w of workers) tradeCount[w.trade] = (tradeCount[w.trade] ?? 0) + 1;
  const activeCount = workers.filter((w: any) => w.status === "active").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{workers.length}</div><div className="text-sm text-muted-foreground">Total Workers</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-green-600">{activeCount}</div><div className="text-sm text-muted-foreground">Active</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{Object.keys(tradeCount).length}</div><div className="text-sm text-muted-foreground">Trades</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{workers.filter((w: any) => w.bocwRegNumber).length}</div><div className="text-sm text-muted-foreground">BOCW Registered</div></CardContent></Card>
      </div>
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-lg">Worker Register</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Register Worker</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Register Worker</DialogTitle></DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
              {[["name","Full Name"],["aadhaarNumber","Aadhaar"],["phone","Phone"],["email","Email (for wage slip delivery)"]].map(([k, lbl]) => (
                <div key={k} className="col-span-2 space-y-1"><Label>{lbl}</Label><Input type={k==="email"?"email":"text"} value={form[k]??""} onChange={e=>f(k,e.target.value)} /></div>
              ))}
              <div className="space-y-1"><Label>Trade</Label>
                <Select value={form.trade??""} onValueChange={v=>f("trade",v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{TRADES.map(t=><SelectItem key={t} value={t}>{t.replace(/_/g," ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Skill Level</Label>
                <Select value={form.skillLevel??""} onValueChange={v=>f("skillLevel",v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{SKILLS.map(s=><SelectItem key={s} value={s}>{s.replace(/_/g," ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {[["dailyRate","Daily Rate (₹)"],["bocwRegNumber","BOCW Reg No."],["pfNumber","PF Number"],["uan","UAN (12 digits)"],["esiNumber","ESI Number"],["bankName","Bank Name"],["accountNumber","Account No."],["ifscCode","IFSC"]].map(([k,lbl])=>(
                <div key={k} className="space-y-1"><Label>{lbl}</Label><Input value={form[k]??""} onChange={e=>f(k,e.target.value)} /></div>
              ))}
            </div>
            <Button className="w-full" onClick={() => create.mutate(form)} disabled={!form.name || !form.trade || create.isPending}>
              {create.isPending ? "Registering…" : "Register Worker"}
            </Button>
          </DialogContent>
        </Dialog>
      </div>
      {isLoading ? <div className="text-muted-foreground text-sm">Loading…</div> : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>{["Code","Name","Trade","Skill","Daily Rate","UAN","PF No.","BOCW","Status"].map(h=><th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {workers.map((w: any) => (
                <tr key={w.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono text-xs">{w.workerCode}</td>
                  <td className="px-3 py-2 font-medium">{w.name}</td>
                  <td className="px-3 py-2">{w.trade?.replace(/_/g," ")}</td>
                  <td className="px-3 py-2">{w.skillLevel?.replace(/_/g," ")}</td>
                  <td className="px-3 py-2">{fmtCur(w.dailyRate)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{fmt(w.uan)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{fmt(w.pfNumber)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{fmt(w.bocwRegNumber)}</td>
                  <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-xs font-medium ${statusBadge(w.status)}`}>{w.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Attendance Tab ────────────────────────────────────────────────────────────
function AttendanceTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { confirm: askConfirm, dialog: confirmDialog } = useConfirm();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({ attendanceDate: new Date().toISOString().slice(0, 10) });
  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const { data: workers = [] } = useQuery({ queryKey: ["workers", projectId], queryFn: () => api(`/projects/${projectId}/workers`), enabled: !!projectId });
  const { data: records = [], isLoading } = useQuery({
    queryKey: ["attendance", projectId], queryFn: () => api(`/projects/${projectId}/attendance`), enabled: !!projectId,
  });

  const create = useMutation({
    mutationFn: (body: any) => api(`/projects/${projectId}/attendance`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["attendance", projectId] }); setOpen(false); toast({ title: "Attendance recorded" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const approveOt = useMutation({
    mutationFn: (recordId: string) => api(`/attendance/${recordId}/approve-ot`, { method: "PATCH", body: "{}" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["attendance", projectId] }); toast({ title: "OT Approved" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const todayRecords = records.filter((r: any) => new Date(r.attendanceDate).toDateString() === new Date().toDateString());
  const totalOt = records.reduce((s: number, r: any) => s + parseFloat(r.overtimeHours ?? "0"), 0);
  const pendingOt = (records as any[]).filter((r: any) => parseFloat(r.overtimeHours ?? "0") > 0 && !r.otApproved);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{records.length}</div><div className="text-sm text-muted-foreground">Total Records (2 weeks)</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-blue-600">{todayRecords.length}</div><div className="text-sm text-muted-foreground">Today Present</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-orange-600">{Math.round(totalOt * 10) / 10}h</div><div className="text-sm text-muted-foreground">Total OT (period)</div></CardContent></Card>
      </div>
      {pendingOt.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-orange-800 flex items-center gap-2"><Clock className="h-4 w-4" />OT Approval Queue ({pendingOt.length} pending)</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1">
              {pendingOt.map((r: any) => {
                const w = (workers as any[]).find(wk => wk.id === r.workerId);
                return (
                  <div key={r.id} className="flex items-center justify-between bg-white rounded p-2 border border-orange-100">
                    <div>
                      <span className="text-sm font-medium">{w?.name ?? "Worker"}</span>
                      <span className="text-xs text-muted-foreground ml-2">{fmtDate(r.attendanceDate)} · {r.overtimeHours}h OT</span>
                    </div>
                    <Button size="sm" variant="outline" className="text-orange-700 border-orange-300 hover:bg-orange-100" disabled={approveOt.isPending} onClick={async () => { if (!(await askConfirm({ title: "Approve overtime?", description: `${r.overtimeHours}h OT for ${w?.name ?? "this worker"} on ${fmtDate(r.attendanceDate)}.`, confirmLabel: "Approve" }))) return; approveOt.mutate(r.id); }}>
                      <CheckCircle className="h-3 w-3 mr-1" />Approve
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
      {confirmDialog}
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Attendance Register</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Mark Attendance</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Record Attendance</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1"><Label>Worker</Label>
                <Select value={form.workerId??""} onValueChange={v=>f("workerId",v)}>
                  <SelectTrigger><SelectValue placeholder="Select worker" /></SelectTrigger>
                  <SelectContent>{(workers as any[]).map(w=><SelectItem key={w.id} value={w.id}>{w.name} ({w.workerCode})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Date</Label><Input type="date" value={form.attendanceDate??""} onChange={e=>f("attendanceDate",e.target.value)} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Mark In</Label><Input type="time" value={form.markInTime??""} onChange={e=>f("markInTime",e.target.value)} /></div>
                <div className="space-y-1"><Label>Mark Out</Label><Input type="time" value={form.markOutTime??""} onChange={e=>f("markOutTime",e.target.value)} /></div>
              </div>
              <div className="space-y-1"><Label>Remarks</Label><Input value={form.remarks??""} onChange={e=>f("remarks",e.target.value)} /></div>
            </div>
            <Button className="w-full" disabled={!form.workerId || !form.attendanceDate || create.isPending} onClick={() => {
              const body: any = { ...form };
              if (form.markInTime) body.markInTime = `${form.attendanceDate}T${form.markInTime}:00`;
              if (form.markOutTime) body.markOutTime = `${form.attendanceDate}T${form.markOutTime}:00`;
              create.mutate(body);
            }}>{create.isPending ? "Saving…" : "Record Attendance"}</Button>
          </DialogContent>
        </Dialog>
      </div>
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>{["Date","Worker","Mark In","Mark Out","Hours","OT Hrs","OT Approved","Geofence"].map(h=><th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td colSpan={8} className="px-3 py-4 text-center text-muted-foreground">Loading…</td></tr> :
            (records as any[]).slice(0, 50).map((r: any) => {
              const worker = (workers as any[]).find(w => w.id === r.workerId);
              return (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2">{fmtDate(r.attendanceDate)}</td>
                  <td className="px-3 py-2 font-medium">{worker?.name ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.markInTime ? new Date(r.markInTime).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}) : "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.markOutTime ? new Date(r.markOutTime).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}) : "—"}</td>
                  <td className="px-3 py-2">{fmt(r.hoursWorked)}h</td>
                  <td className="px-3 py-2 text-orange-600">{parseFloat(r.overtimeHours??0) > 0 ? `${r.overtimeHours}h` : "—"}</td>
                  <td className="px-3 py-2">{r.otApproved ? <CheckCircle className="h-4 w-4 text-green-500" /> : parseFloat(r.overtimeHours??0) > 0 ? <Clock className="h-4 w-4 text-yellow-500" /> : "—"}</td>
                  <td className="px-3 py-2">{r.withinGeofence ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Payroll Tab ──────────────────────────────────────────────────────────────
function PayrollTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const { data: periods = [], isLoading } = useQuery({
    queryKey: ["payroll", projectId], queryFn: () => api(`/projects/${projectId}/payroll-periods`), enabled: !!projectId,
  });
  const { data: lines = [] } = useQuery({
    queryKey: ["payroll-lines", selectedPeriod], queryFn: () => api(`/payroll-periods/${selectedPeriod}/lines`),
    enabled: !!selectedPeriod,
  });
  const { data: workers = [] } = useQuery({ queryKey: ["workers", projectId], queryFn: () => api(`/projects/${projectId}/workers`), enabled: !!projectId });

  const create = useMutation({
    mutationFn: (b: any) => api(`/projects/${projectId}/payroll-periods`, { method: "POST", body: JSON.stringify(b) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payroll", projectId] }); setOpen(false); setForm({}); toast({ title: "Period created" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const compute = useMutation({
    mutationFn: (id: string) => api(`/payroll-periods/${id}/compute`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payroll", projectId] }); toast({ title: "Payroll computed — EPF/ESI/PT/LWF calculated" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const approve = useMutation({
    mutationFn: (id: string) => api(`/payroll-periods/${id}/approve`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payroll", projectId] }); toast({ title: "Payroll approved" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const workerMap = Object.fromEntries((workers as any[]).map(w => [w.id, w.name]));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Payroll Periods</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />New Period</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Payroll Period</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1"><Label>Period Name</Label><Input placeholder="May 2026 — Week 1" value={form.periodName??""} onChange={e=>f("periodName",e.target.value)} /></div>
              <div className="space-y-1"><Label>Type</Label>
                <Select value={form.periodType??"monthly"} onValueChange={v=>f("periodType",v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="weekly">Weekly</SelectItem><SelectItem value="fortnightly">Fortnightly</SelectItem><SelectItem value="monthly">Monthly</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1"><Label>From Date</Label><Input type="date" value={form.fromDate??""} onChange={e=>f("fromDate",e.target.value)} /></div>
                <div className="space-y-1"><Label>To Date</Label><Input type="date" value={form.toDate??""} onChange={e=>f("toDate",e.target.value)} /></div>
              </div>
            </div>
            <Button className="w-full" disabled={!form.periodName || !form.fromDate || !form.toDate || create.isPending} onClick={() => create.mutate(form)}>
              {create.isPending ? "Creating…" : "Create Period"}
            </Button>
          </DialogContent>
        </Dialog>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {isLoading ? <div className="text-muted-foreground text-sm">Loading…</div> :
        (periods as any[]).map((p: any) => (
          <Card key={p.id} className={`cursor-pointer transition-all ${selectedPeriod === p.id ? "ring-2 ring-primary" : ""}`}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-start justify-between">
                <div onClick={() => setSelectedPeriod(selectedPeriod === p.id ? null : p.id)}>
                  <div className="font-semibold">{p.periodName}</div>
                  <div className="text-xs text-muted-foreground">{fmtDate(p.fromDate)} → {fmtDate(p.toDate)} · {p.periodType}</div>
                  <div className="flex gap-4 mt-2 text-sm">
                    <span>Gross: <strong>{fmtCur(p.totalGross)}</strong></span>
                    <span>Deductions: <strong>{fmtCur(p.totalDeductions)}</strong></span>
                    <span>Net: <strong className="text-green-600">{fmtCur(p.totalNet)}</strong></span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusBadge(p.status)}`}>{p.status}</span>
                  {p.status === "draft" && <Button size="sm" variant="outline" onClick={() => compute.mutate(p.id)} disabled={compute.isPending}>Compute</Button>}
                  {p.status === "computed" && <Button size="sm" onClick={() => approve.mutate(p.id)} disabled={approve.isPending}>Approve</Button>}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {selectedPeriod && lines.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium">Wage Bill Detail</h4>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>{["Worker","Days","OT hrs","Basic","OT Amt","Gross","EPF Ee","ESI Ee","PT","LWF","Deductions","Net Wages"].map(h=><th key={h} className="px-2 py-2 text-right first:text-left font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {(lines as any[]).map((l: any) => (
                  <tr key={l.id} className="border-t hover:bg-muted/30">
                    <td className="px-2 py-1.5 font-medium">{workerMap[l.workerId] ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right">{l.presentDays}</td>
                    <td className="px-2 py-1.5 text-right">{l.otHours}</td>
                    <td className="px-2 py-1.5 text-right">{fmtCur(l.basicWages)}</td>
                    <td className="px-2 py-1.5 text-right">{fmtCur(l.otAmount)}</td>
                    <td className="px-2 py-1.5 text-right font-medium">{fmtCur(l.grossWages)}</td>
                    <td className="px-2 py-1.5 text-right text-red-600">{fmtCur(l.epfEmployee)}</td>
                    <td className="px-2 py-1.5 text-right text-red-600">{fmtCur(l.esiEmployee)}</td>
                    <td className="px-2 py-1.5 text-right text-red-600">{fmtCur(l.pt)}</td>
                    <td className="px-2 py-1.5 text-right text-red-600">{fmtCur(l.lwf)}</td>
                    <td className="px-2 py-1.5 text-right text-red-600">{fmtCur(l.totalDeductions)}</td>
                    <td className="px-2 py-1.5 text-right font-semibold text-green-700">{fmtCur(l.netWages)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ITP Tab ──────────────────────────────────────────────────────────────────
function ItpTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { confirm: askConfirm, dialog: confirmDialog } = useConfirm();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<any>(null);
  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const { data: itps = [], isLoading } = useQuery({ queryKey: ["itps", projectId], queryFn: () => api(`/projects/${projectId}/itps`), enabled: !!projectId });
  const { data: detail } = useQuery({ queryKey: ["itp-detail", selected?.id], queryFn: () => api(`/itps/${selected.id}`), enabled: !!selected?.id });

  const create = useMutation({
    mutationFn: (b: any) => api(`/projects/${projectId}/itps`, { method: "POST", body: JSON.stringify(b) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["itps", projectId] }); setOpen(false); toast({ title: "ITP created" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const approveMut = useMutation({
    mutationFn: (id: string) => api(`/itps/${id}/approve`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["itps", projectId] }); toast({ title: "ITP approved" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="md:col-span-1 space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold">Inspection Test Plans</h3>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />New ITP</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create ITP</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-1"><Label>Title</Label><Input value={form.title??""} onChange={e=>f("title",e.target.value)} placeholder="e.g. RCC Slab ITP" /></div>
                <div className="space-y-1"><Label>Revision</Label><Input value={form.revision??"0"} onChange={e=>f("revision",e.target.value)} /></div>
              </div>
              <Button className="w-full" disabled={!form.title || create.isPending} onClick={() => create.mutate(form)}>{create.isPending ? "Creating…" : "Create ITP"}</Button>
            </DialogContent>
          </Dialog>
        </div>
        {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> :
        (itps as any[]).map((itp: any) => (
          <Card key={itp.id} className={`cursor-pointer hover:shadow transition-all ${selected?.id === itp.id ? "ring-2 ring-primary" : ""}`} onClick={() => setSelected(itp)}>
            <CardContent className="pt-3 pb-3">
              <div className="font-medium text-sm">{itp.title}</div>
              <div className="text-xs text-muted-foreground">Rev {itp.revision}</div>
              <div className="flex justify-between items-center mt-1">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusBadge(itp.status)}`}>{itp.status}</span>
                {itp.status === "draft" && (
                  <Button size="sm" variant="outline" onClick={async e => { e.stopPropagation(); if (!(await askConfirm({ title: "Approve ITP?", description: `"${itp.title}" will be marked as approved.`, confirmLabel: "Approve" }))) return; approveMut.mutate(itp.id); }} disabled={approveMut.isPending}>Approve</Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="md:col-span-2">
        {selected && detail ? (
          <Card>
            <CardHeader><CardTitle className="text-base">{detail.title} — Hold / Witness Points</CardTitle></CardHeader>
            <CardContent>
              {detail.items?.length === 0 ? <div className="text-sm text-muted-foreground">No checkpoints added yet.</div> : (
                <div className="space-y-2">
                  {(detail.items ?? []).map((item: any, i: number) => (
                    <div key={item.id} className="rounded border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-medium">{i+1}. {item.activityDescription}</div>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${item.checkPointType === "hold" ? "bg-red-100 text-red-800" : item.checkPointType === "witness" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-700"}`}>{item.checkPointType}</span>
                      </div>
                      {item.acceptanceCriteria && <div className="text-xs text-muted-foreground mt-1">✓ {item.acceptanceCriteria}</div>}
                      {item.referenceCode && <div className="text-xs text-blue-600 mt-0.5">Ref: {item.referenceCode}</div>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm border rounded-lg p-8">Select an ITP to view checkpoints</div>
        )}
      </div>
      {confirmDialog}
    </div>
  );
}

// ─── Inspection Requests Tab ───────────────────────────────────────────────────
function InspectionsTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({ inspectionDate: new Date().toISOString().slice(0,10) });
  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const { data: irs = [], isLoading } = useQuery({ queryKey: ["irs", projectId], queryFn: () => api(`/projects/${projectId}/inspection-requests`), enabled: !!projectId });

  const create = useMutation({
    mutationFn: (b: any) => api(`/projects/${projectId}/inspection-requests`, { method: "POST", body: JSON.stringify(b) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["irs", projectId] }); setOpen(false); toast({ title: "Inspection Request raised" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const [recordOpen, setRecordOpen] = useState(false);
  const [recordingIr, setRecordingIr] = useState<any>(null);
  const [recordForm, setRecordForm] = useState<Record<string,string>>({ result: "passed" });
  const rf = (k: string, v: string) => setRecordForm(p => ({ ...p, [k]: v }));
  const recordResult = useMutation({
    mutationFn: ({ irId, body }: { irId: string; body: any }) => api(`/inspection-requests/${irId}/record`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["irs", projectId] }); setRecordOpen(false); setRecordingIr(null); toast({ title: "Inspection result recorded" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const passed = (irs as any[]).filter(r => r.result === "passed").length;
  const failed = (irs as any[]).filter(r => r.result === "failed").length;
  const pending = (irs as any[]).filter(r => r.status === "pending").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{irs.length}</div><div className="text-sm text-muted-foreground">Total IRs</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-yellow-600">{pending}</div><div className="text-sm text-muted-foreground">Pending</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-green-600">{passed}</div><div className="text-sm text-muted-foreground">Passed</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-red-600">{failed}</div><div className="text-sm text-muted-foreground">Failed</div></CardContent></Card>
      </div>
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Inspection Requests</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Raise IR</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Raise Inspection Request</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1"><Label>Inspection Date</Label><Input type="date" value={form.inspectionDate??""} onChange={e=>f("inspectionDate",e.target.value)} /></div>
              <div className="space-y-1"><Label>Location</Label><Input value={form.location??""} onChange={e=>f("location",e.target.value)} /></div>
              <div className="space-y-1"><Label>Notes</Label><Textarea value={form.notes??""} onChange={e=>f("notes",e.target.value)} rows={3} /></div>
            </div>
            <Button className="w-full" disabled={!form.inspectionDate || create.isPending} onClick={() => create.mutate(form)}>{create.isPending ? "Raising…" : "Raise IR"}</Button>
          </DialogContent>
        </Dialog>
      </div>
      <Dialog open={recordOpen} onOpenChange={v => { setRecordOpen(v); if (!v) setRecordingIr(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Record Inspection — {recordingIr?.irNumber}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><Label>Overall Result</Label>
              <Select value={recordForm.result} onValueChange={v=>rf("result",v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="passed">Passed</SelectItem><SelectItem value="failed">Failed / NCR Required</SelectItem><SelectItem value="conditional">Conditional Accept</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Checklist Items ✓ Passed</Label><Input type="number" min={0} value={recordForm.checklistPassed??""} onChange={e=>rf("checklistPassed",e.target.value)} placeholder="e.g. 12" /></div>
              <div className="space-y-1"><Label>Checklist Items ✗ Failed</Label><Input type="number" min={0} value={recordForm.checklistFailed??""} onChange={e=>rf("checklistFailed",e.target.value)} placeholder="e.g. 2" /></div>
            </div>
            <div className="space-y-1"><Label>Inspector Observations</Label><Textarea value={recordForm.remarks??""} onChange={e=>rf("remarks",e.target.value)} rows={3} placeholder="Note deviations, measurements, conditions…" /></div>
            <div className="space-y-1"><Label>Recorded By</Label><Input value={recordForm.inspectedBy??""} onChange={e=>rf("inspectedBy",e.target.value)} placeholder="Inspector name / designation" /></div>
          </div>
          <Button className="w-full" disabled={recordResult.isPending} onClick={() => {
            const passed = Math.max(0, parseInt(recordForm.checklistPassed ?? "0") || 0);
            const failed = Math.max(0, parseInt(recordForm.checklistFailed ?? "0") || 0);
            const checklist: any[] = [];
            for (let i = 0; i < passed; i++) checklist.push({ parameter: `Item ${i+1}`, passed: true });
            for (let i = 0; i < failed; i++) checklist.push({ parameter: `Item ${passed+i+1}`, passed: false });
            recordResult.mutate({ irId: recordingIr.id, body: {
              result: recordForm.result,
              notes: [recordForm.remarks, recordForm.inspectedBy && `— Inspected by ${recordForm.inspectedBy}`].filter(Boolean).join(" "),
              checklist,
            }});
          }}>
            {recordResult.isPending ? "Saving…" : "Record Result"}
          </Button>
        </DialogContent>
      </Dialog>
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>{["IR No.","Date","Location","Status","Result",""].map(h=><th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">Loading…</td></tr> :
            (irs as any[]).map((r: any) => (
              <tr key={r.id} className="border-t hover:bg-muted/30">
                <td className="px-3 py-2 font-mono text-xs">{r.irNumber}</td>
                <td className="px-3 py-2">{fmtDate(r.inspectionDate)}</td>
                <td className="px-3 py-2">{fmt(r.location)}</td>
                <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-xs font-medium ${statusBadge(r.status)}`}>{r.status}</span></td>
                <td className="px-3 py-2">{r.result ? <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.result === "passed" ? "bg-green-100 text-green-800" : r.result === "conditional" ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"}`}>{r.result}</span> : "—"}</td>
                <td className="px-3 py-2">
                  {r.status === "pending" && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setRecordingIr(r); setRecordForm({ result: "passed" }); setRecordOpen(true); }}>
                      <ClipboardCheck className="h-3 w-3 mr-1" />Record
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── NCR Tab ──────────────────────────────────────────────────────────────────
function NcrTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<any>(null);
  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const { data: ncrs = [], isLoading } = useQuery({ queryKey: ["ncrs", projectId], queryFn: () => api(`/projects/${projectId}/ncrs`), enabled: !!projectId });
  const { data: detail } = useQuery({ queryKey: ["ncr-detail", selected?.id], queryFn: () => api(`/ncrs/${selected.id}`), enabled: !!selected?.id });

  const create = useMutation({
    mutationFn: (b: any) => api(`/projects/${projectId}/ncrs`, { method: "POST", body: JSON.stringify(b) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ncrs", projectId] }); setOpen(false); toast({ title: "NCR raised" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const patchNcr = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api(`/ncrs/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: (_, vars) => { qc.invalidateQueries({ queryKey: ["ncrs", projectId] }); qc.invalidateQueries({ queryKey: ["ncr-detail", vars.id] }); toast({ title: "NCR updated" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const [capaOpen, setCapaOpen] = useState(false);
  const [capa, setCapa] = useState<Record<string,string>>({ actionType: "capa" });
  const cf = (k: string, v: string) => setCapa(p => ({ ...p, [k]: v }));
  const addCapa = useMutation({
    mutationFn: (b: any) => api(`/ncrs/${selected?.id}/actions`, { method: "POST", body: JSON.stringify(b) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ncr-detail", selected?.id] }); qc.invalidateQueries({ queryKey: ["ncrs", projectId] }); setCapaOpen(false); setCapa({ actionType: "capa" }); toast({ title: "CAPA action added" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const open_ = (ncrs as any[]).filter(n => n.status === "open").length;
  const closed = (ncrs as any[]).filter(n => n.status === "closed").length;
  const critical = (ncrs as any[]).filter(n => n.severity === "critical").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{ncrs.length}</div><div className="text-sm text-muted-foreground">Total NCRs</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-red-600">{open_}</div><div className="text-sm text-muted-foreground">Open</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-orange-600">{critical}</div><div className="text-sm text-muted-foreground">Critical</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-green-600">{closed}</div><div className="text-sm text-muted-foreground">Closed</div></CardContent></Card>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-1 space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold">NCR List</h3>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Raise NCR</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Raise NCR</DialogTitle></DialogHeader>
                <div className="space-y-3 py-2">
                  <div className="space-y-1"><Label>Trade</Label><Input value={form.trade??""} onChange={e=>f("trade",e.target.value)} /></div>
                  <div className="space-y-1"><Label>Severity</Label>
                    <Select value={form.severity??"minor"} onValueChange={v=>f("severity",v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="minor">Minor</SelectItem><SelectItem value="major">Major</SelectItem><SelectItem value="critical">Critical</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1"><Label>Description</Label><Textarea value={form.description??""} onChange={e=>f("description",e.target.value)} rows={3} /></div>
                  <div className="space-y-1"><Label>Root Cause</Label><Textarea value={form.rootCause??""} onChange={e=>f("rootCause",e.target.value)} rows={2} /></div>
                </div>
                <Button className="w-full" disabled={!form.description || create.isPending} onClick={() => create.mutate(form)}>{create.isPending ? "Raising…" : "Raise NCR"}</Button>
              </DialogContent>
            </Dialog>
          </div>
          {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> :
          (ncrs as any[]).map((n: any) => (
            <Card key={n.id} className={`cursor-pointer hover:shadow transition-all ${selected?.id === n.id ? "ring-2 ring-primary" : ""}`} onClick={() => setSelected(n)}>
              <CardContent className="pt-3 pb-3">
                <div className="flex justify-between items-start">
                  <div className="font-mono text-xs text-muted-foreground">{n.ncrNumber}</div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusBadge(n.severity)}`}>{n.severity}</span>
                </div>
                <div className="text-sm font-medium mt-1 line-clamp-2">{n.description}</div>
                <div className="flex justify-between items-center mt-1">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusBadge(n.status)}`}>{n.status.replace(/_/g," ")}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="md:col-span-2">
          {selected && detail ? (
            <Card>
              <CardHeader><CardTitle className="text-base">{detail.ncrNumber} — {detail.severity.toUpperCase()}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div><Label className="text-xs">Description</Label><p className="text-sm mt-1">{detail.description}</p></div>
                {detail.rootCause && <div><Label className="text-xs">Root Cause</Label><p className="text-sm mt-1">{detail.rootCause}</p></div>}
                {detail.reworkCost && parseFloat(detail.reworkCost) > 0 && <div><Label className="text-xs">Rework Cost</Label><p className="text-sm mt-1 font-semibold">{fmtCur(detail.reworkCost)}</p></div>}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs">CAPA Actions & Lifecycle</Label>
                    <Dialog open={capaOpen} onOpenChange={setCapaOpen}>
                      <DialogTrigger asChild><Button size="sm" variant="outline" className="h-7 text-xs"><Plus className="h-3 w-3 mr-1" />Add CAPA</Button></DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Add CAPA Action — {detail.ncrNumber}</DialogTitle></DialogHeader>
                        <div className="space-y-3 py-2">
                          <div className="space-y-1"><Label>Action Type</Label>
                            <Select value={capa.actionType} onValueChange={v=>cf("actionType",v)}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="capa">CAPA (Corrective/Preventive)</SelectItem>
                                <SelectItem value="re_inspection">Request Re-Inspection</SelectItem>
                                <SelectItem value="rework">Rework</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1"><Label>Description</Label><Textarea value={capa.description??""} onChange={e=>cf("description",e.target.value)} rows={3} placeholder="e.g. Re-bar provided as per BBS; cube test scheduled for 24 May" /></div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1"><Label>Responsible</Label><Input value={capa.responsible??""} onChange={e=>cf("responsible",e.target.value)} placeholder="Site engineer" /></div>
                            <div className="space-y-1"><Label>Due Date</Label><Input type="date" value={capa.dueDate??""} onChange={e=>cf("dueDate",e.target.value)} /></div>
                          </div>
                        </div>
                        <Button className="w-full" disabled={!capa.description || addCapa.isPending} onClick={() => addCapa.mutate(capa)}>{addCapa.isPending ? "Saving…" : "Submit CAPA"}</Button>
                      </DialogContent>
                    </Dialog>
                  </div>
                  {(detail.actions ?? []).length === 0 ? <div className="text-sm text-muted-foreground">No CAPA actions yet — submit one to start the lifecycle</div> :
                  (detail.actions ?? []).map((a: any) => (
                    <div key={a.id} className="border rounded p-2 mb-2">
                      <div className="text-xs font-medium text-blue-600">{a.actionType.replace(/_/g," ").toUpperCase()}</div>
                      <div className="text-sm">{a.description}</div>
                      {a.dueDate && <div className="text-xs text-muted-foreground">Due: {fmtDate(a.dueDate)}</div>}
                    </div>
                  ))}
                  {detail.status !== "closed" && (detail.actions ?? []).length > 0 && (
                    <div className="flex gap-2 mt-3 pt-3 border-t">
                      {detail.status === "capa_submitted" && (
                        <Button size="sm" variant="outline" onClick={() => patchNcr.mutate({ id: detail.id, body: { status: "re_inspection" } })}>
                          <Activity className="h-3 w-3 mr-1" />Mark Re-Inspection
                        </Button>
                      )}
                      {detail.status === "re_inspection" && (
                        <Button size="sm" onClick={() => patchNcr.mutate({ id: detail.id, body: { status: "closed" } })}>
                          <CheckCircle className="h-3 w-3 mr-1" />Verify & Close NCR
                        </Button>
                      )}
                      {detail.status !== "capa_submitted" && detail.status !== "re_inspection" && (
                        <div className="text-xs text-muted-foreground">Submit a CAPA action to advance the lifecycle.</div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : <div className="flex items-center justify-center h-full text-muted-foreground text-sm border rounded-lg p-8">Select an NCR to view details</div>}
        </div>
      </div>
    </div>
  );
}

// ─── Safety Permits Tab ────────────────────────────────────────────────────────
function PermitsTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({
    startDateTime: `${new Date().toISOString().slice(0, 10)}T08:00`,
    endDateTime: `${new Date().toISOString().slice(0, 10)}T18:00`,
  });
  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const { data: permits = [], isLoading } = useQuery({ queryKey: ["permits", projectId], queryFn: () => api(`/projects/${projectId}/safety-permits`), enabled: !!projectId });

  const create = useMutation({
    mutationFn: (b: any) => api(`/projects/${projectId}/safety-permits`, { method: "POST", body: JSON.stringify(b) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["permits", projectId] }); setOpen(false); toast({ title: "Permit raised" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const patchPermit = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api(`/safety-permits/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["permits", projectId] }); toast({ title: "Permit updated" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Permit-to-Work Board</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />New Permit</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Issue Permit to Work</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1"><Label>Permit Type</Label>
                <Select value={form.permitType??""} onValueChange={v=>f("permitType",v)}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>{PERMIT_TYPES.map(t=><SelectItem key={t} value={t}>{t.replace(/_/g," ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Work Description</Label><Textarea value={form.workDescription??""} onChange={e=>f("workDescription",e.target.value)} rows={2} /></div>
              <div className="space-y-1"><Label>Location</Label><Input value={form.location??""} onChange={e=>f("location",e.target.value)} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Start</Label><Input type="datetime-local" value={form.startDateTime??""} onChange={e=>f("startDateTime",e.target.value)} /></div>
                <div className="space-y-1"><Label>End</Label><Input type="datetime-local" value={form.endDateTime??""} onChange={e=>f("endDateTime",e.target.value)} /></div>
              </div>
              <div className="space-y-1"><Label>Hazards</Label><Textarea value={form.hazards??""} onChange={e=>f("hazards",e.target.value)} rows={2} /></div>
              <div className="space-y-1"><Label>Precautions</Label><Textarea value={form.precautions??""} onChange={e=>f("precautions",e.target.value)} rows={2} /></div>
            </div>
            <Button className="w-full" disabled={!form.permitType || !form.workDescription || create.isPending} onClick={() => create.mutate(form)}>{create.isPending ? "Creating…" : "Issue Permit"}</Button>
          </DialogContent>
        </Dialog>
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> :
        (permits as any[]).map((p: any) => (
          <Card key={p.id}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-medium text-muted-foreground">{permitIcon(p.permitType)}{p.permitType.replace(/_/g," ").toUpperCase()}</div>
                  <div className="font-mono text-xs">{p.permitNumber}</div>
                  <div className="text-sm font-medium mt-1 line-clamp-2">{p.workDescription}</div>
                  {p.location && <div className="text-xs text-muted-foreground">{p.location}</div>}
                  <div className="text-xs text-muted-foreground mt-1">{fmtDate(p.startDateTime)} → {new Date(p.endDateTime).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</div>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusBadge(p.status)}`}>{p.status}</span>
                <div className="flex gap-1">
                  {p.status === "pending" && <Button size="sm" variant="outline" onClick={() => patchPermit.mutate({ id: p.id, body: { status: "approved" } })} disabled={patchPermit.isPending}>Approve</Button>}
                  {p.status === "approved" && <Button size="sm" onClick={() => patchPermit.mutate({ id: p.id, body: { status: "active" } })} disabled={patchPermit.isPending}>Activate</Button>}
                  {p.status === "active" && <Button size="sm" variant="outline" onClick={() => patchPermit.mutate({ id: p.id, body: { status: "closed" } })} disabled={patchPermit.isPending}>Close</Button>}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── HIRA Tab ─────────────────────────────────────────────────────────────────
function HiraTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({ likelihood: "3", severity: "3", residualLikelihood: "2", residualSeverity: "2" });
  const f = (k: string, v: string) => setForm((p: any) => ({ ...p, [k]: v }));

  const { data: hira = [], isLoading } = useQuery({ queryKey: ["hira", projectId], queryFn: () => api(`/projects/${projectId}/hira`), enabled: !!projectId });

  const create = useMutation({
    mutationFn: (b: any) => api(`/projects/${projectId}/hira`, { method: "POST", body: JSON.stringify(b) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hira", projectId] }); setOpen(false); toast({ title: "HIRA entry added" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const riskColor = (level: string) => ({ extreme: "bg-red-200 text-red-900 border-red-300", high: "bg-orange-100 text-orange-800 border-orange-200", medium: "bg-yellow-100 text-yellow-800 border-yellow-200", low: "bg-green-100 text-green-800 border-green-200" }[level] ?? "bg-gray-100");

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">HIRA — Hazard Register</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Add Hazard</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Add HIRA Entry</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1"><Label>Hazard Description</Label><Textarea value={form.hazardDescription??""} onChange={e=>f("hazardDescription",e.target.value)} rows={2} /></div>
              <div className="space-y-1"><Label>Category</Label><Input value={form.hazardCategory??""} onChange={e=>f("hazardCategory",e.target.value)} placeholder="Physical / Chemical / Electrical…" /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[["likelihood","Likelihood (1-5)"],["severity","Severity (1-5)"]].map(([k,lbl])=>(
                  <div key={k} className="space-y-1"><Label>{lbl}</Label>
                    <Select value={String(form[k]??3)} onValueChange={v=>f(k,v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{[1,2,3,4,5].map(n=><SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <div className="space-y-1"><Label>Control Measures</Label><Textarea value={form.controlMeasures??""} onChange={e=>f("controlMeasures",e.target.value)} rows={2} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[["residualLikelihood","Residual Likelihood"],["residualSeverity","Residual Severity"]].map(([k,lbl])=>(
                  <div key={k} className="space-y-1"><Label>{lbl}</Label>
                    <Select value={String(form[k]??2)} onValueChange={v=>f(k,v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{[1,2,3,4,5].map(n=><SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
            <Button className="w-full" disabled={!form.hazardDescription || create.isPending} onClick={() => create.mutate(form)}>{create.isPending ? "Saving…" : "Add Entry"}</Button>
          </DialogContent>
        </Dialog>
      </div>
      {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : (
        <div className="space-y-2">
          {(hira as any[]).map((h: any) => (
            <div key={h.id} className={`rounded-lg border p-3 ${riskColor(h.riskLevel)}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="font-medium text-sm">{h.hazardDescription}</div>
                  {h.hazardCategory && <div className="text-xs mt-0.5 opacity-75">{h.hazardCategory}</div>}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-bold">{h.riskScore}</div>
                  <div className="text-xs uppercase font-medium">{h.riskLevel}</div>
                  <div className="text-xs opacity-75">{h.likelihood}×{h.severity}</div>
                </div>
              </div>
              {h.controlMeasures && <div className="text-xs mt-2 border-t pt-2 opacity-80">✓ {h.controlMeasures}</div>}
              <div className="text-xs mt-1 opacity-60">Residual: {h.residualLikelihood}×{h.residualSeverity} = {h.residualRiskScore}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Incidents Tab ─────────────────────────────────────────────────────────────
function IncidentsTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { confirm: askConfirm, dialog: confirmDialog } = useConfirm();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({ incidentDate: new Date().toISOString().slice(0,10), classification: "near_miss" });
  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const { data: incidents = [], isLoading } = useQuery({ queryKey: ["incidents", projectId], queryFn: () => api(`/projects/${projectId}/incidents`), enabled: !!projectId });

  const create = useMutation({
    mutationFn: (b: any) => api(`/projects/${projectId}/incidents`, { method: "POST", body: JSON.stringify(b) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["incidents", projectId] }); setOpen(false); toast({ title: "Incident reported" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const closeInc = useMutation({
    mutationFn: (id: string) => api(`/incidents/${id}`, { method: "PATCH", body: JSON.stringify({ status: "closed" }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["incidents", projectId] }); toast({ title: "Incident closed" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const clsMap: Record<string, string> = { near_miss: "Near Miss", first_aid: "First Aid", lti: "LTI", fatality: "Fatality", property_damage: "Property Damage" };
  const totalLostDays = (incidents as any[]).reduce((s: number, i: any) => s + (i.lostDays ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{incidents.length}</div><div className="text-sm text-muted-foreground">Total Incidents</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-yellow-600">{(incidents as any[]).filter(i=>i.classification==="near_miss").length}</div><div className="text-sm text-muted-foreground">Near Miss</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-red-600">{(incidents as any[]).filter(i=>["lti","fatality"].includes(i.classification)).length}</div><div className="text-sm text-muted-foreground">LTI / Fatality</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{totalLostDays}</div><div className="text-sm text-muted-foreground">Lost Days</div></CardContent></Card>
      </div>
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Incident Register</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Report Incident</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Report Incident</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1"><Label>Title</Label><Input value={form.title??""} onChange={e=>f("title",e.target.value)} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Date</Label><Input type="date" value={form.incidentDate??""} onChange={e=>f("incidentDate",e.target.value)} /></div>
                <div className="space-y-1"><Label>Classification</Label>
                  <Select value={form.classification??"near_miss"} onValueChange={v=>f("classification",v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{INCIDENT_CLASSES.map(c=><SelectItem key={c} value={c}>{clsMap[c]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1"><Label>Location</Label><Input value={form.location??""} onChange={e=>f("location",e.target.value)} /></div>
              <div className="space-y-1"><Label>Description</Label><Textarea value={form.description??""} onChange={e=>f("description",e.target.value)} rows={3} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Injured Persons</Label><Input value={form.injured??""} onChange={e=>f("injured",e.target.value)} /></div>
                <div className="space-y-1"><Label>Lost Days</Label><Input type="number" min="0" value={form.lostDays??""} onChange={e=>f("lostDays",e.target.value)} /></div>
              </div>
              <div className="space-y-1"><Label>Immediate Action</Label><Textarea value={form.immediateAction??""} onChange={e=>f("immediateAction",e.target.value)} rows={2} /></div>
            </div>
            <Button className="w-full" disabled={!form.title || !form.incidentDate || create.isPending} onClick={() => create.mutate(form)}>{create.isPending ? "Reporting…" : "Report Incident"}</Button>
          </DialogContent>
        </Dialog>
      </div>
      {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : (
        <div className="space-y-2">
          {(incidents as any[]).map((inc: any) => (
            <Card key={inc.id}>
              <CardContent className="pt-3 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-muted-foreground">{inc.incidentNumber}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusBadge(inc.classification)}`}>{clsMap[inc.classification] ?? inc.classification}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusBadge(inc.status)}`}>{inc.status}</span>
                    </div>
                    <div className="font-medium text-sm mt-1">{inc.title}</div>
                    {inc.location && <div className="text-xs text-muted-foreground">{inc.location} · {fmtDate(inc.incidentDate)}</div>}
                    {inc.immediateAction && <div className="text-xs mt-1 text-green-700">Action: {inc.immediateAction}</div>}
                    {inc.lostDays > 0 && <div className="text-xs text-red-600 mt-0.5">Lost Days: {inc.lostDays}</div>}
                  </div>
                  {inc.status === "open" && (
                    <Button size="sm" variant="outline" onClick={async () => { if (!(await askConfirm({ title: "Close this incident?", description: "The incident will be marked as closed and no further updates can be made.", confirmLabel: "Close" }))) return; closeInc.mutate(inc.id); }} disabled={closeInc.isPending}>Close</Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {confirmDialog}
    </div>
  );
}

// ─── Safety Dashboard Tab ──────────────────────────────────────────────────────
function SafetyDashboardTab({ projectId }: { projectId: string }) {
  const { data: dash, isLoading } = useQuery({
    queryKey: ["safety-dash", projectId], queryFn: () => api(`/projects/${projectId}/safety-dashboard`), enabled: !!projectId,
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading safety dashboard…</div>;
  if (!dash) return null;

  const scoreInputs = [
    { label: "PPE Compliance", value: dash.ppeCompliancePct, max: 100 },
    { label: "Open Permits", value: dash.openPermits + dash.activePermits, maxBad: true },
    { label: "Open NCRs", value: dash.openNcrs, maxBad: true },
    { label: "Open Incidents", value: dash.openIncidents, maxBad: true },
  ];
  const safetyScore = Math.max(0, Math.round(dash.ppeCompliancePct - (dash.openNcrs * 5) - (dash.openIncidents * 10)));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4">
          <div className="text-3xl font-bold text-green-600">{dash.ppeCompliancePct}%</div>
          <div className="text-sm text-muted-foreground">PPE Compliance</div>
          <div className="mt-2 h-2 rounded bg-muted overflow-hidden"><div className="h-2 bg-green-500 rounded" style={{ width: `${dash.ppeCompliancePct}%` }} /></div>
        </CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-3xl font-bold text-yellow-600">{dash.openPermits + dash.activePermits}</div><div className="text-sm text-muted-foreground">Active/Pending Permits</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-3xl font-bold text-orange-600">{dash.openNcrs}</div><div className="text-sm text-muted-foreground">Open NCRs</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-3xl font-bold text-red-600">{dash.openIncidents}</div><div className="text-sm text-muted-foreground">Open Incidents</div></CardContent></Card>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="md:col-span-1">
          <CardHeader><CardTitle className="text-base">Safety Score</CardTitle></CardHeader>
          <CardContent>
            <div className={`text-5xl font-bold ${safetyScore >= 80 ? "text-green-600" : safetyScore >= 60 ? "text-yellow-600" : "text-red-600"}`}>{safetyScore}</div>
            <div className="text-sm text-muted-foreground">/100</div>
            <div className={`mt-2 text-sm font-medium ${safetyScore >= 80 ? "text-green-600" : safetyScore >= 60 ? "text-yellow-600" : "text-red-600"}`}>
              {safetyScore >= 80 ? "Good" : safetyScore >= 60 ? "Needs Attention" : "Critical — Immediate Action Required"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{dash.totalWorkers} active workers</div>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-base">Recent Incidents</CardTitle></CardHeader>
          <CardContent>
            {dash.recentIncidents?.length === 0 ? <div className="text-sm text-muted-foreground">No incidents — good work!</div> :
            (dash.recentIncidents ?? []).map((i: any) => (
              <div key={i.id} className="border-b last:border-0 py-2">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusBadge(i.classification)}`}>{i.classification.replace(/_/g," ")}</span>
                  <span className="text-sm font-medium">{i.title}</span>
                </div>
                <div className="text-xs text-muted-foreground">{fmtDate(i.incidentDate)} {i.location ? `· ${i.location}` : ""}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      {dash.highRisks?.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base text-orange-700">High / Extreme Risk Hazards</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {dash.highRisks.map((h: any) => (
                <div key={h.id} className={`rounded p-2 border text-sm ${h.riskLevel === "extreme" ? "border-red-300 bg-red-50" : "border-orange-300 bg-orange-50"}`}>
                  <div className="font-medium">{h.hazardDescription}</div>
                  <div className="text-xs mt-0.5 opacity-75">Risk: {h.riskScore} ({h.riskLevel}) · {h.hazardCategory}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── PPE Register Tab ─────────────────────────────────────────────────────────
function PpeTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({ condition: "new" });
  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const { data: ppes = [], isLoading } = useQuery({ queryKey: ["ppe", projectId], queryFn: () => api(`/projects/${projectId}/ppe-issues`), enabled: !!projectId });
  const { data: workers = [] } = useQuery({ queryKey: ["workers", projectId], queryFn: () => api(`/projects/${projectId}/workers`), enabled: !!projectId });

  const create = useMutation({
    mutationFn: (b: any) => api(`/projects/${projectId}/ppe-issues`, { method: "POST", body: JSON.stringify(b) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ppe", projectId] }); setOpen(false); toast({ title: "PPE issued" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const workerMap = Object.fromEntries((workers as any[]).map(w => [w.id, w.name]));
  const byType: Record<string, number> = {};
  for (const p of ppes as any[]) byType[p.ppeType] = (byType[p.ppeType] ?? 0) + 1;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">PPE Issue Register</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Issue PPE</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Issue PPE</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1"><Label>Worker</Label>
                <Select value={form.workerId??""} onValueChange={v=>f("workerId",v)}>
                  <SelectTrigger><SelectValue placeholder="Select worker" /></SelectTrigger>
                  <SelectContent>{(workers as any[]).map(w=><SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>PPE Type</Label>
                <Select value={form.ppeType??""} onValueChange={v=>f("ppeType",v)}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>{PPE_TYPES.map(t=><SelectItem key={t} value={t}>{t.replace(/_/g," ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Condition</Label>
                <Select value={form.condition??"new"} onValueChange={v=>f("condition",v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["new","good","worn","damaged"].map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <Button className="w-full" disabled={!form.workerId || !form.ppeType || create.isPending} onClick={() => create.mutate(form)}>{create.isPending ? "Issuing…" : "Issue PPE"}</Button>
          </DialogContent>
        </Dialog>
      </div>
      <div className="flex flex-wrap gap-2 mb-2">
        {Object.entries(byType).map(([type, count]) => (
          <div key={type} className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{type.replace(/_/g," ")}: {count}</div>
        ))}
      </div>
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>{["Worker","PPE Type","Issued Date","Condition"].map(h=><th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">Loading…</td></tr> :
            (ppes as any[]).slice(0, 50).map((p: any) => (
              <tr key={p.id} className="border-t hover:bg-muted/30">
                <td className="px-3 py-2 font-medium">{workerMap[p.workerId] ?? "—"}</td>
                <td className="px-3 py-2">{p.ppeType.replace(/_/g," ")}</td>
                <td className="px-3 py-2">{fmtDate(p.issuedDate)}</td>
                <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-xs ${p.condition === "new" ? "bg-green-100 text-green-800" : p.condition === "damaged" ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-700"}`}>{p.condition}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Notification Recipients dialog ───────────────────────────────────────────
function NotificationRecipientsDialog({ projectId, kind }: { projectId: string; kind: "safety" | "qc" }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const { data } = useQuery<any>({
    queryKey: ["notif-settings", projectId],
    queryFn: () => api(`/projects/${projectId}/notification-settings`),
    enabled: !!projectId && open,
  });
  const [safety, setSafety] = useState("");
  const [qcs, setQcs] = useState("");
  const [cc, setCc] = useState("");
  const [vendorOnFail, setVendorOnFail] = useState(true);
  useEffect(() => {
    if (data) {
      setSafety((data.safetyOfficers ?? []).join(", "));
      setQcs((data.qcOfficers ?? []).join(", "));
      setCc((data.cc ?? []).join(", "));
      setVendorOnFail(data.emailVendorOnQcFail !== false);
    }
  }, [data]);
  const split = (s: string) => s.split(/[,;\s]+/).map(x => x.trim()).filter(x => x.includes("@"));
  const save = useMutation({
    mutationFn: (body: any) => api(`/projects/${projectId}/notification-settings`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notif-settings", projectId] }); setOpen(false); toast({ title: "Recipients saved" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const label = kind === "safety" ? "JSA email recipients" : "Test certificate recipients";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline">{label}</Button></DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Auto-email recipients</DialogTitle></DialogHeader>
        {data && data.mailerConfigured === false && (
          <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
            SMTP is not configured. Recipients are saved, but emails will not be sent until SMTP_HOST / SMTP_PORT / SMTP_FROM are set.
          </div>
        )}
        <div className="space-y-3 py-1 text-sm">
          <div className="space-y-1">
            <Label className="text-xs">Safety officers (for approved JSAs) — comma separated emails</Label>
            <Input value={safety} onChange={e => setSafety(e.target.value)} placeholder="safety@example.com, hsemanager@example.com" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">QC officers (for material test pass/fail)</Label>
            <Input value={qcs} onChange={e => setQcs(e.target.value)} placeholder="qc@example.com" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Always CC (both)</Label>
            <Input value={cc} onChange={e => setCc(e.target.value)} placeholder="pm@example.com" />
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={vendorOnFail} onChange={e => setVendorOnFail(e.target.checked)} />
            Email vendor when a material test fails (uses vendor email from linked GRN)
          </label>
          <div className="text-xs text-muted-foreground">
            PM, supervisor, preparer, and tester emails (resolved from user accounts) are always included automatically.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => save.mutate({ safetyOfficers: split(safety), qcOfficers: split(qcs), cc: split(cc), emailVendorOnQcFail: vendorOnFail })} disabled={save.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── JSA Tab (Job Safety Analysis) ────────────────────────────────────────────
type JsaStep = { seq: number; step: string; hazards: string; controls: string; ppe?: string };

function JsaTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const search = useSearch();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const urlStatus = (() => {
    const s = new URLSearchParams(search).get("status");
    return s && ["draft","approved"].includes(s) ? s : "all";
  })();
  const [statusFilter, setStatusFilter] = useState<string>(urlStatus);
  useEffect(() => {
    const s = new URLSearchParams(search).get("status");
    const next = s && ["draft","approved"].includes(s) ? s : "all";
    setStatusFilter(next);
  }, [search]);
  const blankStep = (seq: number): JsaStep => ({ seq, step: "", hazards: "", controls: "", ppe: "" });
  const [form, setForm] = useState<{ activity: string; wbsActivityId: string; jsaDate: string; workersPresent: string; supervisorSignature: string; steps: JsaStep[] }>({
    activity: "", wbsActivityId: "", jsaDate: new Date().toISOString().slice(0,10),
    workersPresent: "", supervisorSignature: "", steps: [blankStep(1)],
  });
  const resetForm = () => setForm({ activity: "", wbsActivityId: "", jsaDate: new Date().toISOString().slice(0,10), workersPresent: "", supervisorSignature: "", steps: [blankStep(1)] });

  const { data: jsa = [], isLoading } = useQuery({ queryKey: ["jsa", projectId], queryFn: () => api(`/projects/${projectId}/jsa`), enabled: !!projectId });
  const { data: activities = [] } = useQuery<any[]>({ queryKey: ["wbs-activities", projectId], queryFn: () => api(`/projects/${projectId}/wbs-activities`), enabled: !!projectId });

  const create = useMutation({
    mutationFn: (b: any) => api(`/projects/${projectId}/jsa`, { method: "POST", body: JSON.stringify(b) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["jsa", projectId] }); setOpen(false); resetForm(); toast({ title: "JSA saved as draft" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const patchJsa = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api(`/jsa/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["jsa", projectId] }); setSelected(null); toast({ title: "JSA approved" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateStep = (idx: number, key: keyof JsaStep, val: string) => setForm(p => ({ ...p, steps: p.steps.map((s, i) => i === idx ? { ...s, [key]: val } : s) }));
  const addStep = () => setForm(p => ({ ...p, steps: [...p.steps, blankStep(p.steps.length + 1)] }));
  const removeStep = (idx: number) => setForm(p => ({ ...p, steps: p.steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, seq: i + 1 })) }));

  const submit = (status: "draft" | "approved") => {
    const validSteps = form.steps.filter(s => s.step.trim());
    if (validSteps.length === 0) { toast({ title: "Add at least one step", variant: "destructive" }); return; }
    if (status === "approved" && !form.supervisorSignature.trim()) { toast({ title: "Supervisor signature required to approve", variant: "destructive" }); return; }
    create.mutate({
      jsaDate: form.jsaDate || new Date().toISOString().slice(0,10),
      wbsActivityId: form.wbsActivityId || null,
      workersPresent: parseInt(form.workersPresent || "0") || 0,
      supervisorSignature: form.supervisorSignature || null,
      steps: validSteps.map((s, i) => ({ ...s, seq: i + 1, activity: form.activity || undefined })),
      status,
    });
  };

  const draftCount = (jsa as any[]).filter(j => j.status === "draft").length;
  const approvedCount = (jsa as any[]).filter(j => j.status === "approved").length;
  const activityMap = Object.fromEntries((activities ?? []).map((a: any) => [a.id, `${a.code ?? ""} ${a.description ?? a.name ?? ""}`.trim()]));
  const visibleJsa = statusFilter === "all" ? (jsa as any[]) : (jsa as any[]).filter((j: any) => j.status === statusFilter);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{(jsa as any[]).length}</div><div className="text-xs text-muted-foreground">Total JSAs</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-amber-600">{draftCount}</div><div className="text-xs text-muted-foreground">Drafts (awaiting approval)</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-green-600">{approvedCount}</div><div className="text-xs text-muted-foreground">Approved (work can start)</div></CardContent></Card>
      </div>

      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-semibold">Daily Job Safety Analysis</h3>
          <p className="text-xs text-muted-foreground">Step-by-step hazard breakdown · supervisor signs before work starts · approved JSAs auto-email PDF to safety officers</p>
        </div>
        <div className="flex gap-2 items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Drafts only</SelectItem>
            <SelectItem value="approved">Approved only</SelectItem>
          </SelectContent>
        </Select>
        <NotificationRecipientsDialog projectId={projectId} kind="safety" />
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />New JSA</Button></DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Create Daily JSA</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Activity (WBS)</Label>
                  <Select value={form.wbsActivityId} onValueChange={v => setForm(p => ({ ...p, wbsActivityId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select WBS activity" /></SelectTrigger>
                    <SelectContent>{(activities ?? []).map((a: any) => <SelectItem key={a.id} value={a.id}>{a.code ?? ""} {a.description ?? a.name ?? ""}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>Activity Title</Label><Input value={form.activity} onChange={e => setForm(p => ({ ...p, activity: e.target.value }))} placeholder="e.g. Tower crane lift — Block A" /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1"><Label>JSA Date</Label><Input type="date" value={form.jsaDate} onChange={e => setForm(p => ({ ...p, jsaDate: e.target.value }))} /></div>
                <div className="space-y-1"><Label>Workers Present</Label><Input type="number" value={form.workersPresent} onChange={e => setForm(p => ({ ...p, workersPresent: e.target.value }))} placeholder="0" /></div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center"><Label>Steps · Hazards · Controls</Label>
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={addStep}><Plus className="h-3 w-3 mr-1" />Add Step</Button>
                </div>
                <div className="rounded border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-2 py-1.5 text-left w-10">#</th>
                        <th className="px-2 py-1.5 text-left">Task Step</th>
                        <th className="px-2 py-1.5 text-left">Hazard</th>
                        <th className="px-2 py-1.5 text-left">Control Measure</th>
                        <th className="px-2 py-1.5 text-left w-32">PPE</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.steps.map((s, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-2 py-1.5 text-center text-muted-foreground">{s.seq}</td>
                          <td className="px-1 py-1"><Input className="h-7 text-xs" value={s.step} onChange={e => updateStep(i, "step", e.target.value)} placeholder="Describe step" /></td>
                          <td className="px-1 py-1"><Input className="h-7 text-xs" value={s.hazards} onChange={e => updateStep(i, "hazards", e.target.value)} placeholder="Hazard for this step" /></td>
                          <td className="px-1 py-1"><Input className="h-7 text-xs" value={s.controls} onChange={e => updateStep(i, "controls", e.target.value)} placeholder="Control" /></td>
                          <td className="px-1 py-1"><Input className="h-7 text-xs" value={s.ppe ?? ""} onChange={e => updateStep(i, "ppe", e.target.value)} placeholder="Helmet…" /></td>
                          <td className="px-1 py-1 text-center">{form.steps.length > 1 && <button type="button" className="text-red-600 text-xs" onClick={() => removeStep(i)}>×</button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-1">
                <Label>Supervisor Signature (name)</Label>
                <Input value={form.supervisorSignature} onChange={e => setForm(p => ({ ...p, supervisorSignature: e.target.value }))} placeholder="Type supervisor name to sign — required for approval" />
              </div>
            </div>
            <div className="flex gap-2 pt-3 border-t">
              <Button variant="outline" disabled={create.isPending} onClick={() => submit("draft")}>Save Draft</Button>
              <Button disabled={create.isPending || !form.supervisorSignature.trim()} onClick={() => submit("approved")}><CheckCircle className="h-4 w-4 mr-1" />Save &amp; Approve</Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> :
      <div className="grid md:grid-cols-2 gap-3">
        {visibleJsa.map((j: any) => {
          const steps: JsaStep[] = Array.isArray(j.steps) ? j.steps : [];
          return (
            <Card key={j.id}>
              <CardContent className="pt-4 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium text-sm">{j.activity ?? (j.wbsActivityId ? activityMap[j.wbsActivityId] : null) ?? `JSA — ${steps.length} steps`}</div>
                    <div className="text-xs text-muted-foreground">{fmtDate(j.jsaDate ?? j.createdAt)} · <Badge className={statusBadge(j.status)}>{j.status}</Badge></div>
                  </div>
                  <Badge variant="outline">{j.workersPresent ?? 0} workers</Badge>
                </div>
                {steps.length > 0 && (
                  <div className="rounded border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40"><tr><th className="px-2 py-1 text-left w-6">#</th><th className="px-2 py-1 text-left">Step</th><th className="px-2 py-1 text-left">Hazard</th><th className="px-2 py-1 text-left">Control</th></tr></thead>
                      <tbody>
                        {steps.slice(0, 4).map((s, i) => (
                          <tr key={i} className="border-t">
                            <td className="px-2 py-1 text-muted-foreground">{s.seq}</td>
                            <td className="px-2 py-1">{s.step || "—"}</td>
                            <td className="px-2 py-1 text-red-700">{s.hazards || "—"}</td>
                            <td className="px-2 py-1 text-green-700">{s.controls || "—"}</td>
                          </tr>
                        ))}
                        {steps.length > 4 && <tr><td colSpan={4} className="px-2 py-1 text-muted-foreground border-t">+ {steps.length - 4} more steps</td></tr>}
                      </tbody>
                    </table>
                  </div>
                )}
                {j.supervisorSignature && <div className="text-xs"><span className="text-muted-foreground">Supervisor signed:</span> <span className="font-medium">{j.supervisorSignature}</span></div>}
                {j.status === "draft" && (
                  <div className="pt-1 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setSelected(j)}>Approve…</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {visibleJsa.length === 0 && <div className="text-sm text-muted-foreground">{(jsa as any[]).length === 0 ? "No JSA entries yet" : `No JSAs match status: ${statusFilter}`}</div>}
      </div>}

      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Approve JSA</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm text-muted-foreground">Confirm supervisor approval to release this JSA for work to start.</p>
            <Label>Supervisor Signature</Label>
            <Input id="approve-sig" defaultValue={selected?.supervisorSignature ?? ""} placeholder="Type supervisor name" />
          </div>
          <Button className="w-full" disabled={patchJsa.isPending} onClick={() => {
            const sig = (document.getElementById("approve-sig") as HTMLInputElement | null)?.value?.trim() ?? "";
            if (!sig) { toast({ title: "Signature required", variant: "destructive" }); return; }
            patchJsa.mutate({ id: selected.id, body: { status: "approved", supervisorSignature: sig } });
          }}>{patchJsa.isPending ? "Approving…" : "Approve & Release"}</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Material Testing Tab (IS-code register) ──────────────────────────────────
function MaterialTestingTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const search = useSearch();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string,string>>({ testType: "concrete_cube_28", testDate: new Date().toISOString().slice(0,10) });
  const initialResult = (() => {
    const r = new URLSearchParams(search).get("result");
    return r && ["pass","fail","pending"].includes(r) ? r : "all";
  })();
  const [filters, setFilters] = useState<{ testType: string; result: string; fromDate: string; toDate: string }>({ testType: "all", result: initialResult, fromDate: "", toDate: "" });
  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));
  const filterQs = (() => {
    const q = new URLSearchParams();
    if (filters.testType !== "all") q.set("testType", filters.testType);
    if (filters.result !== "all") q.set("result", filters.result);
    if (filters.fromDate) q.set("fromDate", filters.fromDate);
    if (filters.toDate) q.set("toDate", filters.toDate);
    const s = q.toString();
    return s ? `?${s}` : "";
  })();
  const { data: tests = [], isLoading } = useQuery({ queryKey: ["quality-tests", projectId, filterQs], queryFn: () => api(`/projects/${projectId}/quality-tests${filterQs}`), enabled: !!projectId });
  const create = useMutation({
    mutationFn: (b: any) => api(`/projects/${projectId}/quality-tests`, { method: "POST", body: JSON.stringify(b) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["quality-tests", projectId] }); setOpen(false); setForm({ testType: "concrete_cube_28", testDate: new Date().toISOString().slice(0,10) }); toast({ title: "Test recorded" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const limit = IS_CODE_LIMITS[form.testType] ?? {};
  const passedCount = (tests as any[]).filter(t => t.passed === true).length;
  const failedCount = (tests as any[]).filter(t => t.passed === false).length;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{tests.length}</div><div className="text-sm text-muted-foreground">Total Tests</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-green-600">{passedCount}</div><div className="text-sm text-muted-foreground">Passed</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-red-600">{failedCount}</div><div className="text-sm text-muted-foreground">Failed</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-blue-600">{tests.length > 0 ? Math.round((passedCount / tests.length) * 100) : 0}%</div><div className="text-sm text-muted-foreground">Pass Rate</div></CardContent></Card>
      </div>
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-semibold">IS-Code Material Test Register</h3>
          <p className="text-xs text-muted-foreground">Concrete, rebar, aggregate, brick tests with acceptance limits · pass/fail auto-emails certificate PDF to QC officers</p>
        </div>
        <div className="flex gap-2">
        <NotificationRecipientsDialog projectId={projectId} kind="qc" />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />New Test</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Record IS-Code Material Test</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1"><Label>Test Type</Label>
                <Select value={form.testType} onValueChange={v=>f("testType",v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{IS_CODE_TEST_TYPES.map(t => <SelectItem key={t} value={t}>{IS_CODE_LABELS[t]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {limit.ref && (
                <div className="text-xs bg-blue-50 border border-blue-200 rounded p-2">
                  <div className="font-medium text-blue-900">{limit.ref}</div>
                  <div className="text-blue-700">Acceptance: {limit.minValue !== undefined && `≥ ${limit.minValue}`}{limit.minValue !== undefined && limit.maxValue !== undefined && " and "}{limit.maxValue !== undefined && `≤ ${limit.maxValue}`} {limit.unit}</div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Sample Location</Label><Input value={form.sampleLocation??""} onChange={e=>f("sampleLocation",e.target.value)} placeholder="Grid B-2, Level +6m" /></div>
                <div className="space-y-1"><Label>Lab Name</Label><Input value={form.labName??""} onChange={e=>f("labName",e.target.value)} placeholder="Internal / NABL lab" /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Sample Date</Label><Input type="date" value={form.sampleDate??""} onChange={e=>f("sampleDate",e.target.value)} /></div>
                <div className="space-y-1"><Label>Test Date</Label><Input type="date" value={form.testDate??""} onChange={e=>f("testDate",e.target.value)} /></div>
              </div>
              <div className="space-y-1"><Label>Test Value ({limit.unit ?? ""})</Label><Input type="number" step="0.01" value={form.testValue??""} onChange={e=>f("testValue",e.target.value)} placeholder={limit.minValue !== undefined ? `≥ ${limit.minValue}` : ""} /></div>
              <div className="space-y-1"><Label>Remarks</Label><Textarea rows={2} value={form.remarks??""} onChange={e=>f("remarks",e.target.value)} /></div>
            </div>
            <Button className="w-full" disabled={!form.testType || !form.testValue || create.isPending} onClick={() => create.mutate(form)}>{create.isPending ? "Saving…" : "Record Test"}</Button>
          </DialogContent>
        </Dialog>
        </div>
      </div>
      <Card>
        <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1"><Label className="text-xs">Material Type</Label>
            <Select value={filters.testType} onValueChange={v => setFilters(p => ({ ...p, testType: v }))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All types</SelectItem>{IS_CODE_TEST_TYPES.map(t => <SelectItem key={t} value={t}>{IS_CODE_LABELS[t]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">Result</Label>
            <Select value={filters.result} onValueChange={v => setFilters(p => ({ ...p, result: v }))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="pass">Pass</SelectItem><SelectItem value="fail">Fail</SelectItem><SelectItem value="pending">Pending</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">From Date</Label><Input className="h-8 text-xs" type="date" value={filters.fromDate} onChange={e => setFilters(p => ({ ...p, fromDate: e.target.value }))} /></div>
          <div className="space-y-1"><Label className="text-xs">To Date</Label><Input className="h-8 text-xs" type="date" value={filters.toDate} onChange={e => setFilters(p => ({ ...p, toDate: e.target.value }))} /></div>
        </CardContent>
      </Card>
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>{["Sample ID","Type","IS Code","Date","Value","Limit","Result","Certificate"].map(h=><th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td colSpan={8} className="px-3 py-4 text-center text-muted-foreground">Loading…</td></tr> :
            (tests as any[]).map((t: any) => (
              <tr key={t.id} className="border-t hover:bg-muted/30">
                <td className="px-3 py-2 font-mono text-xs">{t.sampleId ?? "—"}</td>
                <td className="px-3 py-2">{IS_CODE_LABELS[t.testType] ?? t.testType}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{t.isCodeRef ?? "—"}</td>
                <td className="px-3 py-2">{fmtDate(t.testDate)}</td>
                <td className="px-3 py-2 font-mono">{t.testValue ?? "—"} {t.testUnit ?? ""}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{t.minAcceptable && `≥${t.minAcceptable}`}{t.minAcceptable && t.maxAcceptable && " "}{t.maxAcceptable && `≤${t.maxAcceptable}`}</td>
                <td className="px-3 py-2">{t.passed === true ? <Badge className="bg-green-100 text-green-800">PASS</Badge> : t.passed === false ? <Badge className="bg-red-100 text-red-800">FAIL</Badge> : <Badge variant="outline">—</Badge>}</td>
                <td className="px-3 py-2">
                  <a href={`${API}/quality-tests/${t.id}/certificate.pdf`} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline" className="h-7 text-xs"><Download className="h-3 w-3 mr-1" />PDF</Button>
                  </a>
                </td>
              </tr>
            ))}
            {(tests as any[]).length === 0 && !isLoading && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">No tests match the filters</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Statutory Exports Tab ────────────────────────────────────────────────────
function StatutoryExportsTab({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const [periodId, setPeriodId] = useState<string>("");
  const { data: periods = [] } = useQuery({ queryKey: ["payroll", projectId], queryFn: () => api(`/projects/${projectId}/payroll-periods`), enabled: !!projectId });
  const { data: epf } = useQuery({ queryKey: ["epf-export", periodId], queryFn: () => api(`/payroll-periods/${periodId}/epf-export`), enabled: !!periodId });
  const { data: esi } = useQuery({ queryKey: ["esi-export", periodId], queryFn: () => api(`/payroll-periods/${periodId}/esi-export`), enabled: !!periodId });
  const { data: summary } = useQuery({ queryKey: ["stat-summary", periodId], queryFn: () => api(`/payroll-periods/${periodId}/statutory-summary`), enabled: !!periodId });
  const { data: lines = [] } = useQuery({ queryKey: ["payroll-lines-stat", periodId], queryFn: () => api(`/payroll-periods/${periodId}/lines`), enabled: !!periodId });
  const { data: workers = [] } = useQuery({ queryKey: ["workers", projectId], queryFn: () => api(`/projects/${projectId}/workers`), enabled: !!projectId });
  const workerMap = Object.fromEntries((workers as any[]).map(w => [w.id, w]));

  const downloadCsv = (rows: any[], filename: string) => {
    if (!rows?.length) return;
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(","), ...rows.map(r => headers.map(h => `"${String(r[h] ?? "").replace(/"/g,'""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
  };

  const downloadExcel = async (rows: any[], filename: string, sheetName: string) => {
    if (!rows?.length) return;
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(sheetName);
    ws.columns = Object.keys(rows[0]).map((key) => ({ header: key, key }));
    ws.addRows(rows);
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPdf = async (path: string, filename: string) => {
    try {
      const r = await fetch(`${API}${path}`, { credentials: "include" });
      if (!r.ok) { toast({ title: "Download failed", description: await r.text(), variant: "destructive" }); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: "Download failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" />Statutory Compliance Exports</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-3 items-end">
            <div className="flex-1 space-y-1"><Label>Payroll Period</Label>
              <Select value={periodId} onValueChange={setPeriodId}>
                <SelectTrigger><SelectValue placeholder="Select a payroll period" /></SelectTrigger>
                <SelectContent>{(periods as any[]).map(p => <SelectItem key={p.id} value={p.id}>{fmtDate(p.fromDate)} → {fmtDate(p.toDate)} · {p.status}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          {periodId && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-4">
              <Button size="sm" variant="outline" onClick={() => downloadPdf(`/payroll-periods/${periodId}/form-a`, `form-a-bocw-${periodId.slice(0,8)}.pdf`)}>
                <FileText className="h-3 w-3 mr-1.5" />Form A — BOCW Register (PDF)
              </Button>
              <Button size="sm" variant="outline" onClick={() => downloadPdf(`/payroll-periods/${periodId}/form-xvi`, `form-xvi-wages-${periodId.slice(0,8)}.pdf`)}>
                <FileText className="h-3 w-3 mr-1.5" />Form XVI — Wage Register (PDF)
              </Button>
              <Button size="sm" variant="outline" onClick={() => downloadPdf(`/payroll-periods/${periodId}/wage-slips`, `wage-slips-${periodId.slice(0,8)}.pdf`)}>
                <FileText className="h-3 w-3 mr-1.5" />All Wage Slips (PDF)
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">EPF Total</div><div className="text-xl font-bold">{fmtCur(summary.epfEmployee + summary.epfEmployer)}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">ESI Total</div><div className="text-xl font-bold">{fmtCur(summary.esiEmployee + summary.esiEmployer)}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">PT + LWF</div><div className="text-xl font-bold">{fmtCur(summary.pt + summary.lwf)}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Net Wages Disbursed</div><div className="text-xl font-bold">{fmtCur(summary.netWages)}</div></CardContent></Card>
        </div>
      )}

      {epf?.rows?.length > 0 && (
        <Card>
          <CardHeader className="pb-2 flex flex-row justify-between items-center">
            <CardTitle className="text-sm">EPF Challan — ECR Format</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => downloadCsv(epf.rows, `epf_${periodId}.csv`)}><Download className="h-3 w-3 mr-1" />CSV</Button>
              <Button size="sm" variant="outline" onClick={() => downloadExcel(epf.rows, `epf_${periodId}.xlsx`, "EPF")}><Download className="h-3 w-3 mr-1" />Excel</Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50"><tr>{["Code","Name","UAN","PF No.","Aadhaar","Wages","EPF Wage","EE 12%","ER 8.33%","Admin 0.5%","Total"].map(h=><th key={h} className="px-2 py-1.5 text-left">{h}</th>)}</tr></thead>
              <tbody>
                {epf.rows.map((r: any, i: number) => (
                  <tr key={i} className="border-t">
                    <td className="px-2 py-1.5 font-mono">{r.workerCode}</td><td className="px-2 py-1.5">{r.name}</td>
                    <td className="px-2 py-1.5 font-mono">{r.uan ?? "—"}</td>
                    <td className="px-2 py-1.5 font-mono">{r.pfNumber}</td><td className="px-2 py-1.5 font-mono">{r.aadhaar}</td>
                    <td className="px-2 py-1.5 text-right">₹{r.wages}</td><td className="px-2 py-1.5 text-right">₹{r.epfWage}</td>
                    <td className="px-2 py-1.5 text-right">₹{r.epfEmployee}</td><td className="px-2 py-1.5 text-right">₹{r.epfEmployer}</td>
                    <td className="px-2 py-1.5 text-right">₹{r.epfAdmin}</td><td className="px-2 py-1.5 text-right font-semibold">₹{r.totalEpf}</td>
                  </tr>
                ))}
                {epf.totals && <tr className="border-t-2 font-semibold bg-muted/30">
                  <td colSpan={5} className="px-2 py-1.5">TOTAL</td>
                  <td className="px-2 py-1.5 text-right">₹{epf.totals.wages.toFixed(2)}</td><td></td>
                  <td className="px-2 py-1.5 text-right">₹{epf.totals.epfEmployee.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-right">₹{epf.totals.epfEmployer.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-right">₹{epf.totals.epfAdmin.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-right">₹{epf.totals.totalEpf.toFixed(2)}</td>
                </tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {esi?.rows?.length > 0 && (
        <Card>
          <CardHeader className="pb-2 flex flex-row justify-between items-center">
            <CardTitle className="text-sm">ESI Contribution — Form 6</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => downloadCsv(esi.rows, `esi_${periodId}.csv`)}><Download className="h-3 w-3 mr-1" />CSV</Button>
              <Button size="sm" variant="outline" onClick={() => downloadExcel(esi.rows, `esi_${periodId}.xlsx`, "ESI")}><Download className="h-3 w-3 mr-1" />Excel</Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50"><tr>{["Code","Name","ESI No.","Gross","ESI Wage","EE 0.75%","ER 3.25%","Total"].map(h=><th key={h} className="px-2 py-1.5 text-left">{h}</th>)}</tr></thead>
              <tbody>
                {esi.rows.map((r: any, i: number) => (
                  <tr key={i} className="border-t">
                    <td className="px-2 py-1.5 font-mono">{r.workerCode}</td><td className="px-2 py-1.5">{r.name}</td>
                    <td className="px-2 py-1.5 font-mono">{r.esiNumber}</td>
                    <td className="px-2 py-1.5 text-right">₹{r.grossWages}</td><td className="px-2 py-1.5 text-right">₹{r.esiWage}</td>
                    <td className="px-2 py-1.5 text-right">₹{r.esiEmployee}</td><td className="px-2 py-1.5 text-right">₹{r.esiEmployer}</td>
                    <td className="px-2 py-1.5 text-right font-semibold">₹{r.totalEsi}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {(lines as any[]).length > 0 && (
        <Card>
          <CardHeader className="pb-2 flex flex-row justify-between items-center">
            <CardTitle className="text-sm">Individual Wage Slips</CardTitle>
            <Button size="sm" variant="outline" onClick={() => downloadPdf(`/payroll-periods/${periodId}/wage-slips`, `wage-slips-${periodId.slice(0,8)}.pdf`)}>
              <Download className="h-3 w-3 mr-1" />Bulk PDF
            </Button>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50"><tr>{["Code","Worker","Days","Gross","Deductions","Net Pay","Slip"].map(h=><th key={h} className="px-2 py-1.5 text-left">{h}</th>)}</tr></thead>
              <tbody>
                {(lines as any[]).map((l) => {
                  const w: any = workerMap[l.workerId] ?? {};
                  return (
                    <tr key={l.id} className="border-t">
                      <td className="px-2 py-1.5 font-mono">{w.workerCode ?? "—"}</td>
                      <td className="px-2 py-1.5">{w.name ?? "—"}</td>
                      <td className="px-2 py-1.5 text-right">{l.presentDays}</td>
                      <td className="px-2 py-1.5 text-right">{fmtCur(parseFloat(l.grossWages))}</td>
                      <td className="px-2 py-1.5 text-right text-red-600">{fmtCur(parseFloat(l.totalDeductions))}</td>
                      <td className="px-2 py-1.5 text-right font-semibold text-green-700">{fmtCur(parseFloat(l.netWages))}</td>
                      <td className="px-2 py-1.5">
                        <Button size="sm" variant="ghost" className="h-7 px-2"
                          onClick={() => downloadPdf(`/payroll-periods/${periodId}/wage-slips/${l.workerId}`, `wage-slip-${w.workerCode ?? l.workerId.slice(0,6)}.pdf`)}>
                          <Download className="h-3 w-3 mr-1" />Slip
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {periodId && <WageSlipDeliveryLog projectId={projectId} periodId={periodId} workerMap={workerMap} />}

      {periodId && (!epf?.rows?.length && !esi?.rows?.length) && (
        <div className="text-sm text-muted-foreground border rounded-lg p-8 text-center">No statutory data — compute payroll for the selected period first.</div>
      )}
      {!periodId && (
        <div className="text-sm text-muted-foreground border rounded-lg p-8 text-center">Select a payroll period to view EPF / ESI / PT / LWF / TDS exports.</div>
      )}
    </div>
  );
}

function WageSlipDeliveryLog({ projectId, periodId, workerMap }: { projectId: string; periodId: string; workerMap: Record<string, any> }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["wage-slip-deliveries", periodId],
    queryFn: () => api(`/payroll-periods/${periodId}/wage-slip-deliveries`),
    enabled: !!periodId,
    refetchInterval: 5000,
  });
  const resend = useMutation({
    mutationFn: (workerId: string) =>
      api(`/payroll-periods/${periodId}/wage-slips/${workerId}/resend`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: (row: any) => {
      qc.invalidateQueries({ queryKey: ["wage-slip-deliveries", periodId] });
      toast({
        title: row.status === "sent" ? "Wage slip resent" : `Resend ${row.status}`,
        description: row.errorMessage ?? row.recipient ?? "",
        variant: row.status === "sent" ? "default" : "destructive",
      });
    },
    onError: (e: any) => toast({ title: "Resend failed", description: e.message, variant: "destructive" }),
  });
  void projectId;
  const deliveries: any[] = data?.deliveries ?? [];
  const configured: boolean = !!data?.mailerConfigured;
  const latestByWorker = new Map<string, any>();
  for (const d of deliveries) {
    if (!latestByWorker.has(d.workerId)) latestByWorker.set(d.workerId, d);
  }
  const counts = { sent: 0, bounced: 0, skipped: 0, error: 0 };
  for (const d of latestByWorker.values()) {
    if (d.status in counts) (counts as any)[d.status]++;
  }
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row justify-between items-center">
        <CardTitle className="text-sm">Wage Slip Email Delivery</CardTitle>
        <div className="flex gap-3 text-xs">
          <span className="text-green-700">Sent: {counts.sent}</span>
          <span className="text-amber-700">Skipped: {counts.skipped}</span>
          <span className="text-red-600">Bounced: {counts.bounced}</span>
          <span className="text-red-700">Errors: {counts.error}</span>
        </div>
      </CardHeader>
      <CardContent>
        {!configured && (
          <div className="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            SMTP is not configured. Set <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_FROM</code> (and optionally <code>SMTP_USER</code> / <code>SMTP_PASS</code>) to enable automatic wage slip delivery. Deliveries are still being logged.
          </div>
        )}
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading delivery log…</div>
        ) : deliveries.length === 0 ? (
          <div className="text-sm text-muted-foreground p-4 text-center">No delivery attempts yet. Approve this payroll period to dispatch wage slips.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50"><tr>{["Worker","Email","Status","Attempts","Last Attempt","Message","Action"].map(h=><th key={h} className="px-2 py-1.5 text-left">{h}</th>)}</tr></thead>
              <tbody>
                {Array.from(latestByWorker.values()).map((d: any) => {
                  const w = workerMap[d.workerId] ?? {};
                  const badge =
                    d.status === "sent" ? "bg-green-100 text-green-800" :
                    d.status === "bounced" ? "bg-red-100 text-red-800" :
                    d.status === "skipped" ? "bg-amber-100 text-amber-800" :
                    "bg-red-100 text-red-700";
                  return (
                    <tr key={d.id} className="border-t">
                      <td className="px-2 py-1.5"><div className="font-medium">{w.name ?? "—"}</div><div className="font-mono text-[10px] text-muted-foreground">{w.workerCode ?? d.workerId.slice(0,8)}</div></td>
                      <td className="px-2 py-1.5 font-mono">{d.recipient ?? <span className="text-muted-foreground">— none on file</span>}</td>
                      <td className="px-2 py-1.5"><span className={`px-2 py-0.5 rounded font-medium ${badge}`}>{d.status}</span></td>
                      <td className="px-2 py-1.5 text-right">{d.attempts}</td>
                      <td className="px-2 py-1.5">{d.sentAt ? new Date(d.sentAt).toLocaleString() : new Date(d.createdAt).toLocaleString()}</td>
                      <td className="px-2 py-1.5 text-muted-foreground max-w-[20rem] truncate" title={d.errorMessage ?? ""}>{d.errorMessage ?? (d.status === "sent" ? "Delivered" : "—")}</td>
                      <td className="px-2 py-1.5">
                        <Button size="sm" variant="outline" className="h-7 px-2"
                          disabled={resend.isPending}
                          onClick={() => resend.mutate(d.workerId)}>
                          Re-send
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Labour Contractor Bills Tab ──────────────────────────────────────────────
function ContractorBillTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string,string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));
  const { data: bills = [], isLoading } = useQuery({ queryKey: ["lcb", projectId], queryFn: () => api(`/projects/${projectId}/labour-contractor-bills`), enabled: !!projectId });
  const { data: detail } = useQuery({ queryKey: ["lcb-detail", selected], queryFn: () => api(`/labour-contractor-bills/${selected}`), enabled: !!selected });
  const { data: vendors = [] } = useQuery({ queryKey: ["vendors-lcb"], queryFn: () => api(`/vendors`) });
  const { data: periods = [] } = useQuery({ queryKey: ["payroll-periods-lcb", projectId], queryFn: () => api(`/projects/${projectId}/payroll-periods`), enabled: !!projectId });
  const create = useMutation({
    mutationFn: (b: any) => api(`/projects/${projectId}/labour-contractor-bills`, { method: "POST", body: JSON.stringify(b) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lcb", projectId] }); setOpen(false); setForm({}); toast({ title: "Bill submitted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const patchBill = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api(`/labour-contractor-bills/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lcb", projectId] }); qc.invalidateQueries({ queryKey: ["lcb-detail", selected] }); toast({ title: "Bill updated" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-semibold">Labour Contractor Bills</h3>
          <p className="text-xs text-muted-foreground">Submit → cross-verify against attendance → PM approve</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Submit Bill</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Submit Contractor Bill</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Contractor</Label>
                  <Select value={form.contractorId??""} onValueChange={v=>f("contractorId",v)}>
                    <SelectTrigger><SelectValue placeholder={(vendors as any[]).length ? "Select contractor" : "No vendors available"} /></SelectTrigger>
                    <SelectContent>{(vendors as any[]).map((v:any)=><SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Payroll Period <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Select
                    value={form.periodId ?? ""}
                    onValueChange={v => {
                      const p = (periods as any[]).find((x: any) => x.id === v);
                      setForm(prev => ({
                        ...prev,
                        periodId: v,
                        periodFrom: p?.startDate ? String(p.startDate).slice(0, 10) : prev.periodFrom,
                        periodTo: p?.endDate ? String(p.endDate).slice(0, 10) : prev.periodTo,
                      }));
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder={(periods as any[]).length ? "Select period (required for approval; locks payroll lines)" : "No periods — bill can be submitted but cannot be approved"} /></SelectTrigger>
                    <SelectContent>{(periods as any[]).map((p: any) => <SelectItem key={p.id} value={p.id}>{fmtDate(p.startDate)} → {fmtDate(p.endDate)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              {!(vendors as any[]).length && (
                <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
                  No contractors found. Add a vendor in <span className="font-medium">Supply Chain → Vendors</span> before submitting a labour bill.
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Period From</Label><Input type="date" value={form.periodFrom??""} onChange={e=>f("periodFrom",e.target.value)} /></div>
                <div className="space-y-1"><Label>Period To</Label><Input type="date" value={form.periodTo??""} onChange={e=>f("periodTo",e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Claimed Headcount</Label><Input type="number" value={form.claimedHeadcount??""} onChange={e=>f("claimedHeadcount",e.target.value)} /></div>
                <div className="space-y-1"><Label>Claimed Mandays</Label><Input type="number" step="0.5" value={form.claimedDays??""} onChange={e=>f("claimedDays",e.target.value)} /></div>
              </div>
              <div className="space-y-1"><Label>Claimed Amount (₹)</Label><Input type="number" step="0.01" value={form.claimedAmount??""} onChange={e=>f("claimedAmount",e.target.value)} /></div>
            </div>
            <Button className="w-full" disabled={!form.contractorId || !form.periodFrom || !form.periodTo || !form.claimedAmount || create.isPending} onClick={() => create.mutate(form)}>{create.isPending ? "Submitting…" : "Submit Bill"}</Button>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-1 space-y-2">
          {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> :
          (bills as any[]).map((b: any) => (
            <Card key={b.id} className={`cursor-pointer transition-all ${selected === b.id ? "ring-2 ring-primary" : ""}`} onClick={() => setSelected(b.id)}>
              <CardContent className="pt-3 pb-3">
                <div className="flex justify-between items-center">
                  <div className="font-mono text-xs text-muted-foreground">{b.billNumber}</div>
                  <Badge className={statusBadge(b.status)}>{b.status.replace(/_/g," ")}</Badge>
                </div>
                <div className="text-sm font-medium mt-1">{fmtCur(b.claimedAmount)}</div>
                <div className="text-xs text-muted-foreground">{fmtDate(b.periodFrom)} → {fmtDate(b.periodTo)} · {b.claimedHeadcount} workers</div>
              </CardContent>
            </Card>
          ))}
          {(bills as any[]).length === 0 && <div className="text-sm text-muted-foreground">No bills submitted</div>}
        </div>
        <div className="md:col-span-2">
          {selected && detail ? (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">{detail.billNumber} — Cross-Verification</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="border rounded p-3">
                    <Label className="text-xs">Contractor Claimed</Label>
                    <div className="text-2xl font-bold mt-1">{fmtCur(detail.claimedAmount)}</div>
                    <div className="text-xs text-muted-foreground">{detail.claimedHeadcount} workers · {detail.claimedDays} mandays</div>
                  </div>
                  <div className={`border rounded p-3 ${detail.verification?.discrepancy > 0 ? "border-orange-300 bg-orange-50" : "border-green-300 bg-green-50"}`}>
                    <Label className="text-xs">Attendance-Verified</Label>
                    <div className="text-2xl font-bold mt-1">{fmtCur(detail.verification?.verifiedAmount ?? 0)}</div>
                    <div className="text-xs text-muted-foreground">{detail.verification?.verifiedHeadcount ?? 0} workers · {detail.verification?.verifiedDays ?? 0} mandays</div>
                  </div>
                </div>
                {detail.verification?.discrepancy !== 0 && (
                  <div className={`rounded p-3 text-sm ${detail.verification?.discrepancy > 0 ? "bg-red-50 border border-red-200 text-red-900" : "bg-blue-50 border border-blue-200 text-blue-900"}`}>
                    <span className="font-semibold">Discrepancy: {fmtCur(Math.abs(detail.verification?.discrepancy))}</span>
                    {detail.verification?.discrepancy > 0 ? " over-claimed" : " under-claimed"}
                  </div>
                )}
                {detail.verification?.flags?.length > 0 && (
                  <div className="rounded p-3 text-xs bg-orange-50 border border-orange-200 text-orange-900">
                    <div className="font-semibold mb-1">Flags</div>
                    <ul className="list-disc list-inside space-y-0.5">
                      {detail.verification.flags.map((flag: string, i: number) => <li key={i}>{flag}</li>)}
                    </ul>
                  </div>
                )}
                {detail.deductions?.length > 0 && (
                  <div className="rounded p-3 text-xs bg-slate-50 border border-slate-200">
                    <div className="font-semibold mb-2">Deductions Applied</div>
                    <div className="space-y-1">
                      {detail.deductions.map((d: any) => (
                        <div key={d.id} className="flex justify-between gap-2">
                          <span className="truncate" title={d.legalRef ?? ""}>{d.description}</span>
                          <span className="font-mono whitespace-nowrap">− {fmtCur(d.amount)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="border-t mt-2 pt-2 space-y-0.5">
                      <div className="flex justify-between"><span>Gross (verified)</span><span className="font-mono">{fmtCur(detail.grossAmount ?? detail.verifiedAmount ?? 0)}</span></div>
                      <div className="flex justify-between text-rose-700"><span>Total deductions</span><span className="font-mono">− {fmtCur(detail.totalDeductions ?? 0)}</span></div>
                      <div className="flex justify-between font-semibold text-green-800"><span>Net payable</span><span className="font-mono">{fmtCur(detail.netPayable ?? 0)}</span></div>
                    </div>
                  </div>
                )}
                {detail.vouchers?.length > 0 && (
                  <div className="rounded p-3 text-xs bg-green-50 border border-green-200 text-green-900">
                    <div className="font-semibold mb-1">Payment Vouchers</div>
                    {detail.vouchers.map((v: any) => (
                      <div key={v.id} className="flex justify-between">
                        <span className="font-mono">{v.voucherNumber}</span>
                        <span>{fmtCur(v.amount)} · {v.mode?.toUpperCase()}</span>
                      </div>
                    ))}
                  </div>
                )}
                {detail.verification?.workerBreakdown?.length > 0 && (
                  <div>
                    <Label className="text-xs">Worker Breakdown ({detail.verification.workerBreakdown.length} workers)</Label>
                    <div className="text-xs mt-1 max-h-32 overflow-y-auto border rounded p-2">
                      {detail.verification.workerBreakdown.slice(0, 20).map((w: any) => (
                        <div key={w.workerId} className="flex justify-between py-0.5">
                          <span className="truncate">{w.workerName ?? w.workerId.slice(0,8)+"…"}</span>
                          <span>{w.presentDays} days{w.dailyRate ? ` · ${fmtCur(w.presentDays * w.dailyRate)}` : ""}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {detail.status !== "approved" && detail.status !== "rejected" && (
                  <div className="flex gap-2 pt-3 border-t">
                    <Button size="sm" disabled={patchBill.isPending} onClick={() => patchBill.mutate({ id: detail.id, body: { status: "approved", verifiedAmount: detail.verification?.verifiedAmount, verifiedHeadcount: detail.verification?.verifiedHeadcount, verifiedDays: detail.verification?.verifiedDays } })}>
                      <CheckCircle className="h-3 w-3 mr-1" />Approve at Verified
                    </Button>
                    <Button size="sm" variant="outline" disabled={patchBill.isPending} onClick={() => patchBill.mutate({ id: detail.id, body: { status: "rejected", rejectionReason: "Insufficient attendance evidence" } })}>
                      <XCircle className="h-3 w-3 mr-1" />Reject
                    </Button>
                  </div>
                )}
                {detail.status === "approved" && <div className="text-sm text-green-700 font-medium pt-3 border-t">✓ Approved · Verified Amount: {fmtCur(detail.verifiedAmount ?? detail.claimedAmount)}</div>}
                {detail.status === "rejected" && <div className="text-sm text-red-700 pt-3 border-t">✗ Rejected: {detail.rejectionReason}</div>}
              </CardContent>
            </Card>
          ) : <div className="flex items-center justify-center h-full text-muted-foreground text-sm border rounded-lg p-8">Select a bill to view cross-verification</div>}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
const VALID_WORKFORCE_TABS = ["workers","attendance","payroll","itp","inspections","ncr","permits","hira","jsa","ppe","incidents","material-test","contractor-bill","statutory","safety-dashboard"] as const;

const WORKFORCE_GROUPS = [
  {
    label: "People & Payroll",
    icon: Users,
    items: [
      { value: "workers",         label: "Workers",         icon: Users },
      { value: "attendance",      label: "Attendance",      icon: CalendarCheck },
      { value: "payroll",         label: "Payroll",         icon: Wallet },
      { value: "contractor-bill", label: "Contractor Bill", icon: Banknote },
    ],
  },
  {
    label: "Quality",
    icon: ClipboardCheck,
    items: [
      { value: "itp",           label: "ITP",           icon: ClipboardCheck },
      { value: "inspections",   label: "Inspections",   icon: CheckCircle },
      { value: "ncr",           label: "NCR",           icon: AlertCircle },
      { value: "material-test", label: "Material Test", icon: FlaskConical },
    ],
  },
  {
    label: "Safety (EHS)",
    icon: ShieldCheck,
    items: [
      { value: "permits",          label: "Permits",       icon: ShieldCheck },
      { value: "hira",             label: "HIRA",          icon: AlertTriangle },
      { value: "jsa",              label: "JSA",           icon: Zap },
      { value: "ppe",              label: "PPE",           icon: HardHat },
      { value: "incidents",        label: "Incidents",     icon: TrendingUp },
      { value: "safety-dashboard", label: "Safety Dash",   icon: BarChart3 },
    ],
  },
  {
    label: "Compliance",
    icon: FileText,
    items: [
      { value: "statutory", label: "Statutory Exports", icon: FileText },
    ],
  },
] as const;

export default function WorkforcePage({ projectId }: { projectId: string }) {
  const search = useSearch();
  const initialTab = (() => {
    const t = new URLSearchParams(search).get("wTab");
    return t && (VALID_WORKFORCE_TABS as readonly string[]).includes(t) ? t : "workers";
  })();
  const [tab, setTab] = useState<string>(initialTab);
  useEffect(() => {
    const t = new URLSearchParams(search).get("wTab");
    if (t && (VALID_WORKFORCE_TABS as readonly string[]).includes(t) && t !== tab) setTab(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);
  return (
    <div className="space-y-6">
      <Tabs value={tab} onValueChange={setTab} orientation="vertical" className="w-full">
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4 lg:gap-6">
          {/* Mobile + tablet (<lg): grouped Select dropdown */}
          <div className="lg:hidden">
            <Select value={tab} onValueChange={setTab}>
              <SelectTrigger className="w-full h-11 text-base" aria-label="Select Workforce & EHS section">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[70vh]">
                {WORKFORCE_GROUPS.map((g) => (
                  <div key={g.label}>
                    <div className="flex items-center gap-2 px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      <g.icon className="h-3 w-3" />
                      {g.label}
                    </div>
                    {g.items.map((it) => {
                      const Icon = it.icon;
                      return (
                        <SelectItem key={it.value} value={it.value} className="pl-3">
                          <span className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                            {it.label}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Desktop (lg+): vertical grouped tablist — real Radix tab semantics + arrow-key nav */}
          <TabsList
            aria-label="Workforce & EHS navigation"
            className="hidden lg:flex lg:flex-col lg:items-stretch lg:justify-start lg:sticky lg:top-20 lg:self-start lg:h-auto lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:border lg:rounded-lg lg:bg-card lg:p-2 lg:gap-3 lg:w-full"
          >
            {WORKFORCE_GROUPS.map((g) => (
              <div key={g.label} className="w-full">
                <div className="flex items-center gap-1.5 px-2 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <g.icon className="h-3 w-3" />
                  {g.label}
                </div>
                <div className="space-y-0.5">
                  {g.items.map((it) => {
                    const Icon = it.icon;
                    return (
                      <TabsTrigger
                        key={it.value}
                        value={it.value}
                        className={cn(
                          "w-full justify-start gap-2 px-2.5 py-2 h-auto rounded-md text-sm text-left bg-transparent",
                          "text-foreground/80 hover:bg-accent hover:text-accent-foreground",
                          "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:font-medium data-[state=active]:shadow-sm",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{it.label}</span>
                      </TabsTrigger>
                    );
                  })}
                </div>
              </div>
            ))}
          </TabsList>

          {/* Content panel — min-w-0 lets inner tables/scrollers behave on narrow widths */}
          <div className="min-w-0">
            <TabsContent value="workers" className="mt-0"><WorkersTab projectId={projectId} /></TabsContent>
            <TabsContent value="attendance" className="mt-0"><AttendanceTab projectId={projectId} /></TabsContent>
            <TabsContent value="payroll" className="mt-0"><PayrollTab projectId={projectId} /></TabsContent>
            <TabsContent value="itp" className="mt-0"><ItpTab projectId={projectId} /></TabsContent>
            <TabsContent value="inspections" className="mt-0"><InspectionsTab projectId={projectId} /></TabsContent>
            <TabsContent value="ncr" className="mt-0"><NcrTab projectId={projectId} /></TabsContent>
            <TabsContent value="permits" className="mt-0"><PermitsTab projectId={projectId} /></TabsContent>
            <TabsContent value="hira" className="mt-0"><HiraTab projectId={projectId} /></TabsContent>
            <TabsContent value="jsa" className="mt-0"><JsaTab projectId={projectId} /></TabsContent>
            <TabsContent value="ppe" className="mt-0"><PpeTab projectId={projectId} /></TabsContent>
            <TabsContent value="incidents" className="mt-0"><IncidentsTab projectId={projectId} /></TabsContent>
            <TabsContent value="material-test" className="mt-0"><MaterialTestingTab projectId={projectId} /></TabsContent>
            <TabsContent value="contractor-bill" className="mt-0"><ContractorBillTab projectId={projectId} /></TabsContent>
            <TabsContent value="statutory" className="mt-0"><StatutoryExportsTab projectId={projectId} /></TabsContent>
            <TabsContent value="safety-dashboard" className="mt-0"><SafetyDashboardTab projectId={projectId} /></TabsContent>
          </div>
        </div>
      </Tabs>
    </div>
  );
}
