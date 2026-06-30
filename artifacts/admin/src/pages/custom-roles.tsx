import { useListAdminCustomRoles } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format, parseISO } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

export default function CustomRoles() {
  const { data: roles, isLoading } = useListAdminCustomRoles();

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Custom Roles</h1>
            <p className="text-gray-500 mt-1">Tenant-defined RBAC roles across the platform.</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role Name</TableHead>
                <TableHead>Organisation</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(4)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  </TableRow>
                ))
              ) : roles?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                    No custom roles defined across any tenant.
                  </TableCell>
                </TableRow>
              ) : (
                roles?.map((role) => {
                  const permCount = Array.isArray(role.permissions) ? role.permissions.length : 0;
                  return (
                    <TableRow key={role.id}>
                      <TableCell className="font-medium text-gray-900">{role.name}</TableCell>
                      <TableCell className="text-gray-600">{role.orgName}</TableCell>
                      <TableCell className="text-gray-500 max-w-[300px] truncate">
                        {role.description || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{permCount} caps</Badge>
                      </TableCell>
                      <TableCell className="text-gray-500 text-sm">
                        {format(parseISO(role.createdAt), 'MMM d, yyyy')}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </Layout>
  );
}
