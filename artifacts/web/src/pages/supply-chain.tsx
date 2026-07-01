import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useConfirm } from "@/hooks/use-confirm";
import { LocationSelect } from "@/components/location-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, Package, FileText, ShoppingCart, Truck, FlaskConical,
  ClipboardList, Trash2, Plus, AlertTriangle, CheckCircle2, Clock, XCircle,
  TrendingDown, BarChart3, Boxes
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Vendor { id: string; name: string; code: string | null; contactPerson: string | null; email: string | null; phone: string | null; city: string | null; state: string | null; gstNumber: string | null; status: string; performanceScore: number; onTimeDeliveryPct: number; qualityAcceptancePct: number; totalOrders: number; }
interface InventoryItem { id: string; itemCode: string | null; itemName: string; category: string | null; unit: string; currentStock: number; minStockLevel: number; maxStockLevel: number; avgRate: number; lastPurchaseRate: number; isReorderTriggered: boolean; storeId: string | null; }
interface MaterialIndent { id: string; indentNumber: string; indentDate: string; status: string; remarks: string | null; requiredByDate: string | null; wbsActivityId: string | null; }
interface Rfq { id: string; rfqNumber: string; rfqDate: string; status: string; indentId: string | null; submissionDeadline: string | null; awardedVendorId: string | null; }
interface PurchaseOrder { id: string; poNumber: string; poDate: string; status: string; vendorId: string; totalAmount: number; grandTotal: number; gstAmount: number; deliveryDeadline: string | null; }
interface Grn { id: string; grnNumber: string; grnDate: string; status: string; poId: string | null; vendorId: string | null; threeWayMatchStatus: string | null; qcHoldCount: number; dcNumber: string | null; invoiceNumber: string | null; }
interface MaterialTest { id: string; testType: string; testResult: string; isCode: string | null; sampleDate: string | null; testDate: string | null; requiredValue: number | null; actualValue: number | null; unit: string | null; remarks: string | null; inventoryItemId: string | null; }
interface StockIssue { id: string; issueNumber: string; issueDate: string; issuedToName: string | null; issuedToContractor: string | null; indentId: string | null; storeId: string | null; }
interface WastageLog { id: string; wasteDate: string; qty: number; unit: string; amount: number; reasonCode: string; aboveNorm: boolean; inventoryItemId: string | null; }
interface InventorySummary { totalItems: number; reorderItems: number; totalStockValue: number; totalWastageValue: number; aboveNormWastage: number; totalIssues: number; categoryBreakdown: Record<string, number>; reorderAlerts: { id: string; itemName: string; currentStock: number; minStockLevel: number; unit: string }[]; }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const api = async (path: string, opts?: RequestInit) => {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    ...opts,
    headers: { "Content-Type": "application/json", ...opts?.headers },
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? "Request failed"); }
  return res.json();
};

