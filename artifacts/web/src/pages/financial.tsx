import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  Banknote, FileText, TrendingUp, BookOpen, BarChart3, CheckCircle, Clock, AlertTriangle,
  ChevronRight, Plus, Shield, Receipt, Building2,
} from "lucide-react";
import { formatINR } from "@/lib/ocms-format";
import { useToast } from "@/hooks/use-toast";
import { useGetMyProfile, useGetOrgSubscription } from "@workspace/api-client-react";
import { FeatureGate } from "@/components/feature-gate";

// ─── Status Config ─────────────────────────────────────────────────────────
const BILL_STEPS = [
  { key: "draft",            label: "Draft",             color: "bg-slate-100 text-slate-700" },
  { key: "submitted",        label: "Submitted",         color: "bg-blue-100 text-blue-700" },
  { key: "technical_check",  label: "Technical Check",   color: "bg-violet-100 text-violet-700" },
  { key: "qs_scrutiny",      label: "QS Scrutiny",       color: "bg-indigo-100 text-indigo-700" },
  { key: "pm_certification", label: "PM Certified",      color: "bg-amber-100 text-amber-700" },
  { key: "auto_deductions",  label: "Auto Deductions",   color: "bg-orange-100 text-orange-700" },
  { key: "gst_invoice",      label: "GST Invoice",       color: "bg-yellow-100 text-yellow-700" },
  { key: "finance_approval", label: "Finance Approval",  color: "bg-purple-100 text-purple-700" },
  { key: "payment_released", label: "Payment Released",  color: "bg-emerald-100 text-emerald-700" },
  { key: "ledger_posting",   label: "Ledger Posting",    color: "bg-pink-100 text-pink-700" },
  { key: "closed",           label: "Closed",            color: "bg-green-100 text-green-700" },
];
const statusColor = (s: string) => BILL_STEPS.find(x => x.key === s)?.color ?? "bg-slate-100 text-slate-700";

const INV_STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  sent: "bg-blue-100 text-blue-700",
  acknowledged: "bg-amber-100 text-amber-700",
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
};

// ─── API helpers ───────────────────────────────────────────────────────────
const apiFetch = async (path: string, opts?: RequestInit) => {
  const res = await fetch(`/api${path}`, { credentials: "include", ...opts });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? res.statusText); }
  return res.json();
};

// ─── Workflow Stepper ──────────────────────────────────────────────────────
function WorkflowStepper({ status }: { status: string }) {
  const idx = BILL_STEPS.findIndex(s => s.key === status);
  return (
    <div className="flex items-center gap-0.5 flex-wrap">
      {BILL_STEPS.map((step, i) => (
        <div key={step.key} className="flex items-center gap-0.5">
          <div className={`h-2 w-2 rounded-full ${i < idx ? "bg-green-500" : i === idx ? "bg-blue-500" : "bg-slate-200"}`} />
          {i < BILL_STEPS.length - 1 && <div className={`h-px w-4 ${i < idx ? "bg-green-400" : "bg-slate-200"}`} />}
        </div>
      ))}
    </div>
  );
}

