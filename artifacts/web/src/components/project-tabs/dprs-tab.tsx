import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  useListProjectDprs,
  useCreateDpr,
  useListProjectWbs,
  getListProjectDprsQueryKey,
  getListApprovalsQueryKey,
  getGetProjectDashboardQueryKey,
  getListProjectWbsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, FileText, Trash2 } from "lucide-react";
import { statusBadgeClass, formatDate } from "@/lib/ocms-format";

interface ItemRow {
  activityId: string;
  quantityToday: number;
  remarks: string;
}

export function DprsTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    reportDate: today,
    weather: "Clear",
    temperature: 30,
    manpowerCount: 100,
    summary: "",
  });
  const [items, setItems] = useState<ItemRow[]>([]);

  const { data: dprs } = useListProjectDprs(projectId, {
    query: { enabled: !!projectId, queryKey: getListProjectDprsQueryKey(projectId) },
  });
  const { data: activities } = useListProjectWbs(projectId, {
    query: { enabled: !!projectId, queryKey: getListProjectWbsQueryKey(projectId) },
  });
  const create = useCreateDpr();

  const submit = () => {
    create.mutate(
      {
        projectId,
        data: {
          reportDate: new Date(form.reportDate).toISOString(),
          weather: form.weather,
          temperature: form.temperature,
          manpowerCount: form.manpowerCount,
          summary: form.summary,
          items: items.filter((i) => i.activityId && i.quantityToday > 0),
        },
      },
      {
        onSuccess: () => {
          setOpen(false);
          setItems([]);
          setForm({ reportDate: today, weather: "Clear", temperature: 30, manpowerCount: 100, summary: "" });
          qc.invalidateQueries({ queryKey: getListProjectDprsQueryKey(projectId) });
          qc.invalidateQueries({ queryKey: getGetProjectDashboardQueryKey(projectId) });
          qc.invalidateQueries({ queryKey: getListApprovalsQueryKey() });
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Daily Progress Reports</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">Site engineer's daily filing — auto-rolls up to WBS on approval.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New DPR</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>New Daily Progress Report</DialogTitle></DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Report Date</Label><Input type="date" value={form.reportDate} onChange={(e) => setForm({ ...form, reportDate: e.target.value })} /></div>
              <div><Label>Weather</Label><Input value={form.weather} onChange={(e) => setForm({ ...form, weather: e.target.value })} /></div>
              <div><Label>Temperature (°C)</Label><Input type="number" value={form.temperature} onChange={(e) => setForm({ ...form, temperature: parseFloat(e.target.value) || 0 })} /></div>
              <div><Label>Manpower Count</Label><Input type="number" value={form.manpowerCount} onChange={(e) => setForm({ ...form, manpowerCount: parseInt(e.target.value) || 0 })} /></div>
              <div className="col-span-2"><Label>Summary</Label><Textarea rows={3} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="What progressed today, blockers, safety notes, QC observations…" /></div>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <Label>Activity Quantities</Label>
                <Button size="sm" variant="outline" onClick={() => setItems([...items, { activityId: "", quantityToday: 0, remarks: "" }])}>
                  <Plus className="h-3 w-3 mr-1" /> Add line
                </Button>
              </div>
              <div className="space-y-2">
                {items.map((it, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <select
                      className="col-span-5 border rounded px-2 py-1.5 text-sm bg-background"
                      value={it.activityId}
                      onChange={(e) => {
                        const next = [...items]; next[i].activityId = e.target.value; setItems(next);
                      }}
                    >
                      <option value="">Select activity…</option>
                      {activities?.map((a) => (
                        <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                      ))}
                    </select>
                    <Input type="number" className="col-span-2" placeholder="Qty"
                      value={it.quantityToday}
                      onChange={(e) => { const next = [...items]; next[i].quantityToday = parseFloat(e.target.value) || 0; setItems(next); }} />
                    <Input className="col-span-4" placeholder="Remarks"
                      value={it.remarks}
                      onChange={(e) => { const next = [...items]; next[i].remarks = e.target.value; setItems(next); }} />
                    <button className="col-span-1 text-muted-foreground hover:text-rose-600 justify-self-center"
                      onClick={() => setItems(items.filter((_, j) => j !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {items.length === 0 && <div className="text-xs text-muted-foreground py-2">No line items yet. Add quantities executed today.</div>}
              </div>
            </div>

            <DialogFooter>
              <Button onClick={submit} disabled={create.isPending}>Save Draft</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {!dprs?.length ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No DPRs filed yet.</div>
        ) : (
          <div className="space-y-2">
            {dprs.map((d) => (
              <Link key={d.id} href={`/dprs/${d.id}`}>
                <a className="flex items-center gap-4 p-3 rounded-lg border bg-card hover:bg-muted/40 transition cursor-pointer">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">DPR · {formatDate(d.reportDate)}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {d.weather} · {d.temperature}°C · {d.manpowerCount} workers · {d.summary?.slice(0, 80) || "—"}
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded border ${statusBadgeClass(d.status)}`}>
                    {d.status}
                  </span>
                </a>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
