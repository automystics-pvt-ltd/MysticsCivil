import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/components/auth-provider";
import NotFound from "@/pages/not-found";

import Dashboard from "@/pages/dashboard";
import Tenants from "@/pages/tenants";
import TenantDetail from "@/pages/tenant-detail";
import Subscriptions from "@/pages/subscriptions";
import Invitations from "@/pages/invitations";
import CustomRoles from "@/pages/custom-roles";
import SettingsPayment from "@/pages/settings-payment";
import Login from "@/pages/login";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/">
        <AuthProvider>
          <Dashboard />
        </AuthProvider>
      </Route>
      <Route path="/tenants">
        <AuthProvider>
          <Tenants />
        </AuthProvider>
      </Route>
      <Route path="/tenants/:orgId">
        <AuthProvider>
          <TenantDetail />
        </AuthProvider>
      </Route>
      <Route path="/subscriptions">
        <AuthProvider>
          <Subscriptions />
        </AuthProvider>
      </Route>
      <Route path="/invitations">
        <AuthProvider>
          <Invitations />
        </AuthProvider>
      </Route>
      <Route path="/custom-roles">
        <AuthProvider>
          <CustomRoles />
        </AuthProvider>
      </Route>
      <Route path="/settings/payment-gateway">
        <AuthProvider>
          <SettingsPayment />
        </AuthProvider>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
