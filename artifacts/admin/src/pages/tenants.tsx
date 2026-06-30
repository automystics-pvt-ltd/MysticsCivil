import { useState } from "react";
import { Link } from "wouter";
import { useListAdminTenants, useUpdateAdminTenantStatus, useGetAdminTenant, getListAdminTenantsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, MoreHorizontal, Power, Ban, Trash2, Building2, ChevronUp, ChevronDown, ExternalLink, Loader2, Users, FolderOpen } from "lucide-react";
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

type SortKey = "name" | "planName" | "subscriptionStatus" | "userCount" | "projectCount" | "createdAt";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 10;

function TenantDetailPane({ orgId }: { orgId: string }) {
  const { data: tenant, isLoading } = useGetAdminTenant(orgId);

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>;
  if (!tenant) return <p className="text-gray-500 text-sm">Tenant not found.</p>;

  return (
    <div className="space-y-6 mt-2">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 bg-gray-100 rounded-lg flex items-center justify-center">
          {tenant.logoUrl ? (
            <img src={tenant.logoUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
          ) : (
            <Building2 className="h-5 w-5 text-gray-400" />
          )}
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">{tenant.name}</h3>
          {tenant.legalName && <p className="text-sm text-gray-500">{tenant.legalName}</p>}
        </div>
        <Link href={`/tenants/${tenant.id}`} className="ml-auto text-blue-600 hover:text-blue-700 flex items-center gap-1 text-sm font-medium">
          Full detail <ExternalLink size={12} />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-50 rounded-lg p-4 flex items-center gap-3">
          <Users className="h-4 w-4 text-gray-400" />
          <div>
            <p className="text-2xl font-bold text-gray-900">{tenant.userCount}</p>
            <p className="text-xs text-gray-500">Active Users</p>
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4 flex items-center gap-3">
          <FolderOpen className="h-4 w-4 text-gray-400" />
          <div>
            <p className="text-2xl font-bold text-gray-900">{tenant.projectCount}</p>
            <p className="text-xs text-gray-500">Projects</p>
          </div>
        </div>
      </div>

      <div className="space-y-3 text-sm">
        <div className="flex justify-between py-2 border-b border-gray-100">
          <span className="text-gray-500">Plan</span>
          <Badge variant="outline">{tenant.planName}</Badge>
        </div>
        <div className="flex justify-between py-2 border-b border-gray-100">
          <span className="text-gray-500">Status</span>
          <Badge variant={tenant.subscriptionStatus === "active" ? "default" : "secondary"}
            className={tenant.subscriptionStatus === "active" ? "bg-green-50 text-green-700 border-green-200" : ""}>
            {tenant.subscriptionStatus}
          </Badge>
        </div>
        {tenant.city && (
          <div className="flex justify-between py-2 border-b border-gray-100">
            <span className="text-gray-500">Location</span>
            <span className="text-gray-900">{[tenant.city, tenant.state].filter(Boolean).join(", ")}</span>
          </div>
        )}
        <div className="flex justify-between py-2 border-b border-gray-100">
          <span className="text-gray-500">Created</span>
          <span className="text-gray-900">{format(parseISO(tenant.createdAt), "MMM d, yyyy")}</span>
        </div>
        {tenant.trialEndsAt && (
          <div className="flex justify-between py-2 border-b border-gray-100">
            <span className="text-gray-500">Trial ends</span>
            <span className="text-gray-900">{format(parseISO(tenant.trialEndsAt), "MMM d, yyyy")}</span>
          </div>
        )}
      </div>

      <Link href={`/tenants/${tenant.id}`}>
        <Button className="w-full" variant="outline">Manage Subscription</Button>
      </Link>
    </div>
  );
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <span className="ml-1 text-gray-300 text-xs">↕</span>;
  return sortDir === "asc" ? <ChevronUp className="inline h-3 w-3 ml-1" /> : <ChevronDown className="inline h-3 w-3 ml-1" />;
}

export default function Tenants() {
  const { data: tenants, isLoading } = useListAdminTenants();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [drawerOrgId, setDrawerOrgId] = useState<string | null>(null);
  const updateStatus = useUpdateAdminTenantStatus();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
    setPage(1);
  };

  const handleStatusChange = async (orgId: string, status: "active" | "suspended" | "deleted") => {
    try {
      await updateStatus.mutateAsync({ orgId, data: { status } });
      await queryClient.invalidateQueries({ queryKey: getListAdminTenantsQueryKey() });
      toast({ title: "Status updated", description: `Tenant status changed to ${status}.` });
    } catch (error: any) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    }
  };

  const filtered = (tenants || []).filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.planName.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    const aVal = a[sortKey] ?? "";
    const bVal = b[sortKey] ?? "";
    const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
    return sortDir === "asc" ? cmp : -cmp;
  });

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const SortHead = ({ col, label }: { col: SortKey; label: string }) => (
    <TableHead className="cursor-pointer select-none hover:bg-gray-50" onClick={() => handleSort(col)}>
      {label}<SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
    </TableHead>
  );

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Tenants</h1>
            <p className="text-gray-500 mt-1">Manage platform organisations. Click a row to inspect.</p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search tenants..."
              className="pl-9 w-64"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHead col="name" label="Organisation" />
                <SortHead col="planName" label="Plan" />
                <SortHead col="subscriptionStatus" label="Status" />
                <SortHead col="userCount" label="Users" />
                <SortHead col="projectCount" label="Projects" />
                <SortHead col="createdAt" label="Created" />
                <TableHead className="text-right">Actions</TableHead>
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
                  <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                    No tenants found matching "{search}"
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((tenant) => (
                  <TableRow
                    key={tenant.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => setDrawerOrgId(tenant.id)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 bg-gray-100 rounded flex items-center justify-center text-gray-500 flex-shrink-0">
                          {tenant.logoUrl ? (
                            <img src={tenant.logoUrl} alt="" className="h-8 w-8 rounded object-cover" />
                          ) : (
                            <Building2 size={16} />
                          )}
                        </div>
                        <div>
                          <span className="font-medium text-gray-900">{tenant.name}</span>
                          {tenant.city && <div className="text-xs text-gray-500">{tenant.city}, {tenant.state}</div>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-gray-50 text-gray-700">{tenant.planName}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={tenant.subscriptionStatus === "active" ? "default" : tenant.subscriptionStatus === "trialing" ? "secondary" : "destructive"}
                        className={tenant.subscriptionStatus === "active" ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100" : ""}
                      >
                        {tenant.subscriptionStatus.charAt(0).toUpperCase() + tenant.subscriptionStatus.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-600">{tenant.userCount}</TableCell>
                    <TableCell className="text-gray-600">{tenant.projectCount}</TableCell>
                    <TableCell className="text-gray-500 text-sm">
                      {format(parseISO(tenant.createdAt), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
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
                            <Link href={`/tenants/${tenant.id}`}>View Full Detail</Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {tenant.subscriptionStatus !== "active" && (
                            <DropdownMenuItem onClick={() => handleStatusChange(tenant.id, "active")}>
                              <Power className="h-4 w-4 mr-2 text-green-600" /> Activate
                            </DropdownMenuItem>
                          )}
                          {tenant.subscriptionStatus !== "suspended" && (
                            <DropdownMenuItem onClick={() => handleStatusChange(tenant.id, "suspended")}>
                              <Ban className="h-4 w-4 mr-2 text-amber-600" /> Suspend
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleStatusChange(tenant.id, "deleted")} className="text-red-600">
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>Page {page} of {totalPages} ({sorted.length} tenants)</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
            </div>
          </div>
        )}
      </div>

      <Sheet open={!!drawerOrgId} onOpenChange={open => !open && setDrawerOrgId(null)}>
        <SheetContent className="w-[400px] sm:max-w-[400px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Tenant Details</SheetTitle>
          </SheetHeader>
          {drawerOrgId && <TenantDetailPane orgId={drawerOrgId} />}
        </SheetContent>
      </Sheet>
    </Layout>
  );
}
