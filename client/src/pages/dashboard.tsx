import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, Area, AreaChart, ComposedChart, Line,
} from "recharts";
import { IndianRupee, Users, CheckCircle2, Clock, FileCheck } from "lucide-react";
import { formatINR } from "@/lib/sla";

const CHART_COLORS = ["#3B82F6", "#22C55E", "#F59E0B", "#8B5CF6", "#EF4444", "#06B6D4", "#F97316"];
const AGEING_COLORS = ["#22C55E", "#84CC16", "#F59E0B", "#F97316", "#EF4444"];

type ViewMode = "monthly" | "weekly";

function formatWeekLabel(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function formatMonthLabel(month: string) {
  const [y, m] = month.split("-");
  const months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(m)]} ${y.slice(2)}`;
}

export default function Dashboard() {
  const [viewMode, setViewMode] = useState<ViewMode>("monthly");

  const { data: analytics, isLoading } = useQuery<any>({
    queryKey: ["/api/analytics/summary"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  if (!analytics) return null;

  const kpiCards = [
    { label: "Total Vendors", value: analytics.totalVendors, icon: Users, color: "text-primary", bg: "bg-primary/10" },
    { label: "Total Payout", value: formatINR(analytics.totalPayouts), icon: IndianRupee, color: "text-emerald-600", bg: "bg-emerald-500/10" },
    { label: "Paid", value: formatINR(analytics.totalPaid), icon: CheckCircle2, color: "text-green-600", bg: "bg-green-500/10" },
    { label: "Pending", value: formatINR(analytics.totalPending), icon: Clock, color: "text-amber-600", bg: "bg-amber-500/10" },
    { label: "Accepted", value: formatINR(analytics.totalAccepted || 0), icon: FileCheck, color: "text-blue-600", bg: "bg-blue-500/10" },
  ];

  const vendorSplitData = [
    { name: "Regular", value: analytics.vendorSplit.regular, color: CHART_COLORS[0] },
    { name: "Occasional", value: analytics.vendorSplit.occasional, color: CHART_COLORS[2] },
    { name: "One-time", value: analytics.vendorSplit.oneTime, color: CHART_COLORS[3] },
  ];

  const serviceSplitData = Object.entries(analytics.serviceSplit)
    .map(([service, amount], idx) => ({
      name: service, amount: amount as number, color: CHART_COLORS[idx % CHART_COLORS.length],
    }))
    .sort((a, b) => b.amount - a.amount);

  // Monthly data
  const monthlyData = Object.entries(analytics.monthlyPayouts || {})
    .map(([month, amount]) => ({
      label: formatMonthLabel(month),
      amount: amount as number,
      count: (analytics.monthlyCount || {})[month] || 0,
      sortKey: month,
    }))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  // Weekly data
  const weeklyData = Object.entries(analytics.weeklyPayouts || {})
    .map(([week, amount]) => ({
      label: formatWeekLabel(week),
      amount: amount as number,
      count: (analytics.weeklyCount || {})[week] || 0,
      sortKey: week,
    }))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const trendData = viewMode === "monthly" ? monthlyData : weeklyData;

  const ageingData = Object.entries(analytics.ageingBuckets).map(([bucket, count], idx) => ({
    bucket, count: count as number, fill: AGEING_COLORS[idx] || AGEING_COLORS[4],
  }));

  return (
    <div className="p-6 space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label}>
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${kpi.bg}`}>
                    <Icon className={`h-5 w-5 ${kpi.color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide truncate">{kpi.label}</p>
                    <p className="text-[28px] font-bold leading-tight mt-1">{kpi.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Trend Chart with Week/Month Toggle */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">
                {viewMode === "monthly" ? "Monthly" : "Weekly"} Invoice Trends
              </CardTitle>
              <div className="flex gap-1 bg-muted rounded-lg p-0.5">
                <Button
                  size="sm"
                  variant={viewMode === "weekly" ? "default" : "ghost"}
                  className="h-7 text-xs px-3"
                  onClick={() => setViewMode("weekly")}
                >
                  Weekly
                </Button>
                <Button
                  size="sm"
                  variant={viewMode === "monthly" ? "default" : "ghost"}
                  className="h-7 text-xs px-3"
                  onClick={() => setViewMode("monthly")}
                >
                  Monthly
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,10%,90%)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    angle={viewMode === "weekly" ? -45 : 0}
                    textAnchor={viewMode === "weekly" ? "end" : "middle"}
                    height={viewMode === "weekly" ? 50 : 30}
                  />
                  <YAxis yAxisId="amount" tick={{ fontSize: 11 }} tickLine={false} tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`} />
                  <YAxis yAxisId="count" orientation="right" tick={{ fontSize: 11 }} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    formatter={(value: number, name: string) =>
                      name === "Amount" ? formatINR(value) : `${value} invoices`
                    }
                  />
                  <Legend />
                  <Area yAxisId="amount" type="monotone" dataKey="amount" name="Amount" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.12} strokeWidth={2} />
                  <Line yAxisId="count" type="monotone" dataKey="count" name="Invoices" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Vendor Category Split</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={vendorSplitData} cx="50%" cy="45%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={3}>
                    {vendorSplitData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2: Service Bar + Ageing */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Service Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serviceSplitData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,10%,90%)" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={130} />
                  <Tooltip formatter={(value: number) => formatINR(value)} />
                  <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                    {serviceSplitData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Invoice Ageing Buckets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ageingData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,10%,90%)" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 12 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 12 }} tickLine={false} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" name="Invoices" radius={[4, 4, 0, 0]}>
                    {ageingData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
