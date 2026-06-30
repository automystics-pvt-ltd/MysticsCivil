import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProjectMilestones,
  useCreateMilestone,
  useUpdateMilestone,
  getListProjectMilestonesQueryKey,
  getGetProjectDashboardQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Award, Check } from "lucide-react";
import { statusBadgeClass, formatDate } from "@/lib/ocms-format";

export function MilestonesTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", targetDate: "" });

  const { data } = useListProjectMilestones(projectId, {
    query: { enabled: !!projectId, queryKey: getListProjectMilestonesQueryKey(projectId) },
  });
  const create = useCreateMilestone();
  const update = useUpdateMilestone();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListProjectMilestonesQueryKey(projectId) });
    qc.invalidateQueries({ queryKey: getGetProjectDashboardQueryKey(projectId) });
  };

  const submit = () => {
    if (!form.name || !form.targetDate) return;
    create.mutate(
      {
        projectId,
        data: {
          name: form.name,
          description: form.description,
          targetDate: new Date(form.targetDate).toISOString(),
        },
      },
      {
        onSuccess: () => {
          setOpen(false);
          setForm({ name: "", description: "", targetDate: "" });
          invalidate();
        },
      },
    );
  };

  const markComplete = (id: string) =>
    update.mutate(
      {
        milestoneId: id,
        data: { status: "completed", actualDate: new Date().toISOString(), certificateIssued: true },
      },
      { onSuccess: invalidate },
    );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Milestones</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> New Milestone
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Milestone</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label>Description</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div>
                <Label>Target Date</Label>
                <Input
                  type="date"
                  value={form.targetDate}
                  onChange={(e) => setForm({ ...form, targetDate: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={submit} disabled={create.isPending}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {!data?.length ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No milestones yet.</div>
        ) : (
          <div className="space-y-3">
            {data.map((m) => {
              const target = new Date(m.targetDate);
              const forecast = m.forecastDate ? new Date(m.forecastDate) : null;
              const variance = forecast ? Math.round((forecast.getTime() - target.getTime()) / (1000 * 60 * 60 * 24)) : 0;
              return (
                <div key={m.id} className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-muted/40 transition">
                  <div className="p-2 rounded-md bg-primary/10 text-primary">
                    <Award className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-medium truncate">{m.name}</div>
                      <span className={`text-xs px-2 py-0.5 rounded border ${statusBadgeClass(m.status)}`}>
                        {m.status.replace("_", " ")}
                      </span>
                      {m.certificateIssued && (
                        <span className="text-xs px-2 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-200">
                          Certified
                        </span>
                      )}
                    </div>
                    {m.description && (
                      <div className="text-sm text-muted-foreground truncate">{m.description}</div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1 flex gap-4">
                      <span>Target: {formatDate(m.targetDate)}</span>
                      {forecast && <span>Forecast: {formatDate(m.forecastDate)}</span>}
                      {m.actualDate && <span>Actual: {formatDate(m.actualDate)}</span>}
                      {variance > 0 && <span className="text-rose-600">+{variance}d slip</span>}
                    </div>
                  </div>
                  {m.status !== "completed" && (
                    <Button size="sm" variant="outline" onClick={() => markComplete(m.id)}>
                      <Check className="h-4 w-4 mr-1" /> Mark Complete
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
