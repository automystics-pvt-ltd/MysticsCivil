import { Link } from "wouter";
import { CheckCircle2, Circle, ArrowRight, Clock, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type JourneyChain = {
  lead?: { id: string; title: string; stage: string } | null;
  customer?: { id: string; name: string } | null;
  preEstimation?: { id: string; title: string; status: string } | null;
  quotation?: { id: string; title: string; status: string } | null;
  tender?: { id: string; title: string; status: string } | null;
  project?: { id: string; name: string; status: string } | null;
};

const STEPS = [
  { key: "lead", label: "Lead", url: (id: string) => `/leads`, color: "bg-blue-500" },
  { key: "customer", label: "Customer", url: (id: string) => `/customers`, color: "bg-indigo-500" },
  { key: "preEstimation", label: "Pre-Estimation", url: (id: string) => `/pre-estimations`, color: "bg-violet-500" },
  { key: "quotation", label: "Quotation", url: (id: string) => `/quotations`, color: "bg-purple-500" },
  { key: "tender", label: "Tender", url: (id: string) => `/tenders`, color: "bg-orange-500" },
  { key: "project", label: "Project", url: (id: string) => `/projects/${id}`, color: "bg-emerald-500" },
] as const;

function statusIcon(key: string, entity: any) {
  if (!entity) return <Circle className="h-5 w-5 text-muted-foreground/40" />;
  const s = entity.stage ?? entity.status ?? "";
  if (["lost", "rejected", "cancelled", "expired"].includes(s)) return <XCircle className="h-5 w-5 text-red-400" />;
  if (["won", "approved", "accepted", "completed", "not_started"].includes(s)) return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
  return <Clock className="h-5 w-5 text-amber-500" />;
}

function entityName(key: string, entity: any): string {
  if (!entity) return "";
  return entity.title ?? entity.name ?? "";
}

export function LifecycleJourney({ chain, currentKey }: { chain: JourneyChain; currentKey?: string }) {
  const filled = STEPS.filter(s => !!(chain as any)[s.key]).length;
  const pct = Math.round((filled / STEPS.length) * 100);

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lifecycle Journey</p>
        <span className="text-xs font-medium text-muted-foreground">{pct}% complete</span>
      </div>
      <div className="w-full bg-muted rounded-full h-1.5">
        <div className="h-1.5 rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {STEPS.map((step, i) => {
          const entity = (chain as any)[step.key];
          const isCurrent = step.key === currentKey;
          const name = entityName(step.key, entity);
          return (
            <div key={step.key} className="flex items-center gap-1 flex-shrink-0">
              <div className={`flex flex-col items-center gap-1 min-w-[80px] ${isCurrent ? "opacity-100" : entity ? "opacity-90" : "opacity-40"}`}>
                <div className={`h-8 w-8 rounded-full flex items-center justify-center ${entity ? step.color : "bg-muted"} ${isCurrent ? "ring-2 ring-offset-1 ring-primary" : ""}`}>
                  {entity
                    ? <CheckCircle2 className="h-4 w-4 text-white" />
                    : <Circle className="h-4 w-4 text-muted-foreground/60" />
                  }
                </div>
                <span className="text-[10px] font-medium text-center text-muted-foreground leading-tight">{step.label}</span>
                {entity && name && (
                  step.key === "project" && entity.id
                    ? <Link href={`/projects/${entity.id}`} className="text-[9px] text-primary underline truncate max-w-[76px] text-center">{name}</Link>
                    : <span className="text-[9px] text-foreground/70 truncate max-w-[76px] text-center">{name}</span>
                )}
              </div>
              {i < STEPS.length - 1 && (
                <ArrowRight className={`h-3 w-3 flex-shrink-0 ${entity ? "text-emerald-500" : "text-muted-foreground/30"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
