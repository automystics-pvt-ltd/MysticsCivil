import { useParams } from "wouter";
import { useGetBoqVsActual, useListProjectEstimates } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatINR } from "@/lib/ocms-format";
import { AlertTriangle, CheckCircle2, TrendingUp, TrendingDown } from "lucide-react";

const ALERT_CONFIG = {
  green: { label: "On Rate", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", icon: CheckCircle2 },
  amber: { label: "Minor Variance", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", icon: AlertTriangle },
  red: { label: "High Variance", color: "text-rose-700", bg: "bg-rose-50", border: "border-rose-200", icon: TrendingUp },
};

export default function BoqVsActualPage({ projectId: propProjectId }: { projectId?: string } = {}) {
  const params = useParams<{ id: string }>();
  const projectId = propProjectId ?? params.id;
  const { data, isLoading } = useGetBoqVsActual(projectId);

  if (isLoading) return <div className="space-y-4">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>;

  const items = data?.items ?? [];
  const counts = data?.counts ?? { green: 0, amber: 0, red: 0 };
  const amtVariance = items.reduce((s, i) => s + (i.actualAmount - i.amount), 0);

  if (items.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground text-sm">
        <TrendingUp className="mx-auto h-8 w-8 mb-2" />
        No L3 BOQ items with actuals tracked yet. Create a Detailed BOQ and record actual quantities.
      </div>
    );
  }

  const byTrade = items.reduce<Record<string, typeof items>>((acc, i) => { (acc[i.trade] ||= []).push(i); return acc; }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">BOQ vs Actual</h1>
        <p className="text-sm text-muted-foreground">Live rate variance — green ≤5%, amber 5–10%, red &gt;10%.</p>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground uppercase">Total Items</div><div className="text-xl font-bold mt-1">{items.length}</div></CardContent></Card>
        {(["green","amber","red"] as const).map(k => {
          const cfg = ALERT_CONFIG[k];
          const Icon = cfg.icon;
          return (
            <Card key={k} className={`${cfg.border} border-2`}>
              <CardContent className={`p-4 ${cfg.bg}`}>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase"><Icon className={`h-3.5 w-3.5 ${cfg.color}`} />{cfg.label}</div>
                <div className={`text-xl font-bold mt-1 ${cfg.color}`}>{counts[k]}</div>
                <div className="text-xs text-muted-foreground">{((counts[k] / Math.max(items.length, 1)) * 100).toFixed(0)}% of items</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className={`text-sm p-3 rounded-lg border ${amtVariance > 0 ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-emerald-50 border-emerald-200 text-emerald-700"}`}>
        {amtVariance > 0 ? "▲ Overrun" : "▼ Saving"}: <span className="font-bold">{formatINR(Math.abs(amtVariance))}</span> vs BOQ
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase text-muted-foreground border-b bg-muted/30">
                <tr>
                  <th className="text-left py-2 px-3">Trade / Description</th>
                  <th className="text-right py-2 px-3">Unit</th>
                  <th className="text-right py-2 px-3">BOQ Qty</th>
                  <th className="text-right py-2 px-3">BOQ Rate</th>
                  <th className="text-right py-2 px-3">Actual Qty</th>
                  <th className="text-right py-2 px-3">Actual Rate</th>
                  <th className="text-right py-2 px-3">Variance%</th>
                  <th className="text-center py-2 px-3">Alert</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(byTrade).map(([trade, tradeItems]) => (
                  <>
                    <tr key={`hdr-${trade}`} className="bg-muted/20">
                      <td colSpan={8} className="py-1.5 px-3 text-xs font-semibold uppercase tracking-wide">{trade}</td>
                    </tr>
                    {tradeItems.map(item => {
                      const cfg = ALERT_CONFIG[item.alert as keyof typeof ALERT_CONFIG] ?? ALERT_CONFIG.green;
                      const Icon = cfg.icon;
                      return (
                        <tr key={item.id} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="py-1.5 px-3">{item.description}</td>
                          <td className="py-1.5 px-3 text-right">{item.unit}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums">{item.quantity.toLocaleString()}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums">{formatINR(item.rate)}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums">{item.actualQuantity > 0 ? item.actualQuantity.toLocaleString() : "—"}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums">{item.actualQuantity > 0 ? formatINR(item.actualRate) : "—"}</td>
                          <td className={`py-1.5 px-3 text-right tabular-nums font-medium ${cfg.color}`}>
                            {item.actualQuantity > 0 ? `${item.variancePct > 0 ? "+" : ""}${item.variancePct.toFixed(1)}%` : "—"}
                          </td>
                          <td className="py-1.5 px-3 text-center">
                            {item.actualQuantity > 0 && (
                              <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${cfg.bg} ${cfg.border} ${cfg.color}`}>
                                <Icon className="h-2.5 w-2.5" />{cfg.label}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
