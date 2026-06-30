import { useListAdminInvitations, useListAdminCustomRoles } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format, parseISO } from "date-fns";
import { Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Invitations() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  
  const { data: invitations, isLoading } = useListAdminInvitations({ 
    params: statusFilter !== "all" ? { status: statusFilter as any } : {} 
  });

  const filteredInvs = invitations?.filter(i => 
    i.email.toLowerCase().includes(search.toLowerCase()) ||
    i.orgName.toLowerCase().includes(search.toLowerCase())
  ) || [];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Invitations</h1>
            <p className="text-gray-500 mt-1">Cross-tenant view of user invites.</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by email or organisation..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="revoked">Revoked</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Organisation</TableHead>
                <TableHead>Role Assigned</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sent On</TableHead>
                <TableHead>Action Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  </TableRow>
                ))
              ) : filteredInvs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                    No invitations found
                  </TableCell>
                </TableRow>
              ) : (
                filteredInvs.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium text-gray-900">{inv.email}</TableCell>
                    <TableCell className="text-gray-600">{inv.orgName}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{inv.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="secondary"
                        className={
                          inv.status === 'accepted' ? 'bg-green-50 text-green-700' :
                          inv.status === 'pending' ? 'bg-amber-50 text-amber-700' :
                          'bg-gray-100 text-gray-600'
                        }
                      >
                        {inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-500 text-sm">
                      {format(parseISO(inv.createdAt), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-gray-500 text-sm">
                      {inv.acceptedAt ? format(parseISO(inv.acceptedAt), 'MMM d, yyyy') : 
                       inv.revokedAt ? 'Revoked' : 
                       inv.status === 'expired' ? 'Expired' : '-'}
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
