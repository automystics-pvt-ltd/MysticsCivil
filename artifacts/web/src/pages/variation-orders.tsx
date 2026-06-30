import { useState } from "react";
import { useParams, Link } from "wouter";
import {
  useListVariationOrders,
  useCreateVariationOrder,
  useUpdateVariationOrder,
  useListProjectEstimates,
  getListVariationOrdersQueryKey,
} from "@workspace/api-client-react";
import type { VariationOrder } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatINR } from "@/lib/ocms-format";
import { Plus, ChevronRight, TrendingUp, TrendingDown, Clock, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: "Draft", color: "bg-slate-100 text-slate-600 border-slate-200", icon: Clock },
  submitted: { label: "Submitted", color: "bg-amber-100 text-amber-700 border-amber-200", icon: AlertTriangle },
  approved: { label: "Approved", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "bg-rose-100 text-rose-600 border-rose-200", icon: XCircle },
};

function NewVoDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", scopeChange: "", costImpact: "", programmeImpactDays: "0", estimateId: "" });
  const { toast } = useToast();
  const qc = useQueryClient();
  const createVo = useCreateVariationOrder();
  const { data: estimates = [] } = useListProjectEstimates(projectId);

  const submit = () => {
    if (!form.title.trim()) { toast({ title: "Title required", variant: "destructive" }); return; }
    createVo.mutate(
      { projectId, data: { title: form.title, description: form.description || undefined, scopeChange: form.scopeChange || undefined, costImpact: form.costImpact ? Number(form.costImpact) : 0, programmeImpactDays: Number(form.programmeImpactDays || 0), estimateId: form.estimateId || undefined } },
      {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListVariationOrdersQueryKey(projectId) }); toast({ title: "Variation Order raised" }); setOpen(false); setForm({ title: "", description: "", scopeChange: "", costImpact: "", programmeImpactDays: "0", estimateId: "" }); },
        onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-1" /> Raise VO</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Raise Variation Order</DialogTitle></DialogHeader>
        <div className="space-y-3 mt-2">
          <div><label className="text-xs font-medium">Title</label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Brief VO title" /></div>
          <div><label className="text-xs font-medium">Description</label><Textarea rows={3} className="resize-none" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe the change" /></div>
          <div><label className="text-xs font-medium">Scope Change</label><Textarea rows={2} className="resize-none" value={form.scopeChange} onChange={e => setForm(f => ({ ...f, scopeChange: e.target.value }))} placeholder="Specific items added / removed / modified" /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="text-xs font-medium">Cost Impact (₹)</label><Input type="number" value={form.costImpact} onChange={e => setForm(f => ({ ...f, costImpact: e.target.value }))} /></div>
            <div><label className="text-xs font-medium">Programme Impact (days)</label><Input type="number" value={form.programmeImpactDays} onChange={e => setForm(f => ({ ...f, programmeImpactDays: e.target.value }))} /></div>
          </div>
          {estimates.length > 0 && (
            <div>
              <label className="text-xs font-medium">Link to Estimate (optional)</label>
              <Select value={form.estimateId} onValueChange={v => setForm(f => ({ ...f, estimateId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select estimate…" /></SelectTrigger>
                <SelectContent>
                  {estimates.map(e => <SelectItem key={e.id} value={e.id}>{e.level} — {e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={createVo.isPending}>Raise VO</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VoCard({ vo, projectId }: { vo: VariationOrder; projectId: string }) {
  const updateVo = useUpdateVariationOrder();
  const qc = useQueryClient();
  const { toast } = useToast();
  const cfg = STATUS_CONFIG[vo.status] ?? STATUS_CONFIG.draft;
  const Icon = cfg.icon;

  const changeStatus = (status: string) => {
    updateVo.mutate(
      { voId: vo.id, data: { status: status as any } },
      {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListVariationOrdersQueryKey(projectId) }); toast({ title: `VO ${status}` }); },
        onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
      },
    );
  };

  return (
    <Card className="hover:border-primary/40 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-bold text-muted-foreground">{vo.voNumber}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${cfg.color} inline-flex items-center gap-1`}>
                <Icon className="h-3 w-3" />{cfg.label}
              </span>
            </div>
            <div className="text-sm font-semibold mt-1">{vo.title}</div>
            {vo.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{vo.description}</p>}
          </div>
          <div className="text-right shrink-0">
            <div className={`text-sm font-bold ${vo.costImpact > 0 ? "text-emerald-700" : vo.costImpact < 0 ? "text-rose-600" : "text-muted-foreground"}`}>
              {vo.costImpact > 0 ? "+" : ""}{formatINR(vo.costImpact)}
            </div>
            {vo.programmeImpactDays !== 0 && (
              <div className={`text-xs ${vo.programmeImpactDays > 0 ? "text-rose-500" : "text-emerald-600"}`}>
                {vo.programmeImpactDays > 0 ? "+" : ""}{vo.programmeImpactDays} day{Math.abs(vo.programmeImpactDays) !== 1 ? "s" : ""}
              </div>
            )}
          </div>
        </div>

        {vo.scopeChange && (
          <div className="mt-2 text-xs bg-muted/50 rounded p-2">
            <span className="font-medium">Scope: </span>{vo.scopeChange}
          </div>
        )}

        <div className="flex items-center justify-between mt-3">
          <div className="text-[10px] text-muted-foreground">
            Raised {new Date(vo.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}
            {vo.approvedAt && ` · Approved ${new Date(vo.approvedAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}`}
          </div>
          <div className="flex gap-1">
            {vo.status === "draft" && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => changeStatus("submitted")}>Submit for Review</Button>
            )}
            {vo.status === "submitted" && (
              <>
                <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-700 border-emerald-300" onClick={() => changeStatus("approved")}>Approve</Button>
                <Button size="sm" variant="outline" className="h-7 text-xs text-rose-600 border-rose-300" onClick={() => changeStatus("rejected")}>Reject</Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function VariationOrdersPage({ projectId: propProjectId }: { projectId?: string } = {}) {
  const params = useParams<{ id: string }>();
  const projectId = propProjectId ?? params.id;
  const { data: vos = [], isLoading } = useListVariationOrders(projectId);

  const totalImpact = vos.filter(v => v.status === "approved").reduce((s, v) => s + v.costImpact, 0);
  const totalDays = vos.filter(v => v.status === "approved").reduce((s, v) => s + v.programmeImpactDays, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Variation Orders</h1>
          <p className="text-sm text-muted-foreground">Raise, review and approve changes to scope, cost and programme.</p>
        </div>
        <NewVoDialog projectId={projectId} />
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        {[
          { label: "Total VOs", value: vos.length, sub: "all statuses" },
          { label: "Approved VOs", value: vos.filter(v => v.status === "approved").length, sub: "contracted changes" },
          { label: "Approved Cost Impact", value: formatINR(totalImpact), sub: totalImpact > 0 ? "increase to RCV" : "saving" },
          { label: "Programme Impact", value: `${totalDays > 0 ? "+" : ""}${totalDays} days`, sub: "approved VOs only" },
        ].map(k => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">{k.label}</div>
              <div className="text-xl font-bold mt-1">{k.value}</div>
              <div className="text-xs text-muted-foreground">{k.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-28 w-full" />)}</div>
      ) : vos.length === 0 ? (
        <div className="py-12 text-center border border-dashed rounded-lg text-muted-foreground">
          <TrendingUp className="mx-auto h-8 w-8 mb-2" />
          <div className="text-sm">No variation orders yet. Raise a VO when scope, cost or programme changes.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {vos.map(vo => <VoCard key={vo.id} vo={vo} projectId={projectId} />)}
        </div>
      )}
    </div>
  );
}
