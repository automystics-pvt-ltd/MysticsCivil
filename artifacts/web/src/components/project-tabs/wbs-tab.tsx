import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProjectWbs,
  useCreateWbsActivity,
  useUpdateWbsActivity,
  useDeleteWbsActivity,
  getListProjectWbsQueryKey,
  getGetProjectDashboardQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { statusBadgeClass, formatINR } from "@/lib/ocms-format";

export function WbsTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: "",
    name: "",
    unit: "cum",
    plannedQuantity: 0,
    plannedCost: 0,
    weight: 1,
  });

  const { data, isLoading } = useListProjectWbs(projectId, {
    query: { enabled: !!projectId, queryKey: getListProjectWbsQueryKey(projectId) },
  });
  const create = useCreateWbsActivity();
  const update = useUpdateWbsActivity();
  const del = useDeleteWbsActivity();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListProjectWbsQueryKey(projectId) });
    qc.invalidateQueries({ queryKey: getGetProjectDashboardQueryKey(projectId) });
  };

  const submit = () => {
    create.mutate(
      { projectId, data: form },
      {
        onSuccess: () => {
          setOpen(false);
          setForm({ code: "", name: "", unit: "cum", plannedQuantity: 0, plannedCost: 0, weight: 1 });
          invalidate();
        },
      },
    );
  };

  const setStatus = (id: string, status: string) => {
    update.mutate({ activityId: id, data: { status: status as any } }, { onSuccess: invalidate });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Work Breakdown Structure</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Activity-level plan, progress, and cost variance.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> New Activity
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New WBS Activity</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="col-span-1">
                <Label>Code</Label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </div>
              <div className="col-span-1">
                <Label>Unit</Label>
                <Input
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <Label>Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <Label>Planned Quantity</Label>
                <Input
                  type="number"
                  value={form.plannedQuantity}
                  onChange={(e) =>
                    setForm({ ...form, plannedQuantity: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
              <div>
                <Label>Planned Cost (₹)</Label>
                <Input
                  type="number"
                  value={form.plannedCost}
                  onChange={(e) =>
                    setForm({ ...form, plannedCost: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
              <div>
                <Label>Weight</Label>
                <Input
                  type="number"
                  value={form.weight}
                  onChange={(e) =>
                    setForm({ ...form, weight: parseFloat(e.target.value) || 1 })
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={submit} disabled={!form.code || !form.name || create.isPending}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : !data?.length ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No activities yet. Add the first one to start tracking progress.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground border-b">
                <tr>
                  <th className="text-left py-2 pr-2">Code</th>
                  <th className="text-left py-2 pr-2">Activity</th>
                  <th className="text-right py-2 pr-2">Plan Qty</th>
                  <th className="text-right py-2 pr-2">Actual Qty</th>
                  <th className="text-right py-2 pr-2">Plan %</th>
                  <th className="text-right py-2 pr-2">Actual %</th>
                  <th className="text-right py-2 pr-2">Plan Cost</th>
                  <th className="text-right py-2 pr-2">Actual Cost</th>
                  <th className="text-left py-2 pr-2">Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.map((a) => {
                  const variance = a.actualPercent - a.plannedPercent;
                  const costVariance = a.plannedCost > 0 ? ((a.actualCost - a.plannedCost) / a.plannedCost) * 100 : 0;
                  return (
                    <tr key={a.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="py-2 pr-2 font-mono text-xs">{a.code}</td>
                      <td className="py-2 pr-2 font-medium">{a.name}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">
                        {a.plannedQuantity.toLocaleString()} {a.unit}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">
                        {a.actualQuantity.toLocaleString()}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">{a.plannedPercent.toFixed(0)}%</td>
                      <td className={`py-2 pr-2 text-right tabular-nums ${variance < -5 ? "text-rose-600" : variance < 0 ? "text-amber-600" : "text-emerald-700"}`}>
                        {a.actualPercent.toFixed(0)}%
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">{formatINR(a.plannedCost)}</td>
                      <td className={`py-2 pr-2 text-right tabular-nums ${costVariance > 5 ? "text-rose-600" : "text-foreground"}`}>
                        {formatINR(a.actualCost)}
                      </td>
                      <td className="py-2 pr-2">
                        <select
                          className={`text-xs rounded px-2 py-1 border ${statusBadgeClass(a.status)}`}
                          value={a.status}
                          onChange={(e) => setStatus(a.id, e.target.value)}
                        >
                          {["not_started", "on_track", "at_risk", "delayed", "on_hold", "completed"].map((s) => (
                            <option key={s} value={s}>
                              {s.replace("_", " ")}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pr-2">
                        <button
                          className="text-muted-foreground hover:text-rose-600"
                          onClick={() =>
                            del.mutate(
                              { activityId: a.id },
                              { onSuccess: invalidate },
                            )
                          }
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="text-xs text-muted-foreground mt-3">
          {data?.length || 0} activities · variance shown vs plan
        </div>
        <span className="hidden">{update.isPending}</span>
        <span className="hidden">{(Badge as any).name}</span>
      </CardContent>
    </Card>
  );
}
