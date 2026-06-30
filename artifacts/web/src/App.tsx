import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@workspace/replit-auth-web";
import { Layout } from "@/components/layout";
import { I18nProvider } from "@/lib/i18n";

import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Projects from "@/pages/projects";
import ProjectNew from "@/pages/project-new";
import ProjectDetail from "@/pages/project-detail";
import DprDetail from "@/pages/dpr-detail";
import Approvals from "@/pages/approvals";
import Reports from "@/pages/reports";
import Analytics from "@/pages/analytics";
import Leads from "@/pages/leads";
import Customers from "@/pages/customers";
import PreEstimations from "@/pages/pre-estimations";
import Quotations from "@/pages/quotations";
import Tenders from "@/pages/tenders";
import Organisations from "@/pages/organisations";
import Profile from "@/pages/profile";
import Admin from "@/pages/admin";
import DsrRates from "@/pages/dsr-rates";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component, ...rest }: any) {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [isAuthenticated, isLoading, setLocation]);

  if (isLoading || !isAuthenticated) {
    return <div className="h-screen w-full flex items-center justify-center text-muted-foreground">Loading…</div>;
  }

  return (
    <Layout>
      <Component {...rest} />
    </Layout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/projects" component={() => <ProtectedRoute component={Projects} />} />
      <Route path="/projects/new" component={() => <ProtectedRoute component={ProjectNew} />} />
      <Route path="/projects/:id" component={() => <ProtectedRoute component={ProjectDetail} />} />
      <Route path="/dprs/:id" component={() => <ProtectedRoute component={DprDetail} />} />
      <Route path="/approvals" component={() => <ProtectedRoute component={Approvals} />} />
      <Route path="/reports" component={() => <ProtectedRoute component={Reports} />} />
      <Route path="/analytics" component={() => <ProtectedRoute component={Analytics} />} />
      <Route path="/leads" component={() => <ProtectedRoute component={Leads} />} />
      <Route path="/customers" component={() => <ProtectedRoute component={Customers} />} />
      <Route path="/pre-estimations" component={() => <ProtectedRoute component={PreEstimations} />} />
      <Route path="/quotations" component={() => <ProtectedRoute component={Quotations} />} />
      <Route path="/tenders" component={() => <ProtectedRoute component={Tenders} />} />
      <Route path="/dsr-rates" component={() => <ProtectedRoute component={DsrRates} />} />
      <Route path="/organisations" component={() => <ProtectedRoute component={Organisations} />} />
      <Route path="/admin" component={() => <ProtectedRoute component={Admin} />} />
      <Route path="/profile" component={() => <ProtectedRoute component={Profile} />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

export default App;
