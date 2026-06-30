import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProjectIssues,
  useCreateIssue,
  useUpdateIssue,
  getListProjectIssuesQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, AlertTriangle } from "lucide-react";
import { statusBadgeClass, formatDate } from "@/lib/ocms-format";

export function IssuesTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", severity: "medium" as const });

  const { data } = useListProjectIssues(projectId, {
    query: { enabled: !!projectId, queryKey: getListProjectIssuesQueryKey(projectId) },
  });
  const create = useCreateIssue();
  const update = useUpdateIssue();

  const submit = () => {
    if (!form.title) return;
    create.mutate(
      { projectId, data: form },
      {
        onSuccess: () => {
          setOpen(false);
          setForm({ title: "", description: "", severity: "medium" });
          qc.invalidateQueries({ queryKey: getListProjectIssuesQueryKey(projectId) });
        },
      },
    );
  };

  const setStatus = (id: string, status: string) => {
    update.mutate(
      { issueId: id, data: { status } },
      { onSuccess: () => qc.invalidateQueries({ queryKey: getListProjectIssuesQueryKey(projectId) }) },
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Issues Log</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Raise Issue</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Raise an Issue</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div><Label>Description</Label><Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div><Label>Severity</Label>
                <select className="w-full border rounded px-2 py-1.5 text-sm bg-background" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as any })}>
                  {["low", "medium", "high", "critical"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <DialogFooter><Button onClick={submit} disabled={create.isPending}>Raise</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {!data?.length ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No issues raised.</div>
        ) : (
          <div className="space-y-2">
            {data.map((i) => (
              <div key={i.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                <AlertTriangle className={`h-5 w-5 mt-0.5 ${i.severity === "critical" ? "text-rose-600" : i.severity === "high" ? "text-orange-600" : i.severity === "medium" ? "text-amber-600" : "text-slate-500"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{i.title}</span>
                    <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded border ${statusBadgeClass(i.severity)}`}>{i.severity}</span>
                    <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded border ${statusBadgeClass(i.status)}`}>{i.status.replace("_", " ")}</span>
                  </div>
                  {i.description && <div className="text-sm text-muted-foreground mt-1">{i.description}</div>}
                  <div className="text-xs text-muted-foreground mt-1">Raised {formatDate(i.raisedAt)}</div>
                </div>
                <select className="text-xs border rounded px-2 py-1 bg-background" value={i.status} onChange={(e) => setStatus(i.id, e.target.value)}>
                  {["open", "in_progress", "resolved", "closed"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
