import { useQuery } from "@tanstack/react-query";
import { BarChart2, Target, Award, TrendingUp, DollarSign, Briefcase, FolderOpen, ArrowRight, Users2, FileSearch, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (path: string) => `${BASE}/api${path}`;

function fmt(v: number) {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(1)}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`;
  return `₹${v.toLocaleString("en-IN")}`;
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return <div className="w-full bg-muted rounded-full h-2"><div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} /></div>;
}

export default function AnalyticsPage() {
  const { data: leadStats } = useQuery({ queryKey: ["leads-stats"], queryFn: () => fetch(api("/leads/stats"), { credentials: "include" }).then(r => r.json()) });
  const { data: tenderStats } = useQuery({ queryKey: ["tenders-stats"], queryFn: () => fetch(api("/tenders/stats"), { credentials: "include" }).then(r => r.json()) });
  const { data: customerStats } = useQuery({ queryKey: ["customers-stats"], queryFn: () => fetch(api("/customers/stats"), { credentials: "include" }).then(r => r.json()) });
  const { data: preEstStats } = useQuery({ queryKey: ["pre-estimations-stats"], queryFn: () => fetch(api("/pre-estimations/stats"), { credentials: "include" }).then(r => r.json()) });
  const { data: quotationStats } = useQuery({ queryKey: ["quotations-stats"], queryFn: () => fetch(api("/quotations/stats"), { credentials: "include" }).then(r => r.json()) });

  const leadTotal = leadStats?.total ?? 0;
  const leadWon = leadStats?.byStage?.won?.count ?? 0;
  const winRate = leadTotal > 0 ? Math.round((leadWon / leadTotal) * 100) : 0;
  const pipeline = leadStats?.pipelineValue ?? 0;
  const tenderWon = tenderStats?.byStatus?.won?.count ?? 0;
  const tenderTotal = tenderStats?.total ?? 0;
  const tenderSuccessRate = tenderStats?.successRate ?? 0;

  const stages = [
    { label: "Leads", count: leadTotal, url: "/leads", icon: Target, color: "bg-blue-500" },
    { label: "Customers", count: customerStats?.total ?? 0, url: "/customers", icon: Users2, color: "bg-indigo-500" },
    { label: "Pre-Estimations", count: preEstStats?.total ?? 0, url: "/pre-estimations", icon: FileSearch, color: "bg-violet-500" },
    { label: "Quotations", count: quotationStats?.total ?? 0, url: "/quotations", icon: FileText, color: "bg-purple-500" },
    { label: "Tenders", count: tenderTotal, url: "/tenders", icon: Briefcase, color: "bg-orange-500" },
  ];

  const leadStages = Object.entries(leadStats?.byStage ?? {}) as [string, { count: number; value: number }][];
  const maxLeadCount = Math.max(...leadStages.map(([, v]) => v.count), 1);
  const tenderStatuses = Object.entries(tenderStats?.byStatus ?? {}) as [string, { count: number; value: number }][];
  const maxTenderCount = Math.max(...tenderStatuses.map(([, v]) => v.count), 1);

  const STAGE_COLORS: Record<string, string> = { prospect: "bg-slate-400", qualified: "bg-blue-500", proposal: "bg-violet-500", negotiation: "bg-amber-500", won: "bg-emerald-500", lost: "bg-red-400" };
  const STATUS_COLORS: Record<string, string> = { upcoming: "bg-slate-400", in_progress: "bg-blue-500", submitted: "bg-violet-500", under_evaluation: "bg-amber-500", won: "bg-emerald-500", lost: "bg-red-400", cancelled: "bg-gray-400" };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><BarChart2 className="h-6 w-6 text-primary" /> Analytics</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Pipeline health across the full pre-award lifecycle</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Leads", value: leadTotal, icon: Target, color: "text-blue-500" },
          { label: "Lead Win Rate", value: `${winRate}%`, icon: Award, color: "text-emerald-500" },
          { label: "Pipeline Value", value: fmt(pipeline), icon: TrendingUp, color: "text-violet-500" },
          { label: "Tender Success", value: `${tenderSuccessRate}%`, icon: DollarSign, color: "text-amber-500" },
        ].map(k => (
          <Card key={k.label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1"><k.icon className={`h-4 w-4 ${k.color}`} /><span className="text-xs text-muted-foreground">{k.label}</span></div>
              <p className="text-2xl font-bold">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Lifecycle Funnel</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-end gap-2 overflow-x-auto pb-2">
            {stages.map((s, i) => (
              <div key={s.label} className="flex items-center gap-2 flex-shrink-0">
                <Link href={s.url} className="flex flex-col items-center gap-2 group">
                  <div className={`rounded-xl flex items-center justify-center ${s.color} text-white transition-transform group-hover:scale-105`} style={{ width: 80, height: Math.max(40, Math.min(120, (s.count / (Math.max(...stages.map(x => x.count)) || 1)) * 120)) }}>
                    <s.icon className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-semibold">{s.count}</span>
                  <span className="text-xs text-muted-foreground text-center w-20 leading-tight">{s.label}</span>
                </Link>
                {i < stages.length - 1 && <ArrowRight className="h-4 w-4 text-muted-foreground/40 flex-shrink-0 mb-10" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Lead Pipeline by Stage</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {leadStages.length === 0 && <p className="text-sm text-muted-foreground">No lead data yet</p>}
            {leadStages.map(([stage, data]) => (
              <div key={stage} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="capitalize">{stage}</span>
                  <span className="text-muted-foreground">{data.count} · {fmt(data.value)}</span>
                </div>
                <Bar value={data.count} max={maxLeadCount} color={STAGE_COLORS[stage] ?? "bg-slate-400"} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Tender Status Breakdown</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {tenderStatuses.length === 0 && <p className="text-sm text-muted-foreground">No tender data yet</p>}
            {tenderStatuses.map(([status, data]) => (
              <div key={status} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="capitalize">{status.replace("_", " ")}</span>
                  <span className="text-muted-foreground">{data.count} · {fmt(data.value)}</span>
                </div>
                <Bar value={data.count} max={maxTenderCount} color={STATUS_COLORS[status] ?? "bg-slate-400"} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Pre-Estimation Status</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(preEstStats?.byStatus ?? {}).map(([s, v]: any) => (
              <div key={s} className="flex justify-between text-sm">
                <span className="capitalize">{s.replace("_", " ")}</span>
                <span className="font-medium">{v.count} ({fmt(v.value)})</span>
              </div>
            ))}
            {!preEstStats?.total && <p className="text-sm text-muted-foreground">No pre-estimation data yet</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Quotation Conversion</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(quotationStats?.byStatus ?? {}).map(([s, v]: any) => (
              <div key={s} className="flex justify-between text-sm">
                <span className="capitalize">{s}</span>
                <span className="font-medium">{v.count}</span>
              </div>
            ))}
            {quotationStats?.total > 0 && <div className="pt-2 border-t text-sm font-medium">Acceptance Rate: {quotationStats?.acceptanceRate ?? 0}%</div>}
            {!quotationStats?.total && <p className="text-sm text-muted-foreground">No quotation data yet</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Quick Navigation</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "Leads", url: "/leads", icon: Target, color: "bg-blue-50 text-blue-700 border-blue-200" },
              { label: "Customers", url: "/customers", icon: Users2, color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
              { label: "Pre-Estimations", url: "/pre-estimations", icon: FileSearch, color: "bg-violet-50 text-violet-700 border-violet-200" },
              { label: "Quotations", url: "/quotations", icon: FileText, color: "bg-purple-50 text-purple-700 border-purple-200" },
              { label: "Tenders", url: "/tenders", icon: Briefcase, color: "bg-orange-50 text-orange-700 border-orange-200" },
            ].map(m => (
              <Link key={m.label} href={m.url} className={`flex flex-col items-center gap-2 p-3 rounded-xl border ${m.color} hover:shadow-sm transition-shadow no-underline`}>
                <m.icon className="h-5 w-5" />
                <span className="text-xs font-medium text-center">{m.label}</span>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
