import { useParams, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetDpr,
  useSubmitDpr,
  useApproveDpr,
  useGetMyProfile,
  getGetDprQueryKey,
  getListApprovalsQueryKey,
  getGetProjectDashboardQueryKey,
  getListProjectWbsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Send, Check, X, CloudSun, Users, Thermometer } from "lucide-react";
import { statusBadgeClass, formatDate } from "@/lib/ocms-format";

export default function DprDetail() {
  const params = useParams();
  const id = params.id as string;
  const qc = useQueryClient();

  const { data, isLoading } = useGetDpr(id, {
    query: { enabled: !!id, queryKey: getGetDprQueryKey(id) },
  });
  const { data: profile } = useGetMyProfile();
  const submit = useSubmitDpr();
  const approve = useApproveDpr();

  if (isLoading || !data) {
    return <div className="text-sm text-muted-foreground">Loading DPR…</div>;
  }

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getGetDprQueryKey(id) });
    qc.invalidateQueries({ queryKey: getListApprovalsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetProjectDashboardQueryKey(data.dpr.projectId) });
    qc.invalidateQueries({ queryKey: getListProjectWbsQueryKey(data.dpr.projectId) });
  };

  const { dpr, items, photos, submittedBy, approvedBy } = data;
  const canSubmit = dpr.status === "draft";
  const canApprove = dpr.status === "submitted" && (profile?.role === "pm" || profile?.role === "owner");

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-4">
        <Link href={`/projects/${dpr.projectId}`} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">DPR · {formatDate(dpr.reportDate)}</h1>
            <span className={`text-xs px-2 py-1 rounded border ${statusBadgeClass(dpr.status)}`}>{dpr.status}</span>
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            {submittedBy && <span>Submitted by {[submittedBy.firstName, submittedBy.lastName].filter(Boolean).join(" ") || submittedBy.email} · </span>}
            {approvedBy && <span>Approved by {[approvedBy.firstName, approvedBy.lastName].filter(Boolean).join(" ") || approvedBy.email}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          {canSubmit && (
            <Button size="sm" onClick={() => submit.mutate({ dprId: id }, { onSuccess: invalidate })} disabled={submit.isPending}>
              <Send className="h-4 w-4 mr-1" /> Submit for Approval
            </Button>
          )}
          {canApprove && (
            <>
              <Button size="sm" variant="outline" onClick={() => approve.mutate({ dprId: id, data: { approve: false, rejectionReason: "Insufficient data" } }, { onSuccess: invalidate })}>
                <X className="h-4 w-4 mr-1" /> Reject
              </Button>
              <Button size="sm" onClick={() => approve.mutate({ dprId: id, data: { approve: true } }, { onSuccess: invalidate })}>
                <Check className="h-4 w-4 mr-1" /> Approve
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <CloudSun className="h-8 w-8 text-amber-500" />
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Weather</div>
              <div className="font-semibold">{dpr.weather || "—"}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <Thermometer className="h-8 w-8 text-rose-500" />
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Temperature</div>
              <div className="font-semibold">{dpr.temperature ?? "—"}°C</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <Users className="h-8 w-8 text-primary" />
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Manpower</div>
              <div className="font-semibold">{dpr.manpowerCount} workers</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {dpr.summary && (
        <Card>
          <CardHeader><CardTitle className="text-base">Site Summary</CardTitle></CardHeader>
          <CardContent><p className="text-sm whitespace-pre-wrap">{dpr.summary}</p></CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Activity Quantities</CardTitle></CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">No quantity line items recorded.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground border-b">
                <tr><th className="text-left py-2">Activity</th><th className="text-right py-2">Quantity Today</th><th className="text-left py-2 pl-4">Remarks</th></tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{it.activityName}</td>
                    <td className="py-2 text-right tabular-nums">{it.quantityToday.toLocaleString()}</td>
                    <td className="py-2 pl-4 text-muted-foreground">{it.remarks || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {photos.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Photos</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {photos.map((p) => (
                <div key={p.id} className="aspect-video rounded-md overflow-hidden bg-muted">
                  <img src={p.url} alt={p.caption ?? ""} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {dpr.rejectionReason && (
        <Card className="border-rose-200">
          <CardHeader><CardTitle className="text-base text-rose-700">Rejection Reason</CardTitle></CardHeader>
          <CardContent><p className="text-sm">{dpr.rejectionReason}</p></CardContent>
        </Card>
      )}
    </div>
  );
}