// ─── KPI Tile ──────────────────────────────────────────────────────────────
function KpiTile({ label, value, icon: Icon, sub, colorClass = "text-foreground" }: { label: string; value: string; icon: any; sub?: string; colorClass?: string }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${colorClass}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="rounded-lg bg-muted p-2.5"><Icon className="h-5 w-5 text-muted-foreground" /></div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Create Bill Dialog ────────────────────────────────────────────────────
function CreateBillDialog({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ billNumber: "", grossAmount: "", remarks: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!form.billNumber || !form.grossAmount) { setError("Bill number and amount required"); return; }
    setLoading(true); setError(null);
    try {
      await apiFetch(`/projects/${projectId}/contractor-bills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, grossAmount: Number(form.grossAmount) }),
      });
      setOpen(false); onCreated();
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> New Bill</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Submit Contractor RA Bill</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <div><Label>Bill Number</Label><Input value={form.billNumber} onChange={e => setForm(f => ({ ...f, billNumber: e.target.value }))} placeholder="RA-016" /></div>
          <div><Label>Gross Amount (₹)</Label><Input type="number" value={form.grossAmount} onChange={e => setForm(f => ({ ...f, grossAmount: e.target.value }))} placeholder="1500000" /></div>
          <div><Label>Remarks</Label><Textarea value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} rows={2} /></div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={loading}>{loading ? "Submitting…" : "Submit Bill"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Advance Bill Dialog ───────────────────────────────────────────────────
function AdvanceBillDialog({ bill, onAdvanced }: { bill: any; onAdvanced: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [utr, setUtr] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  const [mode, setMode] = useState("bank_transfer");
  const [loading, setLoading] = useState(false);
  const nextStep = BILL_STEPS[BILL_STEPS.findIndex(s => s.key === bill.status) + 1];
  // Show payment fields when ADVANCING INTO payment_released (i.e. current step is finance_approval)
  const isPayment = bill.status === "finance_approval";

  // Mode metadata: label, reference-field label, whether we need bank fields
  const PAYMENT_MODES: Array<{
    key: string; label: string; refLabel: string; refPlaceholder: string; needsBank: boolean;
  }> = [
    { key: "cash",          label: "Cash / In-hand",  refLabel: "Receipt No. (optional)", refPlaceholder: "RCPT-2026-001", needsBank: false },
    { key: "gpay",          label: "GPay / UPI",      refLabel: "UPI Reference ID",        refPlaceholder: "123456789012",  needsBank: false },
    { key: "bank_transfer", label: "Bank Transfer",   refLabel: "UTR",                     refPlaceholder: "SBIN0R52026…",  needsBank: true  },
    { key: "neft",          label: "NEFT",            refLabel: "UTR",                     refPlaceholder: "SBIN0R52026…",  needsBank: true  },
    { key: "rtgs",          label: "RTGS",            refLabel: "UTR",                     refPlaceholder: "HDFC0R52026…",  needsBank: true  },
    { key: "upi",           label: "UPI",             refLabel: "UPI Reference ID",        refPlaceholder: "123456789012",  needsBank: false },
    { key: "cheque",        label: "Cheque",          refLabel: "Cheque No.",              refPlaceholder: "012345",        needsBank: true  },
  ];
  const modeMeta = PAYMENT_MODES.find(m => m.key === mode) ?? PAYMENT_MODES[2];

  const advance = async () => {
    if (isPayment) {
      if (modeMeta.needsBank && !bankName.trim()) {
        toast({ title: "Bank name required", description: "Bank name is required for this payment mode.", variant: "destructive" });
        return;
      }
      if ((mode === "bank_transfer" || mode === "neft" || mode === "rtgs") && !utr.trim()) {
        toast({ title: "UTR required", description: "UTR is required for bank transfers.", variant: "destructive" });
        return;
      }
    }
    setLoading(true);
    try {
      await apiFetch(`/contractor-bills/${bill.id}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          remarks,
          paymentMode: mode,
          utr: utr || undefined,
          bankName: bankName || undefined,
          accountNumber: accountNumber || undefined,
          ifscCode: ifscCode || undefined,
        }),
      });
      setOpen(false); onAdvanced();
    } catch (e: any) {
      toast({ title: "Failed to advance", description: e?.message ?? "Unknown error", variant: "destructive" });
    }
    finally { setLoading(false); }
  };

  if (!nextStep) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="text-xs gap-1 h-7 px-2" data-testid={`bill-advance-${bill.id}`}><ChevronRight className="h-3 w-3" /> Advance</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Advance to: {nextStep.label}</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <p className="text-sm text-muted-foreground">Moving <strong>{bill.billNumber}</strong> from <em>{bill.stepLabel}</em> → <em>{nextStep.label}</em></p>
          <div><Label>Remarks (optional)</Label><Textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={2} /></div>
          {isPayment && (
            <>
              <div>
                <Label>Payment Mode</Label>
                <Select value={mode} onValueChange={setMode}>
                  <SelectTrigger data-testid="payment-mode-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_MODES.map(m => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{modeMeta.refLabel}</Label>
                <Input
                  value={utr}
                  onChange={e => setUtr(e.target.value)}
                  placeholder={modeMeta.refPlaceholder}
                  data-testid="payment-ref-input"
                />
              </div>
              {modeMeta.needsBank && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-3">
                    <Label>Bank Name</Label>
                    <Input value={bankName} onChange={e => setBankName(e.target.value)} placeholder="State Bank of India" data-testid="payment-bank-input" />
                  </div>
                  <div className="col-span-2">
                    <Label>Account No.</Label>
                    <Input value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="00112233445566" data-testid="payment-account-input" />
                  </div>
                  <div>
                    <Label>IFSC</Label>
                    <Input value={ifscCode} onChange={e => setIfscCode(e.target.value.toUpperCase())} placeholder="SBIN0001234" data-testid="payment-ifsc-input" />
                  </div>
                </div>
              )}
              {mode === "cash" && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  Cash payments above ₹10,000 to a single payee per day are disallowed for tax deduction under Sec. 40A(3). Make sure this transaction complies.
                </p>
              )}
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={advance} disabled={loading}>{loading ? "Processing…" : "Confirm"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Deduction Breakdown Drawer ────────────────────────────────────────────
function DeductionRow({ d }: { d: any }) {
  const typeLabel: Record<string, string> = {
    tds_194c: "TDS u/s 194C", advance_recovery: "Advance Recovery",
    retention: "Retention", material_issued: "Material Issued", penalty: "Penalty", lwf: "LWF",
  };
  const typeColor: Record<string, string> = {
    tds_194c: "text-red-600", retention: "text-amber-600", lwf: "text-orange-600",
    advance_recovery: "text-purple-600", penalty: "text-rose-600",
  };
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
      <div>
        <span className={`font-medium ${typeColor[d.deductionType] ?? "text-foreground"}`}>{typeLabel[d.deductionType] ?? d.deductionType}</span>
        <p className="text-xs text-muted-foreground">{d.legalRef}</p>
      </div>
      <div className="text-right">
        <p className="font-semibold">{formatINR(d.amount)}</p>
        <p className="text-xs text-muted-foreground">@ {d.rate}%</p>
      </div>
    </div>
  );
}

