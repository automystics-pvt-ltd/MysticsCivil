import { Link, useLocation } from "wouter";
import { 
  Building2, 
  LayoutDashboard, 
  Users, 
  Mail, 
  LogOut,
  Settings,
  CreditCard,
} from "lucide-react";
import { useLogoutUser, useGetCurrentAuthUser, getGetCurrentAuthUserQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tenants", label: "Tenants", icon: Building2 },
  { href: "/subscriptions", label: "Subscriptions", icon: CreditCard },
  { href: "/invitations", label: "Invitations", icon: Mail },
  { href: "/custom-roles", label: "Custom Roles", icon: Settings },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const logout = useLogoutUser();
  const queryClient = useQueryClient();
  const { data: authEnvelope } = useGetCurrentAuthUser();

  const handleLogout = async () => {
    await logout.mutateAsync({});
    queryClient.invalidateQueries({ queryKey: getGetCurrentAuthUserQueryKey() });
    setLocation("/login");
  };

  return (
    <div className="min-h-screen flex bg-gray-50/50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col fixed inset-y-0 left-0 z-10">
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <div className="flex items-center gap-2 font-semibold text-gray-900">
            <div className="h-8 w-8 bg-blue-600 rounded-md flex items-center justify-center text-white">
              <Building2 size={18} />
            </div>
            <span>Platform Admin</span>
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-blue-50 text-blue-700" 
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                )}
              >
                <Icon size={18} className={isActive ? "text-blue-700" : "text-gray-400"} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 font-medium">
                {authEnvelope?.user?.firstName?.[0] || 'A'}
              </div>
              <div className="text-sm">
                <p className="font-medium text-gray-900 truncate w-24">
                  {authEnvelope?.user?.firstName || 'Admin'}
                </p>
                <p className="text-gray-500 text-xs truncate w-24">
                  {authEnvelope?.user?.email}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout} className="text-gray-500 hover:text-gray-900">
              <LogOut size={18} />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 pl-64">
        <div className="max-w-6xl mx-auto p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
