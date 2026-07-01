import { useGetAdminTenant, useGetAdminTenantSubscription, useUpdateAdminTenantSubscription, getGetAdminTenantSubscriptionQueryKey, getGetAdminTenantQueryKey, getListAdminTenantsQueryKey } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Building2, ArrowLeft, Loader2, Save, Tag, X, CheckCircle2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { useEffect, useRef, useState } from "react";

const subscriptionSchema = z.object({
  planId: z.string().optional(),
  status: z.enum(["active", "trialing", "suspended", "cancelled"]),
  trialEndsAt: z.string().optional().nullable(),
  limitsOverride: z.object({
    maxProjects: z.coerce.number().optional(),
    maxUsers: z.coerce.number().optional(),
    maxStorageGb: z.coerce.number().optional()
  }).optional()
});

interface CustomPricingRow {
  planId: string;
  planName: string;
  planSlug: string;
  standardPrice: string;
  customPriceMonthly: string | null;
  note: string | null;
  hasCustomPrice: boolean;
}

function CustomPricingCard({ orgId }: { orgId: string }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<CustomPricingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, { price: string; note: string }>>({});

  async function loadPricing() {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/tenants/${orgId}/custom-pricing`);
      if (!r.ok) throw new Error("Failed to load");
      const data: CustomPricingRow[] = await r.json();
      setRows(data);
      const init: Record<string, { price: string; note: string }> = {};
      data.forEach((row) => {
        init[row.planId] = {
          price: row.customPriceMonthly ?? "",
          note: row.note ?? "",
        };
      });
      setEdits(init);
    } catch {
      toast({ title: "Error", description: "Failed to load custom pricing", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadPricing(); }, [orgId]);

  async function handleSave(planId: string) {
    const edit = edits[planId];
    if (!edit) return;
    const price = Number(edit.price);
    if (isNaN(price) || price < 0) {
      toast({ title: "Invalid price", description: "Enter a valid non-negative number.", variant: "destructive" });
      return;
    }
    setSaving(planId);
    try {
      const r = await fetch(`/api/admin/tenants/${orgId}/custom-pricing/${planId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customPriceMonthly: price, note: edit.note || null }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed to save");
      await loadPricing();
      toast({ title: "Saved", description: "Custom price updated." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  }

  async function handleRemove(planId: string) {
    setSaving(planId);
    try {
      const r = await fetch(`/api/admin/tenants/${orgId}/custom-pricing/${planId}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed to remove");
      await loadPricing();
      toast({ title: "Removed", description: "Reverted to standard price." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  }

  const paidPlans = rows.filter((r) => Number(r.standardPrice ?? 0) > 0);

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-blue-600" />
          <CardTitle className="text-base">Custom Pricing</CardTitle>
        </div>
        <CardDescription>
          Override plan prices for this tenant. Leave blank to use the standard plan price.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : paidPlans.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">No paid plans configured in the platform yet.</p>
        ) : (
          <div className="space-y-4">
            {paidPlans.map((row, i) => {
              const edit = edits[row.planId] ?? { price: "", note: "" };
              const isSavingThis = saving === row.planId;
              const isDirty = edit.price !== (row.customPriceMonthly ?? "") || edit.note !== (row.note ?? "");
              return (
                <div key={row.planId}>
                  {i > 0 && <Separator className="mb-4" />}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{row.planName}</span>
                        {row.hasCustomPrice && (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Custom price active
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">Standard: ₹{Number(row.standardPrice).toLocaleString("en-IN")}/mo</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Custom price (₹/mo)</label>
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          placeholder={`Standard: ₹${Number(row.standardPrice).toLocaleString("en-IN")}`}
                          value={edit.price}
                          onChange={(e) => setEdits((prev) => ({ ...prev, [row.planId]: { ...edit, price: e.target.value } }))}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Note (optional)</label>
                        <Input
                          placeholder="e.g. Annual deal, Partner rate"
                          value={edit.note}
                          onChange={(e) => setEdits((prev) => ({ ...prev, [row.planId]: { ...edit, note: e.target.value } }))}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={isDirty ? "default" : "outline"}
                        disabled={isSavingThis || !edit.price}
                        onClick={() => handleSave(row.planId)}
                        className="h-7 text-xs gap-1"
                      >
                        {isSavingThis ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        Save price
                      </Button>
                      {row.hasCustomPrice && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isSavingThis}
                          onClick={() => handleRemove(row.planId)}
                          className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                          Revert to standard
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function TenantDetail() {
  const params = useParams();
  const orgId = params.orgId || "";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: tenant, isLoading: loadingTenant } = useGetAdminTenant(orgId);
  const { data: subscription, isLoading: loadingSub } = useGetAdminTenantSubscription(orgId);
  const updateSub = useUpdateAdminTenantSubscription();

  const form = useForm<z.infer<typeof subscriptionSchema>>({
    resolver: zodResolver(subscriptionSchema),
    defaultValues: {
      planId: undefined,
      status: "active",
      trialEndsAt: null,
      limitsOverride: { maxProjects: 0, maxUsers: 0, maxStorageGb: 0 }
    }
  });

  const initializedRef = useRef(false);

  useEffect(() => {
    if (subscription && !initializedRef.current) {
      form.reset({
        planId: subscription.planId,
        status: subscription.status as any,
        trialEndsAt: subscription.trialEndsAt ? subscription.trialEndsAt.split('T')[0] : null,
        limitsOverride: {
          maxProjects: subscription.limitsOverride?.maxProjects || subscription.limits.maxProjects || 0,
          maxUsers: subscription.limitsOverride?.maxUsers || subscription.limits.maxUsers || 0,
          maxStorageGb: subscription.limitsOverride?.maxStorageGb || subscription.limits.maxStorageGb || 0
        }
      });
      initializedRef.current = true;
    }
  }, [subscription, form]);

  const onSubmit = async (data: z.infer<typeof subscriptionSchema>) => {
    try {
      const payload = {
        status: data.status,
        planId: data.planId,
        trialEndsAt: data.trialEndsAt ? new Date(data.trialEndsAt).toISOString() : undefined,
        limitsOverride: {
          maxProjects: Number(data.limitsOverride?.maxProjects),
          maxUsers: Number(data.limitsOverride?.maxUsers),
          maxStorageGb: Number(data.limitsOverride?.maxStorageGb)
        }
      };

      await updateSub.mutateAsync({ orgId, data: payload });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetAdminTenantSubscriptionQueryKey(orgId) }),
        queryClient.invalidateQueries({ queryKey: getGetAdminTenantQueryKey(orgId) }),
        queryClient.invalidateQueries({ queryKey: getListAdminTenantsQueryKey() })
      ]);
      toast({ title: "Subscription updated", description: "The tenant's subscription configuration has been saved." });
    } catch (error: any) {
      toast({ title: "Failed to update", description: error.message || "An error occurred while saving.", variant: "destructive" });
    }
  };

  if (loadingTenant || loadingSub) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </Layout>
    );
  }

  if (!tenant || !subscription) {
    return (
      <Layout>
        <div className="text-center py-20 text-gray-500">Tenant not found.</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" asChild>
            <Link href="/tenants">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-white border border-gray-200 rounded-lg flex items-center justify-center overflow-hidden">
              {tenant.logoUrl ? (
                <img src={tenant.logoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <Building2 className="h-5 w-5 text-gray-400" />
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight leading-none">{tenant.name}</h1>
              <p className="text-sm text-gray-500 mt-1">
                {tenant.legalName || "No legal name"} • ID: {tenant.id}
              </p>
            </div>
          </div>
          <div className="ml-auto flex gap-2">
            <Badge variant="outline" className="text-gray-600 bg-white">
              Created {format(parseISO(tenant.createdAt), 'MMM d, yyyy')}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 space-y-6">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Tenant Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">Location</div>
                  <div className="text-sm text-gray-900">
                    {[tenant.city, tenant.state].filter(Boolean).join(', ') || "Not specified"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">Current Usage</div>
                  <div className="text-sm text-gray-900 flex justify-between border-b pb-2 mb-2">
                    <span>Active Users</span>
                    <span className="font-medium">{tenant.userCount} / {subscription.limitsOverride?.maxUsers || subscription.limits.maxUsers || "∞"}</span>
                  </div>
                  <div className="text-sm text-gray-900 flex justify-between">
                    <span>Projects</span>
                    <span className="font-medium">{tenant.projectCount} / {subscription.limitsOverride?.maxProjects || subscription.limits.maxProjects || "∞"}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="md:col-span-2 space-y-6">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Subscription Configuration</CardTitle>
                <CardDescription>
                  Modify plan, status, and manual limit overrides for this tenant.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="planId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Plan</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select a plan" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {subscription.availablePlans?.map(p => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {p.name} (₹{Number(p.priceMonthly).toLocaleString("en-IN")}/mo)
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="status"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Status</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="trialing">Trialing</SelectItem>
                                <SelectItem value="suspended">Suspended</SelectItem>
                                <SelectItem value="cancelled">Cancelled</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="trialEndsAt"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Trial Ends At</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} value={field.value || ''} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="pt-4 border-t border-gray-100">
                      <h4 className="font-medium text-gray-900 mb-4">Limit Overrides</h4>
                      <div className="grid grid-cols-3 gap-4">
                        <FormField
                          control={form.control}
                          name="limitsOverride.maxUsers"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Max Users</FormLabel>
                              <FormControl>
                                <Input type="number" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="limitsOverride.maxProjects"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Max Projects</FormLabel>
                              <FormControl>
                                <Input type="number" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="limitsOverride.maxStorageGb"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Storage (GB)</FormLabel>
                              <FormControl>
                                <Input type="number" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    <div className="pt-4 flex justify-end">
                      <Button type="submit" disabled={updateSub.isPending}>
                        {updateSub.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Save Changes
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>

            <CustomPricingCard orgId={orgId} />
          </div>
        </div>
      </div>
    </Layout>
  );
}
