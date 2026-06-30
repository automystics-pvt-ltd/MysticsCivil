import { useState } from "react";
import { Link } from "wouter";
import { useListAdminTenants, useGetAdminTenantSubscription, useUpdateAdminTenantSubscription, getListAdminTenantsQueryKey, getGetAdminTenantSubscriptionQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, ExternalLink, Loader2, Save } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useEffect } from "react";

const subSchema = z.object({
  planId: z.string().optional(),
  status: z.enum(["active", "trialing", "suspended", "cancelled"]),
  trialEndsAt: z.string().optional().nullable(),
  limitsOverride: z.object({
    maxProjects: z.coerce.number().optional(),
    maxUsers: z.coerce.number().optional(),
    maxStorageGb: z.coerce.number().optional(),
  }).optional(),
});

function SubscriptionEditor({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const { data: subscription, isLoading } = useGetAdminTenantSubscription(orgId);
  const updateSub = useUpdateAdminTenantSubscription();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof subSchema>>({
    resolver: zodResolver(subSchema),
    defaultValues: { status: "active", trialEndsAt: null, limitsOverride: { maxProjects: 0, maxUsers: 0, maxStorageGb: 0 } },
  });

  useEffect(() => {
    if (subscription) {
      form.reset({
        planId: subscription.planId,
        status: subscription.status as any,
        trialEndsAt: subscription.trialEndsAt ? subscription.trialEndsAt.split("T")[0] : null,
        limitsOverride: {
          maxProjects: subscription.limitsOverride?.maxProjects || (subscription.limits as any)?.maxProjects || 0,
          maxUsers: subscription.limitsOverride?.maxUsers || (subscription.limits as any)?.maxUsers || 0,
          maxStorageGb: subscription.limitsOverride?.maxStorageGb || (subscription.limits as any)?.maxStorageGb || 0,
        },
      });
    }
  }, [subscription]);

  const onSubmit = async (data: z.infer<typeof subSchema>) => {
    try {
      await updateSub.mutateAsync({
        orgId,
        data: {
          planId: data.planId,
          status: data.status,
          trialEndsAt: data.trialEndsAt ? new Date(data.trialEndsAt).toISOString() : undefined,
          limitsOverride: {
            maxProjects: Number(data.limitsOverride?.maxProjects),
            maxUsers: Number(data.limitsOverride?.maxUsers),
            maxStorageGb: Number(data.limitsOverride?.maxStorageGb),
          },
        },
      });
      await queryClient.invalidateQueries({ queryKey: getGetAdminTenantSubscriptionQueryKey(orgId) });
      await queryClient.invalidateQueries({ queryKey: getListAdminTenantsQueryKey() });
      toast({ title: "Subscription updated" });
      onClose();
    } catch (error: any) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    }
  };

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>;
  if (!subscription) return <p className="text-gray-500 text-sm">No subscription found.</p>;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 mt-2">
        <div className="grid grid-cols-2 gap-4">
          <FormField control={form.control} name="planId" render={({ field }) => (
            <FormItem>
              <FormLabel>Plan</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl><SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger></FormControl>
                <SelectContent>
                  {subscription.availablePlans?.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name} (${p.priceMonthly}/mo)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="status" render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="trialing">Trialing</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
        </div>
        <FormField control={form.control} name="trialEndsAt" render={({ field }) => (
          <FormItem>
            <FormLabel>Trial Ends At</FormLabel>
            <FormControl><Input type="date" {...field} value={field.value || ""} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <div>
          <p className="text-sm font-medium text-gray-700 mb-3">Limit Overrides</p>
          <div className="grid grid-cols-3 gap-3">
            <FormField control={form.control} name="limitsOverride.maxUsers" render={({ field }) => (
              <FormItem><FormLabel>Max Users</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="limitsOverride.maxProjects" render={({ field }) => (
              <FormItem><FormLabel>Max Projects</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="limitsOverride.maxStorageGb" render={({ field }) => (
              <FormItem><FormLabel>Storage (GB)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
          </div>
        </div>
        <div className="pt-3 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={updateSub.isPending}>
            {updateSub.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save
          </Button>
        </div>
      </form>
    </Form>
  );
}

const PAGE_SIZE = 10;

export default function Subscriptions() {
  const { data: tenants, isLoading } = useListAdminTenants();
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  const filtered = (tenants || []).filter(t => {
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase());
    const matchPlan = planFilter === "all" || t.planName === planFilter;
    return matchSearch && matchPlan;
  });

  const plans = [...new Set((tenants || []).map(t => t.planName))];
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Subscriptions</h1>
          <p className="text-gray-500 mt-1">Assign plans and configure subscription limits per tenant.</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder="Search tenants..." className="pl-9" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <Select value={planFilter} onValueChange={v => { setPlanFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="All plans" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Plans</SelectItem>
              {plans.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organisation</TableHead>
                <TableHead>Current Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Users</TableHead>
                <TableHead className="text-right">Projects</TableHead>
                <TableHead>Trial Ends</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(7)].map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}
                  </TableRow>
                ))
              ) : paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-gray-500">No tenants found</TableCell>
                </TableRow>
              ) : (
                paginated.map(tenant => (
                  <TableRow key={tenant.id}>
                    <TableCell className="font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        {tenant.name}
                        <Link href={`/tenants/${tenant.id}`} className="text-gray-400 hover:text-blue-600">
                          <ExternalLink size={12} />
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-gray-50 text-gray-700">{tenant.planName}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={tenant.subscriptionStatus === "active" ? "default" : tenant.subscriptionStatus === "trialing" ? "secondary" : "destructive"}
                        className={tenant.subscriptionStatus === "active" ? "bg-green-50 text-green-700 border-green-200" : ""}
                      >
                        {tenant.subscriptionStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-gray-600">{tenant.userCount}</TableCell>
                    <TableCell className="text-right text-gray-600">{tenant.projectCount}</TableCell>
                    <TableCell className="text-gray-500 text-sm">
                      {tenant.trialEndsAt ? format(parseISO(tenant.trialEndsAt), "MMM d, yyyy") : "—"}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => setSelectedOrgId(tenant.id)}>
                        Edit Plan
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>Page {page} of {totalPages} ({filtered.length} tenants)</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
            </div>
          </div>
        )}
      </div>

      <Sheet open={!!selectedOrgId} onOpenChange={open => !open && setSelectedOrgId(null)}>
        <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit Subscription</SheetTitle>
            <p className="text-sm text-gray-500">
              {tenants?.find(t => t.id === selectedOrgId)?.name}
            </p>
          </SheetHeader>
          {selectedOrgId && (
            <SubscriptionEditor orgId={selectedOrgId} onClose={() => setSelectedOrgId(null)} />
          )}
        </SheetContent>
      </Sheet>
    </Layout>
  );
}