const fmt = (n: number) => new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
const fmtL = (n: number) => `₹${(n / 100000).toFixed(2)}L`;
const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, string> = {
    draft: "bg-slate-100 text-slate-700", submitted: "bg-blue-100 text-blue-700", approved: "bg-emerald-100 text-emerald-700",
    queried: "bg-amber-100 text-amber-700", cancelled: "bg-red-100 text-red-700", fulfilled: "bg-purple-100 text-purple-700",
    active: "bg-emerald-100 text-emerald-700", inactive: "bg-slate-100 text-slate-700",
    blacklisted: "bg-red-100 text-red-700", pending_approval: "bg-amber-100 text-amber-700",
    sent: "bg-blue-100 text-blue-700", received: "bg-indigo-100 text-indigo-700",
    awarded: "bg-emerald-100 text-emerald-700", partial: "bg-orange-100 text-orange-700",
    closed: "bg-slate-100 text-slate-700", accepted: "bg-emerald-100 text-emerald-700",
    rejected: "bg-red-100 text-red-700", qc_pending: "bg-amber-100 text-amber-700",
    pass: "bg-emerald-100 text-emerald-700", fail: "bg-red-100 text-red-700", pending: "bg-amber-100 text-amber-700",
    matched: "bg-emerald-100 text-emerald-700", qty_mismatch: "bg-red-100 text-red-700", rate_mismatch: "bg-amber-100 text-amber-700",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${map[status] ?? "bg-slate-100 text-slate-600"}`}>{status.replace(/_/g, " ")}</span>;
};

// ─── Vendors Tab ─────────────────────────────────────────────────────────────
function VendorsTab({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { confirm: askConfirm, dialog: confirmDialog } = useConfirm();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", contactPerson: "", email: "", phone: "", country: "IN", city: "", state: "", gstNumber: "", pan: "" });

  const { data: vendors = [], isLoading } = useQuery<Vendor[]>({
    queryKey: ["vendors"],
    queryFn: () => api("/vendors"),
  });

  const { data: avl = [] } = useQuery<any[]>({
    queryKey: ["avl", projectId],
    queryFn: () => api(`/projects/${projectId}/avl`),
  });

  const avlVendorIds = new Set(avl.map((a: any) => a.vendorId));

  const createVendor = useMutation({
    mutationFn: (body: typeof form) => api("/vendors", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vendors"] }); setOpen(false); setForm({ name: "", code: "", contactPerson: "", email: "", phone: "", country: "IN", city: "", state: "", gstNumber: "", pan: "" }); toast({ title: "Vendor created" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addToAvl = useMutation({
    mutationFn: (vendorId: string) => api(`/projects/${projectId}/avl`, { method: "POST", body: JSON.stringify({ vendorId }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["avl", projectId] }); toast({ title: "Added to AVL" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const approveVendor = useMutation({
    mutationFn: (id: string) => api(`/vendors/${id}`, { method: "PATCH", body: JSON.stringify({ status: "active" }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vendors"] }); toast({ title: "Vendor approved" }); },
  });

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading vendors…</div>;

  const activeCount = vendors.filter(v => v.status === "active").length;
  const pendingCount = vendors.filter(v => v.status === "pending_approval").length;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Total Vendors</p><p className="text-2xl font-bold">{vendors.length}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Active</p><p className="text-2xl font-bold text-emerald-600">{activeCount}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Pending Approval</p><p className="text-2xl font-bold text-amber-600">{pendingCount}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">On AVL</p><p className="text-2xl font-bold text-blue-600">{avl.length}</p></CardContent></Card>
      </div>

      {/* Vendors Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Vendor Registry</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Vendor</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>New Vendor</DialogTitle></DialogHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[["name","Name *"],["code","Code"],["contactPerson","Contact Person"],["email","Email"],["phone","Phone"],["gstNumber","GST Number"],["pan","PAN"]].map(([k, l]) => (
                  <div key={k} className={k === "name" ? "col-span-2" : ""}>
                    <Label className="text-xs">{l}</Label>
                    <Input className="mt-1" value={(form as any)[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
                  </div>
                ))}
              </div>
              <div className="mt-2">
                <LocationSelect
                  country={form.country}
                  state={form.state}
                  city={form.city}
                  onCountryChange={v => setForm(f => ({ ...f, country: v, state: "", city: "" }))}
                  onStateChange={v => setForm(f => ({ ...f, state: v, city: "" }))}
                  onCityChange={v => setForm(f => ({ ...f, city: v }))}
                />
              </div>
              <Button className="w-full mt-2" disabled={createVendor.isPending} onClick={() => createVendor.mutate(form)}>
                {createVendor.isPending ? "Creating…" : "Create Vendor"}
              </Button>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Vendor</th>
                  <th className="px-4 py-2 text-left">Contact</th>
                  <th className="px-4 py-2 text-left">GST</th>
                  <th className="px-4 py-2 text-center">Score</th>
                  <th className="px-4 py-2 text-center">Status</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map(v => (
                  <tr key={v.id} className="border-b hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium">{v.name}</div>
                      <div className="text-xs text-muted-foreground">{v.code ?? "—"} · {v.city ?? ""} {v.state ?? ""}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <div>{v.contactPerson ?? "—"}</div>
                      <div className="text-xs">{v.email ?? ""}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{v.gstNumber ?? "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="text-sm font-semibold">{v.performanceScore ?? 0}%</div>
                      <div className="text-xs text-muted-foreground">{v.totalOrders} orders</div>
                    </td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={v.status} /></td>
                    <td className="px-4 py-3 text-right space-x-2">
                      {v.status === "pending_approval" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={async () => { if (!(await askConfirm({ title: "Approve vendor?", description: `"${v.name}" will be added to the active vendor list.`, confirmLabel: "Approve" }))) return; approveVendor.mutate(v.id); }}>Approve</Button>
                      )}
                      {v.status === "active" && !avlVendorIds.has(v.id) && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => addToAvl.mutate(v.id)}>+ AVL</Button>
                      )}
                      {avlVendorIds.has(v.id) && <Badge variant="outline" className="text-xs">AVL</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {vendors.length === 0 && <div className="p-8 text-center text-muted-foreground">No vendors yet. Add your first vendor.</div>}
          </div>
        </CardContent>
      </Card>
      {confirmDialog}
    </div>
  );
}

// ─── Inventory Tab ────────────────────────────────────────────────────────────
function InventoryTab({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [ledgerItem, setLedgerItem] = useState<InventoryItem | null>(null);
  const [filterCat, setFilterCat] = useState("all");
  const [form, setForm] = useState({ itemName: "", itemCode: "", category: "cement", unit: "bags", minStockLevel: "", maxStockLevel: "", openingStock: "0", avgRate: "0", hsnCode: "" });

  const { data: summary } = useQuery<InventorySummary>({
    queryKey: ["inventory-summary", projectId],
    queryFn: () => api(`/projects/${projectId}/inventory-summary`),
  });

  const { data: items = [], isLoading } = useQuery<InventoryItem[]>({
    queryKey: ["inventory", projectId],
    queryFn: () => api(`/projects/${projectId}/inventory`),
  });

  const { data: ledger = [] } = useQuery<any[]>({
    queryKey: ["stock-ledger", projectId, ledgerItem?.id],
    queryFn: () => api(`/projects/${projectId}/stock-ledger/${ledgerItem!.id}`),
    enabled: !!ledgerItem,
  });

  const createItem = useMutation({
    mutationFn: (body: typeof form) => api(`/projects/${projectId}/inventory`, { method: "POST", body: JSON.stringify({ ...body, minStockLevel: parseFloat(body.minStockLevel) || 0, maxStockLevel: parseFloat(body.maxStockLevel) || 0, openingStock: parseFloat(body.openingStock) || 0, avgRate: parseFloat(body.avgRate) || 0 }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inventory", projectId] }); qc.invalidateQueries({ queryKey: ["inventory-summary", projectId] }); setOpen(false); toast({ title: "Item created" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const categories = ["cement", "steel", "aggregates", "bricks", "sand", "tiles", "plumbing", "electrical", "hardware", "timber", "glass", "paint", "chemicals", "admixtures", "other"];
  const filtered = filterCat === "all" ? items : items.filter(i => i.category === filterCat);
  const reorderAlerts = items.filter(i => i.currentStock <= i.minStockLevel);

  return (
    <div className="space-y-6">
      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Total Items</p><p className="text-2xl font-bold">{summary.totalItems}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Stock Value</p><p className="text-2xl font-bold text-blue-600">{fmtL(summary.totalStockValue)}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Reorder Alerts</p><p className="text-2xl font-bold text-amber-600">{summary.reorderItems}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Wastage Value</p><p className="text-2xl font-bold text-red-600">{fmtL(summary.totalWastageValue)}</p></CardContent></Card>
        </div>
      )}

      {/* Reorder Alerts */}
      {reorderAlerts.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">Reorder Alerts ({reorderAlerts.length} items)</p>
            <p className="text-xs text-amber-700 mt-1">{reorderAlerts.map(i => `${i.itemName} (${i.currentStock} ${i.unit})`).join(" · ")}</p>
          </div>
        </div>
      )}

      {/* Inventory Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Stock Register</CardTitle>
          <div className="flex gap-2">
            <Select value={filterCat} onValueChange={setFilterCat}>
              <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Item</Button></DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>New Inventory Item</DialogTitle></DialogHeader>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="col-span-2"><Label className="text-xs">Item Name *</Label><Input className="mt-1" value={form.itemName} onChange={e => setForm(f => ({ ...f, itemName: e.target.value }))} /></div>
                  <div><Label className="text-xs">Item Code</Label><Input className="mt-1" value={form.itemCode} onChange={e => setForm(f => ({ ...f, itemCode: e.target.value }))} /></div>
                  <div><Label className="text-xs">Category</Label><Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{categories.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent></Select></div>
                  <div><Label className="text-xs">Unit</Label><Input className="mt-1" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} /></div>
                  <div><Label className="text-xs">HSN Code</Label><Input className="mt-1" value={form.hsnCode} onChange={e => setForm(f => ({ ...f, hsnCode: e.target.value }))} /></div>
                  <div><Label className="text-xs">Min Stock Level</Label><Input className="mt-1" type="number" value={form.minStockLevel} onChange={e => setForm(f => ({ ...f, minStockLevel: e.target.value }))} /></div>
                  <div><Label className="text-xs">Max Stock Level</Label><Input className="mt-1" type="number" value={form.maxStockLevel} onChange={e => setForm(f => ({ ...f, maxStockLevel: e.target.value }))} /></div>
                  <div><Label className="text-xs">Opening Stock</Label><Input className="mt-1" type="number" value={form.openingStock} onChange={e => setForm(f => ({ ...f, openingStock: e.target.value }))} /></div>
                  <div><Label className="text-xs">Avg Rate (₹)</Label><Input className="mt-1" type="number" value={form.avgRate} onChange={e => setForm(f => ({ ...f, avgRate: e.target.value }))} /></div>
                </div>
                <Button className="w-full mt-2" disabled={createItem.isPending} onClick={() => createItem.mutate(form)}>{createItem.isPending ? "Creating…" : "Create Item"}</Button>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Item</th>
                  <th className="px-4 py-2 text-left">Category</th>
                  <th className="px-4 py-2 text-right">Stock</th>
                  <th className="px-4 py-2 text-right">Min/Max</th>
                  <th className="px-4 py-2 text-right">Avg Rate</th>
                  <th className="px-4 py-2 text-right">Value</th>
                  <th className="px-4 py-2 text-center">Status</th>
                  <th className="px-4 py-2 text-right">Ledger</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => {
                  const stockValue = item.currentStock * item.avgRate;
                  const low = item.currentStock <= item.minStockLevel;
                  return (
                    <tr key={item.id} className={`border-b hover:bg-slate-50 transition-colors ${low ? "bg-amber-50/30" : ""}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium flex items-center gap-1.5">
                          {low && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                          {item.itemName}
                        </div>
                        <div className="text-xs text-muted-foreground">{item.itemCode ?? ""}</div>
                      </td>
                      <td className="px-4 py-3 capitalize text-muted-foreground text-xs">{item.category ?? "—"}</td>
                      <td className="px-4 py-3 text-right font-medium">{fmt(item.currentStock)} <span className="text-xs text-muted-foreground">{item.unit}</span></td>
                      <td className="px-4 py-3 text-right text-xs text-muted-foreground">{fmt(item.minStockLevel)} / {fmt(item.maxStockLevel)}</td>
                      <td className="px-4 py-3 text-right">₹{item.avgRate.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 text-right font-medium text-blue-700">{fmtL(stockValue)}</td>
                      <td className="px-4 py-3 text-center">{low ? <span className="text-xs text-amber-600 font-medium">Reorder</span> : <span className="text-xs text-emerald-600">OK</span>}</td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setLedgerItem(item)}>View</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && <div className="p-8 text-center text-muted-foreground">No items found.</div>}
          </div>
        </CardContent>
      </Card>

      {/* Stock Ledger Dialog */}
      <Dialog open={!!ledgerItem} onOpenChange={o => !o && setLedgerItem(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Stock Ledger — {ledgerItem?.itemName}</DialogTitle></DialogHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b bg-slate-50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Rate</th>
                  <th className="px-3 py-2 text-right">Balance</th>
                  <th className="px-3 py-2 text-left">Narration</th>
                </tr>
              </thead>
              <tbody>
                {(ledger as any[]).map((e: any) => (
                  <tr key={e.id} className="border-b hover:bg-slate-50">
                    <td className="px-3 py-2">{fmtDate(e.createdAt)}</td>
                    <td className="px-3 py-2 capitalize">{e.transactionType?.replace(/_/g, " ")}</td>
                    <td className={`px-3 py-2 text-right font-medium ${e.qty < 0 ? "text-red-600" : "text-emerald-600"}`}>{e.qty > 0 ? "+" : ""}{fmt(e.qty)}</td>
                    <td className="px-3 py-2 text-right">₹{parseFloat(e.rate).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-medium">{fmt(e.balanceQty)}</td>
                    <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px]">{e.narration ?? "—"}</td>
                  </tr>
                ))}
                {ledger.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No ledger entries</td></tr>}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Indents Tab ──────────────────────────────────────────────────────────────
function IndentsTab({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { confirm: askConfirm, dialog: confirmDialog } = useConfirm();
  const [open, setOpen] = useState(false);
  const [detailIndent, setDetailIndent] = useState<MaterialIndent | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [form, setForm] = useState({ indentNumber: "", requiredByDate: "", remarks: "" });

  const { data: indents = [], isLoading } = useQuery<MaterialIndent[]>({
    queryKey: ["indents", projectId],
    queryFn: () => api(`/projects/${projectId}/material-indents`),
  });

  const { data: indentItems = [] } = useQuery<any[]>({
    queryKey: ["indent-items", detailIndent?.id],
    queryFn: () => api(`/material-indents/${detailIndent!.id}/items`),
    enabled: !!detailIndent,
  });

  const createIndent = useMutation({
    mutationFn: (body: typeof form) => api(`/projects/${projectId}/material-indents`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["indents", projectId] }); setOpen(false); setForm({ indentNumber: "", requiredByDate: "", remarks: "" }); toast({ title: "Indent created" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const submitIndent = useMutation({
    mutationFn: (id: string) => api(`/material-indents/${id}/submit`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["indents", projectId] }); toast({ title: "Indent submitted for approval" }); },
  });

  const approveIndent = useMutation({
    mutationFn: (id: string) => api(`/material-indents/${id}/approve`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["indents", projectId] }); if (detailIndent) qc.invalidateQueries({ queryKey: ["indent-items", detailIndent.id] }); toast({ title: "Indent approved" }); },
  });

  const filtered = filterStatus === "all" ? indents : indents.filter(i => i.status === filterStatus);

  const statusCounts = indents.reduce((acc: Record<string, number>, i) => { acc[i.status] = (acc[i.status] ?? 0) + 1; return acc; }, {});

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {[["draft","Draft","slate"],["submitted","Submitted","blue"],["approved","Approved","emerald"],["queried","Queried","amber"],["fulfilled","Fulfilled","purple"],["cancelled","Cancelled","red"]].map(([s,l,c]) => (
          <Card key={s} className="cursor-pointer hover:shadow-sm" onClick={() => setFilterStatus(s === filterStatus ? "all" : s)}>
            <CardContent className="pt-3 pb-3 text-center">
              <p className="text-lg font-bold">{statusCounts[s] ?? 0}</p>
              <p className="text-xs text-muted-foreground">{l}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Material Indents</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> New Indent</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Raise Material Indent</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label className="text-xs">Indent Number *</Label><Input className="mt-1" value={form.indentNumber} onChange={e => setForm(f => ({ ...f, indentNumber: e.target.value }))} placeholder="IND-2025-XXX" /></div>
                <div><Label className="text-xs">Required By Date</Label><Input className="mt-1" type="date" value={form.requiredByDate} onChange={e => setForm(f => ({ ...f, requiredByDate: e.target.value }))} /></div>
                <div><Label className="text-xs">Remarks</Label><Textarea className="mt-1" value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} /></div>
                <Button className="w-full" disabled={createIndent.isPending} onClick={() => createIndent.mutate(form)}>{createIndent.isPending ? "Creating…" : "Create Indent"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Indent No.</th>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Required By</th>
                  <th className="px-4 py-2 text-left">Remarks</th>
                  <th className="px-4 py-2 text-center">Status</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(indent => (
                  <tr key={indent.id} className="border-b hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-blue-700 cursor-pointer" onClick={() => setDetailIndent(detailIndent?.id === indent.id ? null : indent)}>{indent.indentNumber}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(indent.indentDate)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(indent.requiredByDate)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">{indent.remarks ?? "—"}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={indent.status} /></td>
                    <td className="px-4 py-3 text-right space-x-1">
                      {indent.status === "draft" && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => submitIndent.mutate(indent.id)}>Submit</Button>}
                      {indent.status === "submitted" && <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-700" onClick={async () => { if (!(await askConfirm({ title: "Approve indent?", description: `Indent ${indent.indentNumber} will be approved for procurement.`, confirmLabel: "Approve" }))) return; approveIndent.mutate(indent.id); }}>Approve</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <div className="p-8 text-center text-muted-foreground">No indents found.</div>}
          </div>
        </CardContent>
      </Card>

      {/* Indent Detail */}
      {detailIndent && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Items — {detailIndent.indentNumber}</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-xs">
              <thead className="border-b bg-slate-50 text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Item</th>
                  <th className="px-4 py-2 text-right">Required</th>
                  <th className="px-4 py-2 text-right">Available</th>
                  <th className="px-4 py-2 text-right">Approved Qty</th>
                  <th className="px-4 py-2 text-left">Specification</th>
                </tr>
              </thead>
              <tbody>
                {indentItems.map((it: any) => (
                  <tr key={it.id} className="border-b">
                    <td className="px-4 py-2 font-medium">{it.itemName}</td>
                    <td className="px-4 py-2 text-right">{fmt(it.requiredQty)} {it.unit}</td>
                    <td className={`px-4 py-2 text-right ${it.availableStock < it.requiredQty ? "text-amber-600" : "text-emerald-600"}`}>{fmt(it.availableStock)}</td>
                    <td className="px-4 py-2 text-right">{it.approvedQty ? fmt(it.approvedQty) : "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{it.specification ?? "—"}</td>
                  </tr>
                ))}
                {indentItems.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">No items added to this indent.</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      {confirmDialog}
    </div>
  );
}

// ─── Purchase Orders Tab ──────────────────────────────────────────────────────
function PurchaseOrdersTab({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { confirm: askConfirm, dialog: confirmDialog } = useConfirm();
  const [open, setOpen] = useState(false);
  const [selectedPo, setSelectedPo] = useState<PurchaseOrder | null>(null);
  const [form, setForm] = useState({ poNumber: "", vendorId: "", deliveryLocation: "", deliveryDeadline: "", paymentTerms: "", notes: "" });

  const { data: pos = [], isLoading } = useQuery<PurchaseOrder[]>({
    queryKey: ["purchase-orders", projectId],
    queryFn: () => api(`/projects/${projectId}/purchase-orders`),
  });

  const { data: vendors = [] } = useQuery<Vendor[]>({
    queryKey: ["vendors"],
    queryFn: () => api("/vendors"),
  });

  const { data: poDetail } = useQuery<any>({
    queryKey: ["po-detail", selectedPo?.id],
    queryFn: () => api(`/purchase-orders/${selectedPo!.id}`),
    enabled: !!selectedPo,
  });

  const createPo = useMutation({
    mutationFn: (body: typeof form) => api(`/projects/${projectId}/purchase-orders`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["purchase-orders", projectId] }); setOpen(false); toast({ title: "PO created" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const approvePo = useMutation({
    mutationFn: (id: string) => api(`/purchase-orders/${id}/approve`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["purchase-orders", projectId] }); toast({ title: "PO approved" }); },
  });

  const totalValue = pos.reduce((s, p) => s + p.grandTotal, 0);
  const approvedValue = pos.filter(p => p.status !== "draft").reduce((s, p) => s + p.grandTotal, 0);
  const statusCounts = pos.reduce((acc: Record<string, number>, p) => { acc[p.status] = (acc[p.status] ?? 0) + 1; return acc; }, {});

  const vendorMap = Object.fromEntries(vendors.map(v => [v.id, v.name]));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Total POs</p><p className="text-2xl font-bold">{pos.length}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Total Value</p><p className="text-2xl font-bold text-blue-600">{fmtL(totalValue)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Approved</p><p className="text-2xl font-bold text-emerald-600">{fmtL(approvedValue)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Partial Receipt</p><p className="text-2xl font-bold text-amber-600">{statusCounts["partial"] ?? 0}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Purchase Orders</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> New PO</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Create Purchase Order</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label className="text-xs">PO Number *</Label><Input className="mt-1" value={form.poNumber} onChange={e => setForm(f => ({ ...f, poNumber: e.target.value }))} placeholder="PO-2025-XXX" /></div>
                  <div><Label className="text-xs">Vendor *</Label><Select value={form.vendorId} onValueChange={v => setForm(f => ({ ...f, vendorId: v }))}><SelectTrigger className="mt-1"><SelectValue placeholder="Select vendor" /></SelectTrigger><SelectContent>{vendors.filter(v => v.status === "active").map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent></Select></div>
                  <div><Label className="text-xs">Delivery Location</Label><Input className="mt-1" value={form.deliveryLocation} onChange={e => setForm(f => ({ ...f, deliveryLocation: e.target.value }))} /></div>
                  <div><Label className="text-xs">Delivery Deadline</Label><Input className="mt-1" type="date" value={form.deliveryDeadline} onChange={e => setForm(f => ({ ...f, deliveryDeadline: e.target.value }))} /></div>
                  <div className="col-span-2"><Label className="text-xs">Payment Terms</Label><Input className="mt-1" value={form.paymentTerms} onChange={e => setForm(f => ({ ...f, paymentTerms: e.target.value }))} placeholder="30 days credit" /></div>
                  <div className="col-span-2"><Label className="text-xs">Notes</Label><Textarea className="mt-1" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
                </div>
                <Button className="w-full" disabled={createPo.isPending} onClick={() => createPo.mutate(form)}>{createPo.isPending ? "Creating…" : "Create PO"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">PO Number</th>
                  <th className="px-4 py-2 text-left">Vendor</th>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Delivery By</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2 text-right">GST</th>
                  <th className="px-4 py-2 text-right">Grand Total</th>
                  <th className="px-4 py-2 text-center">Status</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pos.map(po => (
                  <tr key={po.id} className="border-b hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-blue-700 cursor-pointer" onClick={() => setSelectedPo(selectedPo?.id === po.id ? null : po)}>{po.poNumber}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{vendorMap[po.vendorId] ?? po.vendorId}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(po.poDate)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(po.deliveryDeadline)}</td>
                    <td className="px-4 py-3 text-right">₹{fmt(po.totalAmount)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground text-xs">₹{fmt(po.gstAmount)}</td>
                    <td className="px-4 py-3 text-right font-semibold">₹{fmt(po.grandTotal)}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={po.status} /></td>
                    <td className="px-4 py-3 text-right">
                      {po.status === "draft" && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={async () => { if (!(await askConfirm({ title: "Approve purchase order?", description: `${po.poNumber} — grand total ₹${fmt(po.grandTotal)}`, confirmLabel: "Approve" }))) return; approvePo.mutate(po.id); }}>Approve</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pos.length === 0 && <div className="p-8 text-center text-muted-foreground">No purchase orders yet.</div>}
          </div>
        </CardContent>
      </Card>

      {/* PO Detail */}
      {selectedPo && poDetail && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Line Items — {selectedPo.poNumber}</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-xs">
              <thead className="border-b bg-slate-50 text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Item</th>
                  <th className="px-4 py-2 text-right">Ordered</th>
                  <th className="px-4 py-2 text-right">Received</th>
                  <th className="px-4 py-2 text-right">Rate</th>
                  <th className="px-4 py-2 text-right">GST%</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2 text-left">HSN</th>
                </tr>
              </thead>
              <tbody>
                {(poDetail.items ?? []).map((item: any) => (
                  <tr key={item.id} className="border-b">
                    <td className="px-4 py-2 font-medium">{item.itemName}</td>
                    <td className="px-4 py-2 text-right">{fmt(item.orderedQty)} {item.unit}</td>
                    <td className="px-4 py-2 text-right text-emerald-700">{fmt(item.receivedQty)}</td>
                    <td className="px-4 py-2 text-right">₹{item.unitRate}</td>
                    <td className="px-4 py-2 text-right">{item.gstRate}%</td>
                    <td className="px-4 py-2 text-right font-medium">₹{fmt(item.amount + item.gstAmount)}</td>
                    <td className="px-4 py-2 text-muted-foreground">{item.hsnCode ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      {confirmDialog}
    </div>
  );
}

// ─── GRN Tab ──────────────────────────────────────────────────────────────────
function GrnTab({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { confirm: askConfirm, dialog: confirmDialog } = useConfirm();
  const [open, setOpen] = useState(false);
  const [selectedGrn, setSelectedGrn] = useState<Grn | null>(null);
  const [form, setForm] = useState({ grnNumber: "", poId: "", vendorId: "", vehicleNumber: "", dcNumber: "", invoiceNumber: "" });

  const { data: grns = [], isLoading } = useQuery<Grn[]>({
    queryKey: ["grns", projectId],
    queryFn: () => api(`/projects/${projectId}/grns`),
  });

  const { data: pos = [] } = useQuery<PurchaseOrder[]>({
    queryKey: ["purchase-orders", projectId],
    queryFn: () => api(`/projects/${projectId}/purchase-orders`),
  });

  const { data: vendors = [] } = useQuery<Vendor[]>({
    queryKey: ["vendors"],
    queryFn: () => api("/vendors"),
  });

  const { data: grnDetail } = useQuery<any>({
    queryKey: ["grn-detail", selectedGrn?.id],
    queryFn: () => api(`/grns/${selectedGrn!.id}`),
    enabled: !!selectedGrn,
  });

  const { data: selectedPoItems = [] } = useQuery<any[]>({
    queryKey: ["po-items", selectedGrn?.poId],
    queryFn: () => api(`/purchase-orders/${selectedGrn!.poId}/items`),
    enabled: !!selectedGrn?.poId,
  });

  const [itemForm, setItemForm] = useState({ poItemId: "", inventoryItemId: "", receivedQty: "", acceptedQty: "", rejectedQty: "0", unitRate: "", batchNumber: "", condition: "good", qcHold: false, remarks: "" });

  const addGrnItem = useMutation({
    mutationFn: (body: typeof itemForm) => api(`/grns/${selectedGrn!.id}/items`, {
      method: "POST",
      body: JSON.stringify({ ...body, receivedQty: parseFloat(body.receivedQty) || 0, acceptedQty: parseFloat(body.acceptedQty) || 0, rejectedQty: parseFloat(body.rejectedQty) || 0, unitRate: parseFloat(body.unitRate) || 0 }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grn-detail", selectedGrn?.id] });
      setItemForm({ poItemId: "", inventoryItemId: "", receivedQty: "", acceptedQty: "", rejectedQty: "0", unitRate: "", batchNumber: "", condition: "good", qcHold: false, remarks: "" });
      toast({ title: "Item added to GRN" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createGrn = useMutation({
    mutationFn: (body: typeof form) => api(`/projects/${projectId}/grns`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["grns", projectId] }); setOpen(false); toast({ title: "GRN created" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const submitGrn = useMutation({
    mutationFn: (id: string) => api(`/grns/${id}/submit`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["grns", projectId] }); qc.invalidateQueries({ queryKey: ["inventory", projectId] }); qc.invalidateQueries({ queryKey: ["inventory-summary", projectId] }); toast({ title: "GRN submitted — stock updated" }); },
  });

  const vendorMap = Object.fromEntries(vendors.map(v => [v.id, v.name]));

  const qcPendingCount = grns.filter(g => g.status === "qc_pending").length;
  const matchMismatch = grns.filter(g => g.threeWayMatchStatus && g.threeWayMatchStatus !== "matched").length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Total GRNs</p><p className="text-2xl font-bold">{grns.length}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">QC Pending</p><p className="text-2xl font-bold text-amber-600">{qcPendingCount}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Match Issues</p><p className="text-2xl font-bold text-red-600">{matchMismatch}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Accepted</p><p className="text-2xl font-bold text-emerald-600">{grns.filter(g => g.status === "accepted").length}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Goods Receipt Notes</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> New GRN</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Create GRN</DialogTitle></DialogHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label className="text-xs">GRN Number *</Label><Input className="mt-1" value={form.grnNumber} onChange={e => setForm(f => ({ ...f, grnNumber: e.target.value }))} placeholder="GRN-2025-XXX" /></div>
                <div><Label className="text-xs">Vendor</Label><Select value={form.vendorId} onValueChange={v => setForm(f => ({ ...f, vendorId: v }))}><SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent></Select></div>
                <div><Label className="text-xs">Against PO</Label><Select value={form.poId} onValueChange={v => setForm(f => ({ ...f, poId: v }))}><SelectTrigger className="mt-1"><SelectValue placeholder="Select PO" /></SelectTrigger><SelectContent>{pos.map(p => <SelectItem key={p.id} value={p.id}>{p.poNumber}</SelectItem>)}</SelectContent></Select></div>
                <div><Label className="text-xs">Vehicle No.</Label><Input className="mt-1" value={form.vehicleNumber} onChange={e => setForm(f => ({ ...f, vehicleNumber: e.target.value }))} /></div>
                <div><Label className="text-xs">DC Number</Label><Input className="mt-1" value={form.dcNumber} onChange={e => setForm(f => ({ ...f, dcNumber: e.target.value }))} /></div>
                <div><Label className="text-xs">Invoice No.</Label><Input className="mt-1" value={form.invoiceNumber} onChange={e => setForm(f => ({ ...f, invoiceNumber: e.target.value }))} /></div>
              </div>
              <Button className="w-full mt-2" disabled={createGrn.isPending} onClick={() => createGrn.mutate(form)}>{createGrn.isPending ? "Creating…" : "Create GRN"}</Button>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">GRN No.</th>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Vendor</th>
                  <th className="px-4 py-2 text-left">DC / Invoice</th>
                  <th className="px-4 py-2 text-center">3-Way Match</th>
                  <th className="px-4 py-2 text-center">QC Holds</th>
                  <th className="px-4 py-2 text-center">Status</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {grns.map(grn => (
                  <tr key={grn.id} className="border-b hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-blue-700 cursor-pointer" onClick={() => setSelectedGrn(selectedGrn?.id === grn.id ? null : grn)}>{grn.grnNumber}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(grn.grnDate)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{grn.vendorId ? vendorMap[grn.vendorId] ?? "—" : "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{grn.dcNumber ?? "—"} / {grn.invoiceNumber ?? "—"}</td>
                    <td className="px-4 py-3 text-center">{grn.threeWayMatchStatus ? <StatusBadge status={grn.threeWayMatchStatus} /> : <span className="text-xs text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-3 text-center">{grn.qcHoldCount > 0 ? <span className="text-amber-600 font-medium">{grn.qcHoldCount}</span> : <span className="text-muted-foreground">0</span>}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={grn.status} /></td>
                    <td className="px-4 py-3 text-right">
                      {grn.status === "draft" && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={async () => { if (!(await askConfirm({ title: "Submit GRN & update stock?", description: `GRN ${grn.grnNumber} will be submitted and inventory stock levels will be updated. This cannot be undone.`, confirmLabel: "Submit & Update" }))) return; submitGrn.mutate(grn.id); }}>Submit & Update Stock</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {grns.length === 0 && <div className="p-8 text-center text-muted-foreground">No GRNs yet.</div>}
          </div>
        </CardContent>
      </Card>

      {/* GRN Detail */}
      {selectedGrn && grnDetail && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Items — {selectedGrn.grnNumber}</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-xs">
              <thead className="border-b bg-slate-50 text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Item</th>
                  <th className="px-4 py-2 text-right">Ordered</th>
                  <th className="px-4 py-2 text-right">Received</th>
                  <th className="px-4 py-2 text-right">Accepted</th>
                  <th className="px-4 py-2 text-right">Rejected</th>
                  <th className="px-4 py-2 text-center">Condition</th>
                  <th className="px-4 py-2 text-center">QC Hold</th>
                  <th className="px-4 py-2 text-left">Batch</th>
                </tr>
              </thead>
              <tbody>
                {(grnDetail.items ?? []).map((item: any) => (
                  <tr key={item.id} className={`border-b ${item.qcHold ? "bg-amber-50/40" : ""}`}>
                    <td className="px-4 py-2 font-medium">{item.itemName}</td>
                    <td className="px-4 py-2 text-right">{fmt(item.orderedQty)} {item.unit}</td>
                    <td className="px-4 py-2 text-right">{fmt(item.receivedQty)}</td>
                    <td className="px-4 py-2 text-right text-emerald-700">{fmt(item.acceptedQty)}</td>
                    <td className="px-4 py-2 text-right text-red-600">{fmt(item.rejectedQty)}</td>
                    <td className="px-4 py-2 text-center capitalize">{item.condition}</td>
                    <td className="px-4 py-2 text-center">{item.qcHold ? <span className="text-amber-600 font-medium">Hold</span> : <span className="text-emerald-600">Clear</span>}</td>
                    <td className="px-4 py-2 text-muted-foreground">{item.batchNumber ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
          {selectedGrn.status === "draft" && (
            <div className="border-t p-4 bg-slate-50/50">
              <p className="text-xs font-medium text-muted-foreground mb-3">Add Line Item</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {selectedPoItems.length > 0 ? (
                  <div className="md:col-span-2">
                    <Label className="text-xs">From PO Line</Label>
                    <Select value={itemForm.poItemId} onValueChange={v => {
                      const poi = selectedPoItems.find((p: any) => p.id === v);
                      if (poi) setItemForm(f => ({ ...f, poItemId: v, inventoryItemId: poi.inventoryItemId ?? "", unitRate: String(poi.unitRate ?? ""), receivedQty: "", acceptedQty: "" }));
                    }}>
                      <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Select PO line" /></SelectTrigger>
                      <SelectContent>{selectedPoItems.map((p: any) => <SelectItem key={p.id} value={p.id} className="text-xs">{p.itemName} ({p.unit})</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                ) : null}
                <div><Label className="text-xs">Received Qty</Label><Input className="mt-1 h-8 text-xs" type="number" value={itemForm.receivedQty} onChange={e => setItemForm(f => ({ ...f, receivedQty: e.target.value, acceptedQty: e.target.value }))} /></div>
                <div><Label className="text-xs">Accepted Qty</Label><Input className="mt-1 h-8 text-xs" type="number" value={itemForm.acceptedQty} onChange={e => setItemForm(f => ({ ...f, acceptedQty: e.target.value }))} /></div>
                <div><Label className="text-xs">Unit Rate (₹)</Label><Input className="mt-1 h-8 text-xs" type="number" value={itemForm.unitRate} onChange={e => setItemForm(f => ({ ...f, unitRate: e.target.value }))} /></div>
                <div><Label className="text-xs">Batch No.</Label><Input className="mt-1 h-8 text-xs" value={itemForm.batchNumber} onChange={e => setItemForm(f => ({ ...f, batchNumber: e.target.value }))} /></div>
                <div><Label className="text-xs">Condition</Label>
                  <Select value={itemForm.condition} onValueChange={v => setItemForm(f => ({ ...f, condition: v }))}>
                    <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{["good","damaged","short","excess"].map(c => <SelectItem key={c} value={c} className="text-xs capitalize">{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="checkbox" checked={itemForm.qcHold} onChange={e => setItemForm(f => ({ ...f, qcHold: e.target.checked }))} />
                    QC Hold
                  </label>
                </div>
              </div>
              <Button size="sm" className="mt-3" disabled={addGrnItem.isPending || (!itemForm.receivedQty && !itemForm.poItemId)} onClick={() => addGrnItem.mutate(itemForm)}>
                <Plus className="h-3.5 w-3.5 mr-1" />{addGrnItem.isPending ? "Adding…" : "Add Item"}
              </Button>
            </div>
          )}
        </Card>
      )}
      {confirmDialog}
    </div>
  );
}

// ─── QC & Tests Tab ────────────────────────────────────────────────────────────
function QcTab({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ testType: "cube_strength", isCode: "IS:456", inventoryItemId: "", sampleDate: "", testDate: "", requiredValue: "", actualValue: "", unit: "N/mm²", testResult: "pending", remarks: "" });

  const { data: tests = [], isLoading } = useQuery<MaterialTest[]>({
    queryKey: ["material-tests", projectId],
    queryFn: () => api(`/projects/${projectId}/material-tests`),
  });

  const { data: items = [] } = useQuery<InventoryItem[]>({
    queryKey: ["inventory", projectId],
    queryFn: () => api(`/projects/${projectId}/inventory`),
  });

  const createTest = useMutation({
    mutationFn: (body: typeof form) => api(`/projects/${projectId}/material-tests`, { method: "POST", body: JSON.stringify({ ...body, requiredValue: body.requiredValue ? parseFloat(body.requiredValue) : undefined, actualValue: body.actualValue ? parseFloat(body.actualValue) : undefined }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["material-tests", projectId] }); setOpen(false); toast({ title: "Test created" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateTest = useMutation({
    mutationFn: ({ id, result }: { id: string; result: string }) => api(`/material-tests/${id}`, { method: "PATCH", body: JSON.stringify({ testResult: result }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["material-tests", projectId] }); toast({ title: "Test updated" }); },
  });

  const passCount = tests.filter(t => t.testResult === "pass").length;
  const failCount = tests.filter(t => t.testResult === "fail").length;
  const pendingCount = tests.filter(t => t.testResult === "pending").length;
  const itemMap = Object.fromEntries(items.map(i => [i.id, i.itemName]));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card><CardContent className="pt-4 text-center"><CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto mb-1" /><p className="text-xl font-bold text-emerald-600">{passCount}</p><p className="text-xs text-muted-foreground">Pass</p></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><XCircle className="h-5 w-5 text-red-500 mx-auto mb-1" /><p className="text-xl font-bold text-red-600">{failCount}</p><p className="text-xs text-muted-foreground">Fail</p></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><Clock className="h-5 w-5 text-amber-500 mx-auto mb-1" /><p className="text-xl font-bold text-amber-600">{pendingCount}</p><p className="text-xs text-muted-foreground">Pending</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Material Tests</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> New Test</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Log Material Test</DialogTitle></DialogHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label className="text-xs">Test Type</Label><Select value={form.testType} onValueChange={v => setForm(f => ({ ...f, testType: v }))}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{["cube_strength","tensile","sieve_analysis","proctor","dimension_check","other"].map(t => <SelectItem key={t} value={t} className="capitalize">{t.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select></div>
                <div><Label className="text-xs">IS Code</Label><Input className="mt-1" value={form.isCode} onChange={e => setForm(f => ({ ...f, isCode: e.target.value }))} placeholder="IS:456" /></div>
                <div className="col-span-2"><Label className="text-xs">Material</Label><Select value={form.inventoryItemId} onValueChange={v => setForm(f => ({ ...f, inventoryItemId: v }))}><SelectTrigger className="mt-1"><SelectValue placeholder="Select material" /></SelectTrigger><SelectContent>{items.map(i => <SelectItem key={i.id} value={i.id}>{i.itemName}</SelectItem>)}</SelectContent></Select></div>
                <div><Label className="text-xs">Sample Date</Label><Input className="mt-1" type="date" value={form.sampleDate} onChange={e => setForm(f => ({ ...f, sampleDate: e.target.value }))} /></div>
                <div><Label className="text-xs">Test Date</Label><Input className="mt-1" type="date" value={form.testDate} onChange={e => setForm(f => ({ ...f, testDate: e.target.value }))} /></div>
                <div><Label className="text-xs">Required Value</Label><Input className="mt-1" type="number" value={form.requiredValue} onChange={e => setForm(f => ({ ...f, requiredValue: e.target.value }))} /></div>
                <div><Label className="text-xs">Actual Value</Label><Input className="mt-1" type="number" value={form.actualValue} onChange={e => setForm(f => ({ ...f, actualValue: e.target.value }))} /></div>
                <div><Label className="text-xs">Unit</Label><Input className="mt-1" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} /></div>
                <div><Label className="text-xs">Result</Label><Select value={form.testResult} onValueChange={v => setForm(f => ({ ...f, testResult: v }))}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{["pending","pass","fail"].map(r => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent></Select></div>
                <div className="col-span-2"><Label className="text-xs">Remarks</Label><Textarea className="mt-1" value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} /></div>
              </div>
              <Button className="w-full mt-2" disabled={createTest.isPending} onClick={() => createTest.mutate(form)}>{createTest.isPending ? "Saving…" : "Save Test"}</Button>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Material</th>
                  <th className="px-4 py-2 text-left">Test Type</th>
                  <th className="px-4 py-2 text-left">IS Code</th>
                  <th className="px-4 py-2 text-right">Required</th>
                  <th className="px-4 py-2 text-right">Actual</th>
                  <th className="px-4 py-2 text-left">Sample Date</th>
                  <th className="px-4 py-2 text-center">Result</th>
                  <th className="px-4 py-2 text-right">Update</th>
                </tr>
              </thead>
              <tbody>
                {tests.map(test => (
                  <tr key={test.id} className="border-b hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-xs">{test.inventoryItemId ? (itemMap[test.inventoryItemId] ?? "—") : "—"}</td>
                    <td className="px-4 py-3 capitalize text-xs">{test.testType.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{test.isCode ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-xs">{test.requiredValue != null ? `${test.requiredValue} ${test.unit ?? ""}` : "—"}</td>
                    <td className="px-4 py-3 text-right text-xs font-medium">{test.actualValue != null ? `${test.actualValue} ${test.unit ?? ""}` : "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDate(test.sampleDate)}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={test.testResult} /></td>
                    <td className="px-4 py-3 text-right space-x-1">
                      {test.testResult === "pending" && <>
                        <Button size="sm" variant="outline" className="h-6 text-xs text-emerald-700" onClick={() => updateTest.mutate({ id: test.id, result: "pass" })}>Pass</Button>
                        <Button size="sm" variant="outline" className="h-6 text-xs text-red-700" onClick={() => updateTest.mutate({ id: test.id, result: "fail" })}>Fail</Button>
                      </>}
                    </td>
                  </tr>
                ))}
                {tests.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No tests logged yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Issue Create Form (extracted so it can hold its own state cleanly) ────────
function IssueCreateForm({ projectId, items, onSuccess }: { projectId: string; items: InventoryItem[]; onSuccess: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ issueNumber: "", issuedToName: "", issuedToContractor: "", notes: "" });
  const [lineItems, setLineItems] = useState<{ inventoryItemId: string; issuedQty: string }[]>([{ inventoryItemId: "", issuedQty: "" }]);

  const createIssue = useMutation({
    mutationFn: () => {
      const validLines = lineItems.filter(l => l.inventoryItemId && parseFloat(l.issuedQty) > 0);
      if (!form.issueNumber) throw new Error("Issue number required");
      if (validLines.length === 0) throw new Error("Add at least one item");
      return api(`/projects/${projectId}/stock-issues`, {
        method: "POST",
        body: JSON.stringify({ ...form, items: validLines.map(l => ({ inventoryItemId: l.inventoryItemId, issuedQty: parseFloat(l.issuedQty) })) }),
      });
    },
    onSuccess: () => {
      setForm({ issueNumber: "", issuedToName: "", issuedToContractor: "", notes: "" });
      setLineItems([{ inventoryItemId: "", issuedQty: "" }]);
      toast({ title: "Stock issued successfully" });
      onSuccess();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div><Label className="text-xs">Issue Number *</Label><Input className="mt-1" value={form.issueNumber} onChange={e => setForm(f => ({ ...f, issueNumber: e.target.value }))} placeholder="ISS-2025-XXX" /></div>
        <div><Label className="text-xs">Issued To</Label><Input className="mt-1" value={form.issuedToName} onChange={e => setForm(f => ({ ...f, issuedToName: e.target.value }))} placeholder="Engineer / Gang name" /></div>
        <div><Label className="text-xs">Contractor</Label><Input className="mt-1" value={form.issuedToContractor} onChange={e => setForm(f => ({ ...f, issuedToContractor: e.target.value }))} /></div>
        <div><Label className="text-xs">Notes</Label><Input className="mt-1" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
      </div>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Material</th>
              <th className="px-3 py-2 text-left w-32">Issue Qty</th>
              <th className="px-3 py-2 text-left w-20">Stock</th>
              <th className="px-3 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((line, idx) => {
              const inv = items.find(i => i.id === line.inventoryItemId);
              return (
                <tr key={idx} className="border-b">
                  <td className="px-3 py-1.5">
                    <Select value={line.inventoryItemId} onValueChange={v => setLineItems(ls => ls.map((l, i) => i === idx ? { ...l, inventoryItemId: v } : l))}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select material" /></SelectTrigger>
                      <SelectContent>{items.map(i => <SelectItem key={i.id} value={i.id} className="text-xs">{i.itemName} ({i.unit})</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-1.5"><Input className="h-7 text-xs" type="number" value={line.issuedQty} onChange={e => setLineItems(ls => ls.map((l, i) => i === idx ? { ...l, issuedQty: e.target.value } : l))} placeholder="0" /></td>
                  <td className="px-3 py-1.5 text-muted-foreground">{inv ? `${inv.currentStock} ${inv.unit}` : "—"}</td>
                  <td className="px-3 py-1.5 text-center">
                    {lineItems.length > 1 && <button className="text-red-400 hover:text-red-600" onClick={() => setLineItems(ls => ls.filter((_, i) => i !== idx))}>×</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="p-2 bg-slate-50/50">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setLineItems(ls => [...ls, { inventoryItemId: "", issuedQty: "" }])}>
            <Plus className="h-3 w-3 mr-1" /> Add Material
          </Button>
        </div>
      </div>
      <Button size="sm" disabled={createIssue.isPending} onClick={() => createIssue.mutate()}>
        <ClipboardList className="h-4 w-4 mr-1.5" />{createIssue.isPending ? "Issuing…" : "Issue Materials"}
      </Button>
    </div>
  );
}

// ─── Issues & Wastage Tab ──────────────────────────────────────────────────────
function IssuesWastageTab({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeSection, setActiveSection] = useState<"issues" | "wastage">("issues");

  const { data: issues = [] } = useQuery<StockIssue[]>({
    queryKey: ["stock-issues", projectId],
    queryFn: () => api(`/projects/${projectId}/stock-issues`),
  });

  const { data: wastage = [] } = useQuery<WastageLog[]>({
    queryKey: ["wastage-logs", projectId],
    queryFn: () => api(`/projects/${projectId}/wastage-logs`),
  });

  const { data: items = [] } = useQuery<InventoryItem[]>({
    queryKey: ["inventory", projectId],
    queryFn: () => api(`/projects/${projectId}/inventory`),
  });

  const [wForm, setWForm] = useState({ inventoryItemId: "", qty: "", reasonCode: "breakage", description: "", normQty: "" });

  const createWastage = useMutation({
    mutationFn: (body: typeof wForm) => api(`/projects/${projectId}/wastage-logs`, { method: "POST", body: JSON.stringify({ ...body, qty: parseFloat(body.qty) || 0, normQty: body.normQty ? parseFloat(body.normQty) : undefined, unit: items.find(i => i.id === body.inventoryItemId)?.unit ?? "nos" }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wastage-logs", projectId] }); qc.invalidateQueries({ queryKey: ["inventory", projectId] }); qc.invalidateQueries({ queryKey: ["inventory-summary", projectId] }); toast({ title: "Wastage logged" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const aboveNormCount = wastage.filter(w => w.aboveNorm).length;
  const totalWastageValue = wastage.reduce((s, w) => s + w.amount, 0);
  const itemMap = Object.fromEntries(items.map(i => [i.id, i.itemName]));

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <Button variant={activeSection === "issues" ? "default" : "outline"} size="sm" onClick={() => setActiveSection("issues")}><ClipboardList className="h-4 w-4 mr-1.5" /> Stock Issues ({issues.length})</Button>
        <Button variant={activeSection === "wastage" ? "default" : "outline"} size="sm" onClick={() => setActiveSection("wastage")}><Trash2 className="h-4 w-4 mr-1.5" /> Wastage ({wastage.length})</Button>
      </div>

      {activeSection === "issues" && (
        <div className="space-y-4">
          {/* Create Stock Issue form */}
          <Card>
            <CardHeader><CardTitle className="text-sm">New Stock Issue</CardTitle></CardHeader>
            <CardContent>
              <IssueCreateForm projectId={projectId} items={items} onSuccess={() => { qc.invalidateQueries({ queryKey: ["stock-issues", projectId] }); qc.invalidateQueries({ queryKey: ["inventory", projectId] }); qc.invalidateQueries({ queryKey: ["inventory-summary", projectId] }); }} />
            </CardContent>
          </Card>
          {/* Issue Register */}
          <Card>
            <CardHeader><CardTitle className="text-base">Stock Issue Register</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-slate-50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left">Issue No.</th>
                      <th className="px-4 py-2 text-left">Date</th>
                      <th className="px-4 py-2 text-left">Issued To</th>
                      <th className="px-4 py-2 text-left">Contractor</th>
                      <th className="px-4 py-2 text-left">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {issues.map(issue => (
                      <tr key={issue.id} className="border-b hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-blue-700">{issue.issueNumber}</td>
                        <td className="px-4 py-3 text-muted-foreground">{fmtDate(issue.issueDate)}</td>
                        <td className="px-4 py-3 text-xs">{issue.issuedToName ?? "—"}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{issue.issuedToContractor ?? "—"}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{(issue as any).notes ?? "—"}</td>
                      </tr>
                    ))}
                    {issues.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No issues yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeSection === "wastage" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Total Entries</p><p className="text-2xl font-bold">{wastage.length}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Total Value</p><p className="text-2xl font-bold text-red-600">{fmtL(totalWastageValue)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Above Norm</p><p className="text-2xl font-bold text-amber-600">{aboveNormCount}</p></CardContent></Card>
          </div>

          {aboveNormCount > 0 && (
            <div className="flex items-center gap-2 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">
              <AlertTriangle className="h-4 w-4" />
              <span>{aboveNormCount} wastage entries are above acceptable norm. PM has been alerted.</span>
            </div>
          )}

          {/* Log Wastage Form */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Log Wastage</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="col-span-2 md:col-span-1"><Label className="text-xs">Material</Label><Select value={wForm.inventoryItemId} onValueChange={v => setWForm(f => ({ ...f, inventoryItemId: v }))}><SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{items.map(i => <SelectItem key={i.id} value={i.id}>{i.itemName}</SelectItem>)}</SelectContent></Select></div>
                <div><Label className="text-xs">Quantity</Label><Input className="mt-1" type="number" value={wForm.qty} onChange={e => setWForm(f => ({ ...f, qty: e.target.value }))} /></div>
                <div><Label className="text-xs">Norm Qty</Label><Input className="mt-1" type="number" value={wForm.normQty} onChange={e => setWForm(f => ({ ...f, normQty: e.target.value }))} /></div>
                <div><Label className="text-xs">Reason</Label><Select value={wForm.reasonCode} onValueChange={v => setWForm(f => ({ ...f, reasonCode: v }))}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{["breakage","theft","spoilage","excess_mix","other"].map(r => <SelectItem key={r} value={r} className="capitalize">{r.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select></div>
                <div className="col-span-2"><Label className="text-xs">Description</Label><Input className="mt-1" value={wForm.description} onChange={e => setWForm(f => ({ ...f, description: e.target.value }))} /></div>
              </div>
              <Button className="mt-3" size="sm" disabled={createWastage.isPending} onClick={() => createWastage.mutate(wForm)}>{createWastage.isPending ? "Logging…" : "Log Wastage"}</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Wastage Register</CardTitle></CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">Date</th>
                    <th className="px-4 py-2 text-left">Material</th>
                    <th className="px-4 py-2 text-right">Qty</th>
                    <th className="px-4 py-2 text-right">Value</th>
                    <th className="px-4 py-2 text-left">Reason</th>
                    <th className="px-4 py-2 text-center">Above Norm</th>
                  </tr>
                </thead>
                <tbody>
                  {wastage.map(w => (
                    <tr key={w.id} className={`border-b hover:bg-slate-50 ${w.aboveNorm ? "bg-red-50/20" : ""}`}>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(w.wasteDate)}</td>
                      <td className="px-4 py-3 text-xs">{w.inventoryItemId ? (itemMap[w.inventoryItemId] ?? "—") : "—"}</td>
                      <td className="px-4 py-3 text-right">{fmt(w.qty)} {w.unit}</td>
                      <td className="px-4 py-3 text-right font-medium text-red-700">₹{fmt(w.amount)}</td>
                      <td className="px-4 py-3 text-xs capitalize text-muted-foreground">{w.reasonCode.replace(/_/g, " ")}</td>
                      <td className="px-4 py-3 text-center">{w.aboveNorm ? <span className="text-xs text-red-600 font-medium">⚠ Yes</span> : <span className="text-xs text-muted-foreground">No</span>}</td>
                    </tr>
                  ))}
                  {wastage.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No wastage entries.</td></tr>}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── RFQ Tab ──────────────────────────────────────────────────────────────────
function RfqTab({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedRfq, setSelectedRfq] = useState<Rfq | null>(null);
  const [form, setForm] = useState({ rfqNumber: "", submissionDeadline: "", deliveryDeadline: "", deliveryLocation: "", paymentTerms: "", notes: "" });

  const { data: rfqs = [] } = useQuery<Rfq[]>({
    queryKey: ["rfqs", projectId],
    queryFn: () => api(`/projects/${projectId}/rfqs`),
  });

  const { data: rfqDetail } = useQuery<any>({
    queryKey: ["rfq-detail", selectedRfq?.id],
    queryFn: () => api(`/rfqs/${selectedRfq!.id}`),
    enabled: !!selectedRfq,
  });

  const { data: rfqComparison } = useQuery<any>({
    queryKey: ["rfq-comparison", selectedRfq?.id],
    queryFn: () => api(`/rfqs/${selectedRfq!.id}/comparison`),
    enabled: !!selectedRfq,
  });

  const { data: vendors = [] } = useQuery<Vendor[]>({
    queryKey: ["vendors"],
    queryFn: () => api("/vendors"),
  });

  const [awardOpen, setAwardOpen] = useState(false);
  const [awardVendorId, setAwardVendorId] = useState("");
  const [overrideVendorCount, setOverrideVendorCount] = useState(false);

  const createRfq = useMutation({
    mutationFn: (body: typeof form) => api(`/projects/${projectId}/rfqs`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rfqs", projectId] }); setOpen(false); toast({ title: "RFQ created" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const awardRfq = useMutation({
    mutationFn: ({ rfqId, vendorId, override }: { rfqId: string; vendorId: string; override: boolean }) =>
      api(`/rfqs/${rfqId}/award`, { method: "POST", body: JSON.stringify({ vendorId, overrideVendorCount: override }) }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["rfqs", projectId] });
      qc.invalidateQueries({ queryKey: ["rfq-detail", selectedRfq?.id] });
      setAwardOpen(false); setAwardVendorId(""); setOverrideVendorCount(false);
      toast({ title: `RFQ awarded to ${vendorMap[data.awardedVendorId] ?? "vendor"}` });
    },
    onError: (e: any) => toast({ title: "Award failed", description: e.message, variant: "destructive" }),
  });

  const vendorMap = Object.fromEntries(vendors.map(v => [v.id, v.name]));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Request for Quotation</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> New RFQ</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Create RFQ</DialogTitle></DialogHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label className="text-xs">RFQ Number *</Label><Input className="mt-1" value={form.rfqNumber} onChange={e => setForm(f => ({ ...f, rfqNumber: e.target.value }))} placeholder="RFQ-2025-XXX" /></div>
                <div><Label className="text-xs">Submission Deadline</Label><Input className="mt-1" type="date" value={form.submissionDeadline} onChange={e => setForm(f => ({ ...f, submissionDeadline: e.target.value }))} /></div>
                <div><Label className="text-xs">Delivery Deadline</Label><Input className="mt-1" type="date" value={form.deliveryDeadline} onChange={e => setForm(f => ({ ...f, deliveryDeadline: e.target.value }))} /></div>
                <div><Label className="text-xs">Delivery Location</Label><Input className="mt-1" value={form.deliveryLocation} onChange={e => setForm(f => ({ ...f, deliveryLocation: e.target.value }))} /></div>
                <div className="col-span-2"><Label className="text-xs">Payment Terms</Label><Input className="mt-1" value={form.paymentTerms} onChange={e => setForm(f => ({ ...f, paymentTerms: e.target.value }))} /></div>
                <div className="col-span-2"><Label className="text-xs">Notes</Label><Textarea className="mt-1" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
              </div>
              <Button className="w-full mt-2" disabled={createRfq.isPending} onClick={() => createRfq.mutate(form)}>{createRfq.isPending ? "Creating…" : "Create RFQ"}</Button>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">RFQ No.</th>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Deadline</th>
                  <th className="px-4 py-2 text-left">Awarded To</th>
                  <th className="px-4 py-2 text-center">Status</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rfqs.map(rfq => (
                  <tr key={rfq.id} className="border-b hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-blue-700 cursor-pointer" onClick={() => setSelectedRfq(selectedRfq?.id === rfq.id ? null : rfq)}>{rfq.rfqNumber}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(rfq.rfqDate)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(rfq.submissionDeadline)}</td>
                    <td className="px-4 py-3 text-xs">{rfq.awardedVendorId ? vendorMap[rfq.awardedVendorId] ?? "—" : "—"}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={rfq.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedRfq(selectedRfq?.id === rfq.id ? null : rfq)}>Comparison</Button>
                    </td>
                  </tr>
                ))}
                {rfqs.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No RFQs yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Comparative Statement + Award */}
      {selectedRfq && rfqComparison && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm">Comparative Statement — {selectedRfq.rfqNumber}</CardTitle>
            {selectedRfq.status !== "awarded" && (
              <Dialog open={awardOpen} onOpenChange={o => { setAwardOpen(o); if (!o) { setAwardVendorId(""); setOverrideVendorCount(false); } }}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">Award PO</Button>
                </DialogTrigger>
                <DialogContent className="max-w-sm">
                  <DialogHeader><DialogTitle>Award RFQ — {selectedRfq.rfqNumber}</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label className="text-xs">Award to Vendor *</Label>
                      <Select value={awardVendorId} onValueChange={setAwardVendorId}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Select vendor (L1 recommended)" /></SelectTrigger>
                        <SelectContent>
                          {vendors.filter(v => v.status === "active").map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>Minimum 3 vendor responses required. Check override below if fewer.</span>
                    </div>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={overrideVendorCount} onChange={e => setOverrideVendorCount(e.target.checked)} className="rounded" />
                      Override vendor count requirement (record reason in PO notes)
                    </label>
                    <Button className="w-full bg-emerald-600 hover:bg-emerald-700"
                      disabled={!awardVendorId || awardRfq.isPending}
                      onClick={() => awardRfq.mutate({ rfqId: selectedRfq.id, vendorId: awardVendorId, override: overrideVendorCount })}>
                      {awardRfq.isPending ? "Awarding…" : "Confirm Award"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
            {selectedRfq.status === "awarded" && (
              <Badge className="bg-emerald-100 text-emerald-700">Awarded to {vendorMap[selectedRfq.awardedVendorId!] ?? "vendor"}</Badge>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {(rfqComparison.comparisonTable ?? []).map((row: any) => (
              <div key={row.itemId} className="p-4 border-b">
                <p className="text-sm font-medium mb-2">{row.itemName} ({row.unit}) — {fmt(row.requiredQty)} reqd.</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {row.responses.map((resp: any) => (
                    <div key={resp.vendorId} className={`rounded-lg border p-3 ${resp.isL1 ? "border-emerald-300 bg-emerald-50" : ""}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium">{vendorMap[resp.vendorId] ?? resp.vendorId}</span>
                        {resp.isL1 ? <Badge className="text-xs bg-emerald-100 text-emerald-700">L1</Badge> : <span className="text-xs text-muted-foreground">L{resp.rank}</span>}
                      </div>
                      <p className="text-lg font-bold">₹{fmt(resp.unitRate)}</p>
                      <p className="text-xs text-muted-foreground">+{resp.gstRate}% GST = ₹{resp.totalRate.toFixed(2)} total</p>
                      {resp.leadTimeDays && <p className="text-xs text-muted-foreground mt-1">{resp.leadTimeDays} days lead time</p>}
                      {selectedRfq.status !== "awarded" && resp.isL1 && (
                        <Button size="sm" variant="outline" className="mt-2 h-6 text-xs w-full border-emerald-300 text-emerald-700"
                          onClick={() => { setAwardVendorId(resp.vendorId); setAwardOpen(true); }}>
                          Select L1 &amp; Award
                        </Button>
                      )}
                    </div>
                  ))}
                  {row.responses.length === 0 && <p className="text-xs text-muted-foreground">No responses received yet</p>}
                </div>
              </div>
            ))}
            {(rfqComparison.comparisonTable ?? []).length === 0 && (
              <div className="p-8 text-center text-muted-foreground text-sm">No items or responses for this RFQ yet.</div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SupplyChainPage({ projectId }: { projectId: string }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ShoppingCart className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Supply Chain Management</h2>
      </div>

      <Tabs defaultValue="inventory">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="vendors" className="flex items-center gap-1.5 text-xs"><Building2 className="h-3.5 w-3.5" /> Vendors</TabsTrigger>
          <TabsTrigger value="inventory" className="flex items-center gap-1.5 text-xs"><Boxes className="h-3.5 w-3.5" /> Inventory</TabsTrigger>
          <TabsTrigger value="indents" className="flex items-center gap-1.5 text-xs"><ClipboardList className="h-3.5 w-3.5" /> Indents</TabsTrigger>
          <TabsTrigger value="rfq" className="flex items-center gap-1.5 text-xs"><FileText className="h-3.5 w-3.5" /> RFQ</TabsTrigger>
          <TabsTrigger value="purchase-orders" className="flex items-center gap-1.5 text-xs"><ShoppingCart className="h-3.5 w-3.5" /> Purchase Orders</TabsTrigger>
          <TabsTrigger value="grn" className="flex items-center gap-1.5 text-xs"><Truck className="h-3.5 w-3.5" /> GRN</TabsTrigger>
          <TabsTrigger value="qc" className="flex items-center gap-1.5 text-xs"><FlaskConical className="h-3.5 w-3.5" /> QC Tests</TabsTrigger>
          <TabsTrigger value="issues-wastage" className="flex items-center gap-1.5 text-xs"><Trash2 className="h-3.5 w-3.5" /> Issues & Wastage</TabsTrigger>
        </TabsList>

        <div className="mt-4">
          <TabsContent value="vendors"><VendorsTab projectId={projectId} /></TabsContent>
          <TabsContent value="inventory"><InventoryTab projectId={projectId} /></TabsContent>
          <TabsContent value="indents"><IndentsTab projectId={projectId} /></TabsContent>
          <TabsContent value="rfq"><RfqTab projectId={projectId} /></TabsContent>
          <TabsContent value="purchase-orders"><PurchaseOrdersTab projectId={projectId} /></TabsContent>
          <TabsContent value="grn"><GrnTab projectId={projectId} /></TabsContent>
          <TabsContent value="qc"><QcTab projectId={projectId} /></TabsContent>
          <TabsContent value="issues-wastage"><IssuesWastageTab projectId={projectId} /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
