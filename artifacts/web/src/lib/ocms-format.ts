export function formatINR(value: number): string {
  if (Math.abs(value) >= 10_000_000) return `₹${(value / 10_000_000).toFixed(2)} Cr`;
  if (Math.abs(value) >= 100_000) return `₹${(value / 100_000).toFixed(2)} L`;
  if (Math.abs(value) >= 1_000) return `₹${(value / 1_000).toFixed(1)} K`;
  return `₹${value.toFixed(0)}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export const STATUS_COLORS: Record<string, string> = {
  not_started: "bg-slate-200 text-slate-700 border-slate-300",
  on_track: "bg-emerald-100 text-emerald-800 border-emerald-300",
  at_risk: "bg-amber-100 text-amber-800 border-amber-300",
  delayed: "bg-rose-100 text-rose-800 border-rose-300",
  on_hold: "bg-slate-300 text-slate-800 border-slate-400",
  completed: "bg-blue-100 text-blue-800 border-blue-300",
  pending: "bg-slate-200 text-slate-700 border-slate-300",
  draft: "bg-slate-200 text-slate-700 border-slate-300",
  submitted: "bg-amber-100 text-amber-800 border-amber-300",
  approved: "bg-emerald-100 text-emerald-800 border-emerald-300",
  rejected: "bg-rose-100 text-rose-800 border-rose-300",
  open: "bg-rose-100 text-rose-800 border-rose-300",
  in_progress: "bg-amber-100 text-amber-800 border-amber-300",
  resolved: "bg-emerald-100 text-emerald-800 border-emerald-300",
  closed: "bg-slate-200 text-slate-700 border-slate-300",
  low: "bg-slate-200 text-slate-700 border-slate-300",
  medium: "bg-amber-100 text-amber-800 border-amber-300",
  high: "bg-orange-100 text-orange-800 border-orange-300",
  critical: "bg-rose-100 text-rose-800 border-rose-300",
};

export function statusBadgeClass(status: string): string {
  return STATUS_COLORS[status] || "bg-slate-100 text-slate-700 border-slate-200";
}
