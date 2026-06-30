import { createContext, useContext, useEffect, ReactNode } from "react";
import { useLocation } from "wouter";
import { useGetCurrentAuthUser, AuthUser } from "@workspace/api-client-react";
import { Loader2, ShieldOff } from "lucide-react";

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, isLoading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: authEnvelope, isLoading } = useGetCurrentAuthUser();
  const [, setLocation] = useLocation();

  const user = authEnvelope?.user || null;
  const isSuperAdmin = user?.globalRole === "super_admin";

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/login");
    }
  }, [user, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  if (user && !isSuperAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-3 max-w-sm">
          <ShieldOff className="h-12 w-12 text-gray-400 mx-auto" />
          <h1 className="text-2xl font-semibold text-gray-900">Access Denied</h1>
          <p className="text-gray-500">This portal is restricted to platform super-admins. Sign in with an account that has super_admin privileges.</p>
          <button
            onClick={() => setLocation("/login")}
            className="text-sm text-blue-600 hover:underline"
          >
            Sign in with a different account
          </button>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
