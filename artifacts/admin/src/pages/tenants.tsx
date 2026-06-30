import { useState } from "react";
import { Link } from "wouter";
import { useListAdminTenants, useUpdateAdminTenantStatus, getListAdminTenantsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, MoreHorizontal, Power, Ban, Trash2, Building2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

export default function Tenants() {
  const { data: tenants, isLoading } = useListAdminTenants();
  const [search, setSearch] = useState("");
  const updateStatus = useUpdateAdminTenantStatus();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleStatusChange = async (orgId: string, status: 'active' | 'suspended' | 'cancelled') => {
    try {
      await updateStatus.mutateAsync({ orgId, data: { status } });
      await queryClient.invalidateQueries({ queryKey: getListAdminTenantsQueryKey() });
      toast({
        title: "Status updated",
        description: `Tenant status has been changed to ${status}.`,
      });
    } catch (error: any) {
      toast({
        title: "Update failed",
        description: error.message || "Failed to update tenant status",
        variant: "destructive",
      });
    }
  };

  const filteredTenants = tenants?.filter(t => 
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.planName.toLowerCase().includes(search.toLowerCase())
  ) || [];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Tenants</h1>
            <p className="text-gray-500 mt-1">Manage platform organisations and subscriptions.</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search tenants..."
                className="pl-9 w-64"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organisation</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Users</TableHead>
                <TableHead className="text-right">Projects</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-8 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-8 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : filteredTenants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                    No tenants found matching "{search}"
                  </TableCell>
                </TableRow>
              ) : (
                filteredTenants.map((tenant) => (
                  <TableRow key={tenant.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 bg-gray-100 rounded flex items-center justify-center text-gray-500">
                          {tenant.logoUrl ? (
                            <img src={tenant.logoUrl} alt="" className="h-8 w-8 rounded object-cover" />
                          ) : (
                            <Building2 size={16} />
                          )}
                        </div>
                        <div>
                          <Link href={`/tenants/${tenant.id}`} className="font-medium text-gray-900 hover:text-blue-600 transition-colors">
                            {tenant.name}
                          </Link>
                          {tenant.city && <div className="text-xs text-gray-500">{tenant.city}, {tenant.state}</div>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-gray-50 text-gray-700">
                        {tenant.planName}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={tenant.subscriptionStatus === 'active' ? 'default' : 
                                tenant.subscriptionStatus === 'trialing' ? 'secondary' :
                                'destructive'}
                        className={tenant.subscriptionStatus === 'active' ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : ''}
                      >
                        {tenant.subscriptionStatus.charAt(0).toUpperCase() + tenant.subscriptionStatus.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-gray-600">{tenant.userCount}</TableCell>
                    <TableCell className="text-right text-gray-600">{tenant.projectCount}</TableCell>
                    <TableCell className="text-gray-500 text-sm">
                      {format(parseISO(tenant.createdAt), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Open menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem asChild>
                            <Link href={`/tenants/${tenant.id}`}>View Details</Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {tenant.subscriptionStatus !== 'active' && (
                            <DropdownMenuItem onClick={() => handleStatusChange(tenant.id, 'active')}>
                              <Power className="h-4 w-4 mr-2 text-green-600" /> Activate
                            </DropdownMenuItem>
                          )}
                          {tenant.subscriptionStatus !== 'suspended' && (
                            <DropdownMenuItem onClick={() => handleStatusChange(tenant.id, 'suspended')}>
                              <Ban className="h-4 w-4 mr-2 text-amber-600" /> Suspend
                            </DropdownMenuItem>
                          )}
                          {tenant.subscriptionStatus !== 'cancelled' && (
                            <DropdownMenuItem onClick={() => handleStatusChange(tenant.id, 'cancelled')} className="text-red-600">
                              <Trash2 className="h-4 w-4 mr-2" /> Cancel
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </Layout>
  );
}