// ─── Bill Row ──────────────────────────────────────────────────────────────
function BillRow({ bill, onRefresh }: { bill: any; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const { data: deductions } = useQuery({
    queryKey: ["deductions", bill.id],
    queryFn: () => apiFetch(`/contractor-bills/${bill.id}/deductions`),
    enabled: expanded,
  });
  const canAdvance = bill.status !== "closed";

  return (
    <div className="border rounded-lg overflow-hidden">
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/40 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3">
          <div>
            <p className="font-semibold text-sm">{bill.billNumber}</p>
            <WorkflowStepper status={bill.status} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold">{formatINR(bill.netPayable)}</p>
            <p className="text-xs text-muted-foreground">Gross: {formatINR(bill.grossAmount)}</p>
          </div>
          <Badge className={`text-xs ${statusColor(bill.status)}`}>{bill.stepLabel}</Badge>
          {canAdvance && (
            <span onClick={e => e.stopPropagation()}>
              <AdvanceBillDialog bill={bill} onAdvanced={onRefresh} />
            </span>
          )}
        </div>
      </div>
      {expanded && (
        <div className="border-t px-4 py-3 bg-muted/20">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-3">
            <div><p className="text-xs text-muted-foreground">Gross</p><p className="font-medium">{formatINR(bill.grossAmount)}</p></div>
            <div><p className="text-xs text-muted-foreground">GST (18%)</p><p className="font-medium">{formatINR(bill.gstAmount)}</p></div>
            <div><p className="text-xs text-muted-foreground">Total Deductions</p><p className="font-medium text-red-600">{formatINR(bill.totalDeductions)}</p></div>
            <div><p className="text-xs text-muted-foreground">Net Payable</p><p className="font-semibold text-green-700">{formatINR(bill.netPayable)}</p></div>
          </div>
          {bill.irnNumber && <p className="text-xs text-muted-foreground mb-2">IRN: <code className="text-xs bg-muted px-1 rounded">{bill.irnNumber}</code></p>}
          {bill.utr && <p className="text-xs text-muted-foreground mb-2">UTR: <code className="text-xs bg-muted px-1 rounded">{bill.utr}</code> · Mode: {bill.paymentMode?.toUpperCase()}</p>}
          {bill.remarks && <p className="text-xs text-muted-foreground mb-2">{bill.remarks}</p>}
          {deductions?.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">Deduction Breakdown</p>
              {deductions.map((d: any) => <DeductionRow key={d.id} d={d} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Client Invoice Row ────────────────────────────────────────────────────
function ClientInvoiceRow({ inv }: { inv: any }) {
  return (
    <div className="border rounded-lg p-3 space-y-1">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-sm">{inv.invoiceNumber}</p>
          <p className="text-xs text-muted-foreground">{inv.clientName}</p>
        </div>
        <Badge className={`text-xs ${INV_STATUS_COLOR[inv.status] ?? ""}`}>{inv.status}</Badge>
      </div>
      <div className="grid grid-cols-3 gap-2 text-sm pt-1">
        <div><p className="text-xs text-muted-foreground">Gross</p><p>{formatINR(inv.grossAmount)}</p></div>
        <div><p className="text-xs text-muted-foreground">GST</p><p>{formatINR(inv.gstAmount)}</p></div>
        <div><p className="text-xs text-muted-foreground">Net</p><p className="font-semibold">{formatINR(inv.netAmount)}</p></div>
      </div>
      {inv.irnNumber && <p className="text-xs text-muted-foreground">IRN: <code className="text-xs bg-muted px-1 rounded">{inv.irnNumber}</code></p>}
      {inv.reraReference && <p className="text-xs text-muted-foreground">RERA: {inv.reraReference}</p>}
    </div>
  );
}

// ─── Create Client Invoice Dialog ──────────────────────────────────────────
function CreateInvoiceDialog({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ invoiceNumber: "", clientName: "MSRDC — Maharashtra State Road Dev Corp", grossAmount: "", reraReference: "", notes: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!form.invoiceNumber || !form.clientName || !form.grossAmount) { setError("Invoice number, client name, and amount required"); return; }
    setLoading(true); setError(null);
    try {
      await apiFetch(`/projects/${projectId}/client-invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, grossAmount: Number(form.grossAmount) }),
      });
      setOpen(false); onCreated();
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> New Invoice</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create Client Invoice</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <div><Label>Invoice Number</Label><Input value={form.invoiceNumber} onChange={e => setForm(f => ({ ...f, invoiceNumber: e.target.value }))} placeholder="INV-CLI-004" /></div>
          <div><Label>Client Name</Label><Input value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} /></div>
          <div><Label>Gross Amount (₹)</Label><Input type="number" value={form.grossAmount} onChange={e => setForm(f => ({ ...f, grossAmount: e.target.value }))} /></div>
          <div><Label>RERA Reference</Label><Input value={form.reraReference} onChange={e => setForm(f => ({ ...f, reraReference: e.target.value }))} placeholder="MH/RERA/P12345" /></div>
          <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={loading}>{loading ? "Creating…" : "Create Invoice"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Financial Page ───────────────────────────────────────────────────
export default function FinancialPage({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const refresh = (key: string) => qc.invalidateQueries({ queryKey: [key, projectId] });

  const { data: profile } = useGetMyProfile();
  const orgId = profile?.organisationId ?? "";
  const { data: subData } = useGetOrgSubscription(orgId, { query: { enabled: !!orgId } } as any);
  const planFeatures = (subData?.plan?.features ?? {}) as Record<string, boolean | string>;
  const hasFinancialAnalytics = planFeatures.financial_analytics === true || planFeatures.financial_analytics === "true";

  const { data: bills = [], isLoading: billsLoading } = useQuery({
    queryKey: ["contractor-bills", projectId],
    queryFn: () => apiFetch(`/projects/${projectId}/contractor-bills`),
  });

  const { data: clientInvoices = [], isLoading: invLoading } = useQuery({
    queryKey: ["client-invoices", projectId],
    queryFn: () => apiFetch(`/projects/${projectId}/client-invoices`),
  });

  const { data: analytics } = useQuery({
    queryKey: ["payment-analytics", projectId],
    queryFn: () => apiFetch(`/projects/${projectId}/payment-analytics`),
  });

  const { data: summary } = useQuery({
    queryKey: ["financial-summary", projectId],
    queryFn: () => apiFetch(`/projects/${projectId}/financial-summary`),
  });

  const { data: tdsRegister = [] } = useQuery({
    queryKey: ["tds-register", projectId],
    queryFn: () => apiFetch(`/projects/${projectId}/tds-register`),
  });

  const { data: gstRegister = [] } = useQuery({
    queryKey: ["gst-register", projectId],
    queryFn: () => apiFetch(`/projects/${projectId}/gst-register`),
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["ledger-accounts", projectId],
    queryFn: () => apiFetch(`/projects/${projectId}/ledger-accounts`),
  });

  const { data: entries = [] } = useQuery({
    queryKey: ["ledger-entries", projectId],
    queryFn: () => apiFetch(`/projects/${projectId}/ledger-entries`),
  });

  const { data: retention = [] } = useQuery({
    queryKey: ["retention-ledger", projectId],
    queryFn: () => apiFetch(`/projects/${projectId}/retention-ledger`),
  });

  const { data: advanceLedger = [] } = useQuery({
    queryKey: ["advance-ledger", projectId],
    queryFn: () => apiFetch(`/projects/${projectId}/advance-ledger`),
  });

  return (
    <div className="space-y-4">
      <Tabs defaultValue="bills" className="space-y-4">
        <TabsList className="bg-background border h-auto p-1 flex-wrap gap-0.5">
          <TabsTrigger value="bills" className="flex items-center gap-1.5 text-sm"><Banknote className="h-4 w-4" /> Contractor Bills</TabsTrigger>
          <TabsTrigger value="client" className="flex items-center gap-1.5 text-sm"><Building2 className="h-4 w-4" /> Client Billing</TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-1.5 text-sm"><BarChart3 className="h-4 w-4" /> Analytics</TabsTrigger>
          <TabsTrigger value="reports" className="flex items-center gap-1.5 text-sm"><TrendingUp className="h-4 w-4" /> Reports</TabsTrigger>
          <TabsTrigger value="ledger" className="flex items-center gap-1.5 text-sm"><BookOpen className="h-4 w-4" /> Ledger</TabsTrigger>
          <TabsTrigger value="registers" className="flex items-center gap-1.5 text-sm"><Receipt className="h-4 w-4" /> Registers</TabsTrigger>
        </TabsList>

        {/* ── CONTRACTOR BILLS ──────────────────────────────────────────── */}
        <TabsContent value="bills" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Contractor RA Bills</h2>
              <p className="text-sm text-muted-foreground">10-step approval workflow — draft → closed</p>
            </div>
            <CreateBillDialog projectId={projectId} onCreated={() => refresh("contractor-bills")} />
          </div>

          {/* Workflow legend */}
          <div className="flex flex-wrap gap-1.5">
            {BILL_STEPS.map(s => (
              <span key={s.key} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${s.color}`}>
                {s.label}
              </span>
            ))}
          </div>

          {/* Summary row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total Bills", value: bills.length, sub: "all stages" },
              { label: "Under Process", value: bills.filter((b: any) => !["closed", "payment_released", "draft"].includes(b.status)).length, sub: "in workflow" },
              { label: "Paid", value: bills.filter((b: any) => b.paidAt).length, sub: "released" },
              { label: "Total Gross", value: formatINR(bills.reduce((s: number, b: any) => s + b.grossAmount, 0)), sub: "all bills" },
            ].map(t => (
              <Card key={t.label}><CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{t.label}</p>
                <p className="text-xl font-bold mt-0.5">{t.value}</p>
                <p className="text-xs text-muted-foreground">{t.sub}</p>
              </CardContent></Card>
            ))}
          </div>

          {billsLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading bills…</div>
          ) : bills.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Banknote className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>No contractor bills yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {bills.map((bill: any) => (
                <BillRow key={bill.id} bill={bill} onRefresh={() => refresh("contractor-bills")} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── CLIENT BILLING ─────────────────────────────────────────────── */}
        <TabsContent value="client" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Client Invoices</h2>
              <p className="text-sm text-muted-foreground">Milestone-based billing with auto GST entries</p>
            </div>
            <CreateInvoiceDialog projectId={projectId} onCreated={() => refresh("client-invoices")} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total Invoiced", value: formatINR(clientInvoices.reduce((s: number, i: any) => s + i.grossAmount, 0)) },
              { label: "Total GST", value: formatINR(clientInvoices.reduce((s: number, i: any) => s + i.gstAmount, 0)) },
              { label: "Retention Held", value: formatINR(clientInvoices.reduce((s: number, i: any) => s + i.retentionHeld, 0)) },
              { label: "Amount Received", value: formatINR(clientInvoices.reduce((s: number, i: any) => s + i.amountReceived, 0)) },
            ].map(t => (
              <Card key={t.label}><CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{t.label}</p>
                <p className="text-lg font-bold mt-0.5">{t.value}</p>
              </CardContent></Card>
            ))}
          </div>

          {invLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading invoices…</div>
          ) : clientInvoices.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="h-10 w-10 mx-auto mb-2 opacity-30" /><p>No client invoices yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {clientInvoices.map((inv: any) => <ClientInvoiceRow key={inv.id} inv={inv} />)}
            </div>
          )}
        </TabsContent>

        {/* ── ANALYTICS ──────────────────────────────────────────────────── */}
        <TabsContent value="analytics" className="space-y-4">
          <h2 className="text-lg font-semibold">Payment Analytics</h2>
          <FeatureGate hasAccess={hasFinancialAnalytics} featureName="Payment Analytics" planRequired="Professional">
          {analytics ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <KpiTile label="Bills Received" value={String(analytics.received)} icon={FileText} />
                <KpiTile label="Under Process" value={String(analytics.underProcess)} icon={Clock} colorClass="text-amber-600" />
                <KpiTile label="Overdue (>30d)" value={String(analytics.overdueUnpaid)} icon={AlertTriangle} colorClass="text-red-600" />
                <KpiTile label="Paid This Month" value={formatINR(analytics.paidThisMonth)} icon={CheckCircle} colorClass="text-green-600" />
                <KpiTile label="TDS YTD" value={formatINR(analytics.tdsYtd)} icon={Shield} sub="u/s 194C" />
              </div>

              {/* Trend chart */}
              {analytics.trend?.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Monthly Payment Trend (₹)</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={analytics.trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={v => `${(v / 1e6).toFixed(1)}M`} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: any) => formatINR(v)} />
                        <Bar dataKey="paid" fill="#2563eb" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Aging */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Outstanding Bill Aging</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: "0–30 days", value: analytics.aging._0_30, color: "text-green-600" },
                      { label: "31–60 days", value: analytics.aging._31_60, color: "text-amber-600" },
                      { label: "61–90 days", value: analytics.aging._61_90, color: "text-orange-600" },
                      { label: ">90 days", value: analytics.aging._over90, color: "text-red-600" },
                    ].map(b => (
                      <div key={b.label} className="text-center p-3 rounded-lg border">
                        <p className={`text-2xl font-bold ${b.color}`}>{b.value}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{b.label}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground">Loading analytics…</div>
          )}
          </FeatureGate>
        </TabsContent>

        {/* ── REPORTS ────────────────────────────────────────────────────── */}
        <TabsContent value="reports" className="space-y-4">
          <h2 className="text-lg font-semibold">Financial Summary</h2>
          <FeatureGate hasAccess={hasFinancialAnalytics} featureName="Financial Reports" planRequired="Professional">
          {summary ? (
            <>
              {/* P&L */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiTile label="Contract Value" value={formatINR(summary.contractValue)} icon={Building2} />
                <KpiTile label="Total Billed (Contractor)" value={formatINR(summary.totalBilled)} icon={Banknote} colorClass="text-red-600" />
                <KpiTile label="Total Client Billed" value={formatINR(summary.totalClientBilled)} icon={Receipt} colorClass="text-blue-600" />
                <KpiTile label="Gross Margin" value={`${summary.pAndL.grossMarginPct.toFixed(1)}%`} icon={TrendingUp} colorClass={summary.pAndL.grossMarginPct >= 0 ? "text-green-600" : "text-red-600"} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* P&L card */}
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Profit & Loss (Project)</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {[
                      { label: "Revenue (Client Billed)", value: summary.pAndL.revenue, bold: false },
                      { label: "Expenditure (Contractor Billed)", value: summary.pAndL.expenditure, bold: false, neg: true },
                      { label: "Gross Profit", value: summary.pAndL.grossProfit, bold: true, colored: true },
                    ].map(r => (
                      <div key={r.label} className={`flex justify-between items-center ${r.bold ? "font-semibold border-t pt-2" : ""}`}>
                        <span className="text-muted-foreground">{r.label}</span>
                        <span className={r.colored ? (r.value >= 0 ? "text-green-600" : "text-red-600") : ""}>{formatINR(r.value)}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Balances card */}
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Payables & Receivables</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {[
                      { label: "Payable to Contractors", value: summary.payableToContractors, neg: true },
                      { label: "Receivable from Client", value: summary.receivableFromClient, pos: true },
                      { label: "Total TDS Deducted (YTD)", value: summary.totalTds },
                      { label: "Retention Balance", value: summary.retentionBalance },
                      { label: "Total Deductions (Bills)", value: summary.totalDeducted },
                    ].map(r => (
                      <div key={r.label} className="flex justify-between items-center">
                        <span className="text-muted-foreground">{r.label}</span>
                        <span className={r.neg ? "text-red-600 font-medium" : r.pos ? "text-green-600 font-medium" : ""}>{formatINR(r.value)}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>

              {/* Trial Balance */}
              {summary.trialBalance?.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Trial Balance</CardTitle></CardHeader>
                  <CardContent>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-xs text-muted-foreground">
                          <th className="text-left py-1.5 font-medium">Code</th>
                          <th className="text-left py-1.5 font-medium">Account</th>
                          <th className="text-left py-1.5 font-medium">Type</th>
                          <th className="text-right py-1.5 font-medium">Opening</th>
                          <th className="text-right py-1.5 font-medium">Current</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.trialBalance.map((row: any) => (
                          <tr key={row.accountCode} className="border-b last:border-0">
                            <td className="py-1.5 font-mono text-xs">{row.accountCode}</td>
                            <td className="py-1.5">{row.accountName}</td>
                            <td className="py-1.5"><Badge variant="outline" className="text-xs">{row.accountType}</Badge></td>
                            <td className="py-1.5 text-right text-muted-foreground">{formatINR(row.openingBalance)}</td>
                            <td className="py-1.5 text-right font-medium">{formatINR(row.currentBalance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground">Loading financial summary…</div>
          )}
          </FeatureGate>
        </TabsContent>

        {/* ── LEDGER ─────────────────────────────────────────────────────── */}
        <TabsContent value="ledger" className="space-y-4">
          <h2 className="text-lg font-semibold">Double-Entry Ledger</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Chart of accounts */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Chart of Accounts</h3>
              {accounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No accounts yet.</p>
              ) : (
                <div className="space-y-1">
                  {(["asset", "liability", "capital", "revenue", "expenditure", "tax"] as const).map(type => {
                    const typeAccounts = accounts.filter((a: any) => a.accountType === type);
                    if (!typeAccounts.length) return null;
                    const typeColor: Record<string, string> = {
                      asset: "text-blue-700", liability: "text-red-700", capital: "text-purple-700",
                      revenue: "text-green-700", expenditure: "text-orange-700", tax: "text-amber-700",
                    };
                    return (
                      <div key={type}>
                        <p className={`text-xs font-bold uppercase tracking-wide mt-2 mb-1 ${typeColor[type]}`}>{type}</p>
                        {typeAccounts.map((a: any) => (
                          <div key={a.id} className="flex items-center justify-between py-1 px-2 rounded hover:bg-muted/40 text-sm">
                            <div><span className="font-mono text-xs text-muted-foreground mr-2">{a.accountCode}</span>{a.accountName}</div>
                            <span className="font-medium">{formatINR(a.currentBalance)}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Journal entries */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Journal Entries</h3>
              {entries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No journal entries yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {entries.slice(0, 20).map((e: any) => (
                    <div key={e.id} className="border rounded-lg p-2.5 text-sm">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-mono text-xs text-muted-foreground">{e.entryNumber}</span>
                        <span className="font-semibold text-sm">{formatINR(e.amount)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{e.narration}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── REGISTERS ──────────────────────────────────────────────────── */}
        <TabsContent value="registers" className="space-y-4">
          <h2 className="text-lg font-semibold">Statutory Registers</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* TDS Register */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Shield className="h-4 w-4" /> TDS Register (u/s 194C)</CardTitle>
              </CardHeader>
              <CardContent>
                {tdsRegister.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No TDS entries yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left py-1 font-medium">Vendor</th>
                      <th className="text-right py-1 font-medium">Gross</th>
                      <th className="text-right py-1 font-medium">TDS</th>
                      <th className="text-right py-1 font-medium">Qtr</th>
                    </tr></thead>
                    <tbody>
                      {tdsRegister.map((t: any) => (
                        <tr key={t.id} className="border-b last:border-0">
                          <td className="py-1.5 text-xs">{t.vendorName}</td>
                          <td className="py-1.5 text-right">{formatINR(t.grossAmount)}</td>
                          <td className="py-1.5 text-right font-medium text-red-600">{formatINR(t.tdsAmount)}</td>
                          <td className="py-1.5 text-right text-xs text-muted-foreground">{t.quarter ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t font-semibold text-sm">
                      <td className="pt-2">Total</td>
                      <td className="pt-2 text-right">{formatINR(tdsRegister.reduce((s: number, t: any) => s + t.grossAmount, 0))}</td>
                      <td className="pt-2 text-right text-red-600">{formatINR(tdsRegister.reduce((s: number, t: any) => s + t.tdsAmount, 0))}</td>
                      <td />
                    </tr></tfoot>
                  </table>
                )}
              </CardContent>
            </Card>

            {/* GST Register */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Receipt className="h-4 w-4" /> GST Register (GSTR-1)</CardTitle>
              </CardHeader>
              <CardContent>
                {gstRegister.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No GST entries yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left py-1 font-medium">Party</th>
                      <th className="text-right py-1 font-medium">Taxable</th>
                      <th className="text-right py-1 font-medium">GST</th>
                      <th className="text-right py-1 font-medium">Type</th>
                    </tr></thead>
                    <tbody>
                      {gstRegister.map((g: any) => (
                        <tr key={g.id} className="border-b last:border-0">
                          <td className="py-1.5 text-xs">{g.partyName.slice(0, 20)}{g.partyName.length > 20 ? "…" : ""}</td>
                          <td className="py-1.5 text-right">{formatINR(g.taxableValue)}</td>
                          <td className="py-1.5 text-right font-medium text-blue-600">{formatINR(g.totalGst)}</td>
                          <td className="py-1.5 text-right"><Badge variant="outline" className="text-xs">{g.entryType}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t font-semibold text-sm">
                      <td className="pt-2">Total</td>
                      <td className="pt-2 text-right">{formatINR(gstRegister.reduce((s: number, g: any) => s + g.taxableValue, 0))}</td>
                      <td className="pt-2 text-right text-blue-600">{formatINR(gstRegister.reduce((s: number, g: any) => s + g.totalGst, 0))}</td>
                      <td />
                    </tr></tfoot>
                  </table>
                )}
              </CardContent>
            </Card>

            {/* Retention Ledger */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Retention Money Ledger</CardTitle></CardHeader>
              <CardContent>
                {retention.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No retention entries yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {retention.slice(0, 8).map((r: any) => (
                      <div key={r.id} className="flex justify-between text-sm border-b last:border-0 py-1.5">
                        <span className="text-muted-foreground text-xs">{r.transactionType}</span>
                        <div className="text-right">
                          <span className="text-amber-600 font-medium">{formatINR(r.retentionHeld)}</span>
                          <span className="text-xs text-muted-foreground ml-2">bal: {formatINR(r.balance)}</span>
                        </div>
                      </div>
                    ))}
                    <div className="border-t pt-2 flex justify-between font-semibold text-sm">
                      <span>Total Held</span>
                      <span className="text-amber-600">{formatINR(retention.reduce((s: number, r: any) => s + r.retentionHeld, 0))}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Advance Ledger */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Advance Ledger</CardTitle></CardHeader>
              <CardContent>
                {advanceLedger.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No advance entries yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {advanceLedger.slice(0, 8).map((a: any) => (
                      <div key={a.id} className="flex justify-between text-sm border-b last:border-0 py-1.5">
                        <span className="text-muted-foreground text-xs">{a.transactionType}</span>
                        <div className="text-right">
                          <span className="text-purple-600 font-medium">{formatINR(a.amount)}</span>
                          <span className="text-xs text-muted-foreground ml-2">bal: {formatINR(a.balance)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
