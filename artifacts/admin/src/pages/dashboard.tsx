import { useGetAdminSystemStats } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, HardHat, TrendingUp, AlertCircle, FileText, Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from "recharts";
import { format, parseISO } from "date-fns";

export default function Dashboard() {
  const { data: stats, isLoading, isError } = useGetAdminSystemStats();

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-[400px] w-full rounded-xl" />
        </div>
      </Layout>
    );
  }

  if (isError || !stats) {
    return (
      <Layout>
        <div className="rounded-md bg-red-50 p-4 border border-red-200">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error loading dashboard</h3>
              <p className="mt-2 text-sm text-red-700">Failed to load system statistics. Please try again later.</p>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  const statCards = [
    {
      title: "Total Tenants",
      value: stats.totalTenants,
      description: `${stats.activeTenants} active, ${stats.suspendedTenants} suspended`,
      icon: Building2,
      trend: `+${stats.newTenantsLast30Days} this month`,
    },
    {
      title: "Total Users",
      value: stats.totalUsers,
      description: "Across all tenants",
      icon: Users,
    },
    {
      title: "Active Projects",
      value: stats.totalProjects,
      description: "Currently ongoing",
      icon: HardHat,
    },
    {
      title: "DPRs Logged",
      value: stats.dprsLast30Days,
      description: "Last 30 days",
      icon: FileText,
      trend: "High activity",
    },
  ];

  const p95 = stats.responseTimeP95Ms ?? 0;
  const p95Color = p95 === 0 ? "text-gray-400" : p95 < 200 ? "text-green-600" : p95 < 500 ? "text-amber-600" : "text-red-600";

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">System Overview</h1>
          <p className="text-gray-500 mt-1">Platform-wide statistics and trends.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <Card key={index} className="border-gray-200 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">
                    {stat.title}
                  </CardTitle>
                  <Icon className="h-4 w-4 text-gray-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-gray-900">{stat.value.toLocaleString()}</div>
                  <p className="text-xs text-gray-500 mt-1">{stat.description}</p>
                  {stat.trend && (
                    <div className="flex items-center text-xs text-green-600 mt-2 font-medium">
                      <TrendingUp className="h-3 w-3 mr-1" />
                      {stat.trend}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="border-gray-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Response Time p95</CardTitle>
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-gray-400" />
              <span className={`text-2xl font-bold ${p95Color}`}>
                {p95 === 0 ? "—" : `${Math.round(p95)} ms`}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              {p95 === 0
                ? "No request data collected yet. p95 is computed from the last 1,000 API requests."
                : `95th percentile response latency computed from sampled in-memory request data.`}
            </p>
          </CardContent>
        </Card>

        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle>Signups (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[350px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.signupsByDay} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(val) => format(parseISO(val), "MMM d")}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#6b7280", fontSize: 12 }}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#6b7280", fontSize: 12 }}
                    dx={-10}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                    labelFormatter={(val) => format(parseISO(val as string), "MMM d, yyyy")}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#2563eb"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorCount)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
