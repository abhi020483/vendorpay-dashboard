import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { Clock, TrendingUp, AlertTriangle } from "lucide-react";
import { formatINR, getSlaStatus, SLA_THRESHOLDS } from "@/lib/sla";

export default function Ageing() {
  const { data: analytics, isLoading } = useQuery<any>({
    queryKey: ["/api/analytics/summary"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-3 gap-4">{[...Array(3)].map((_, i) => <Card key={i}><CardContent className="p-5"><Skeleton className="h-16 w-full" /></CardContent></Card>)}</div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!analytics) return null;

  // Calculate KPIs (45-day standard SLA)
  const paidInvoicesWithDays = (analytics.vendorAgeing || []).filter((v: any) => v.avgDays > 0);
  const avgTAT = paidInvoicesWithDays.length > 0
    ? Math.round(paidInvoicesWithDays.reduce((s: number, v: any) => s + v.avgDays, 0) / paidInvoicesWithDays.length)
    : 0;

  const pendingBuckets = analytics.ageingBuckets || {};
  // On-time = within 45 days (0-15, 16-30, 31-45). Overdue = 46+ days
  const onTimeCount = (pendingBuckets["0-15"] || 0) + (pendingBuckets["16-30"] || 0) + (pendingBuckets["31-45"] || 0);
  const overdueCount = (pendingBuckets["46-60"] || 0) + (pendingBuckets["60+"] || 0);
  const totalPending = Object.values(pendingBuckets).reduce((s: number, v: any) => s + v, 0);
  const onTimeRate = totalPending > 0 ? Math.round((onTimeCount / totalPending) * 100) : 100;

  // Vendor-wise ageing buckets
  const vendorAgeingBuckets = analytics.vendorAgeingBuckets || [];

  // Payment turnaround distribution (45-day SLA buckets)
  const turnaroundRanges = [
    { range: "0-15d", min: 0, max: 15, count: 0 },
    { range: "16-30d", min: 16, max: 30, count: 0 },
    { range: "31-45d", min: 31, max: 45, count: 0 },
    { range: "46-60d", min: 46, max: 60, count: 0 },
    { range: "60+d", min: 61, max: 9999, count: 0 },
  ];
  (analytics.vendorAgeing || []).forEach((v: any) => {
    if (v.avgDays > 0) {
      const range = turnaroundRanges.find(r => v.avgDays >= r.min && v.avgDays <= r.max);
      if (range) range.count += v.invoiceCount;
    }
  });

  const turnaroundColors = ["#22C55E", "#84CC16", "#F59E0B", "#F97316", "#EF4444"];

  return (
    <div className="p-6 space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Clock className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Avg TAT</p>
                <p className="text-[26px] font-bold leading-tight mt-1">{avgTAT}<span className="text-sm font-normal text-muted-foreground ml-1">d</span></p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-green-500/10"><TrendingUp className="h-5 w-5 text-green-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">On-time Rate</p>
                <p className="text-[26px] font-bold leading-tight mt-1">{onTimeRate}<span className="text-sm font-normal text-muted-foreground ml-1">%</span></p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-red-500/10"><AlertTriangle className="h-5 w-5 text-red-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Overdue (45d+)</p>
                <p className="text-[26px] font-bold leading-tight mt-1">{overdueCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10"><AlertTriangle className="h-5 w-5 text-amber-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Outstanding</p>
                <p className="text-[20px] font-bold leading-tight mt-1">{formatINR(analytics.totalOutstanding || 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10"><Clock className="h-5 w-5 text-blue-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Advances Paid</p>
                <p className="text-[20px] font-bold leading-tight mt-1">{formatINR(analytics.totalAdvances || 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Vendor-wise Ageing Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Vendor-wise Outstanding Ageing</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left py-3 px-4 font-semibold text-xs uppercase tracking-wide text-muted-foreground">Vendor</th>
                  <th className="text-left py-3 px-4 font-semibold text-xs uppercase tracking-wide text-muted-foreground">Category</th>
                  <th className="text-right py-3 px-4 font-semibold text-xs uppercase tracking-wide text-muted-foreground">0-15d</th>
                  <th className="text-right py-3 px-4 font-semibold text-xs uppercase tracking-wide text-muted-foreground">16-30d</th>
                  <th className="text-right py-3 px-4 font-semibold text-xs uppercase tracking-wide text-muted-foreground">31-45d</th>
                  <th className="text-right py-3 px-4 font-semibold text-xs uppercase tracking-wide text-muted-foreground">46-60d</th>
                  <th className="text-right py-3 px-4 font-semibold text-xs uppercase tracking-wide text-muted-foreground">60+d</th>
                  <th className="text-right py-3 px-4 font-semibold text-xs uppercase tracking-wide text-muted-foreground">Total Outstanding</th>
                  <th className="text-center py-3 px-4 font-semibold text-xs uppercase tracking-wide text-muted-foreground">SLA</th>
                </tr>
              </thead>
              <tbody>
                {vendorAgeingBuckets.length > 0 ? vendorAgeingBuckets
                  .sort((a: any, b: any) => b.total - a.total)
                  .map((row: any, idx: number) => {
                    const maxBucketDays = row.buckets["60+"] > 0 ? 65 : row.buckets["46-60"] > 0 ? 50 : row.buckets["31-45"] > 0 ? 40 : row.buckets["16-30"] > 0 ? 25 : 10;
                    const slaStatus = getSlaStatus(row.category, maxBucketDays);
                    const rowBg = slaStatus === "escalate" ? "bg-red-50" : slaStatus === "alert" ? "bg-amber-50" : "";

                    return (
                      <tr key={idx} className={`border-b border-border/50 transition-colors ${rowBg}`}>
                        <td className="py-3 px-4 font-medium">{row.vendorName}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                            row.category === "Regular" ? "bg-blue-100 text-blue-700 border-blue-200" :
                            row.category === "Occasional" ? "bg-amber-100 text-amber-700 border-amber-200" :
                            "bg-gray-100 text-gray-600 border-gray-200"
                          }`}>{row.category}</span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs">{row.buckets["0-15"] > 0 ? formatINR(row.buckets["0-15"]) : "—"}</td>
                        <td className="py-3 px-4 text-right font-mono text-xs">{row.buckets["16-30"] > 0 ? formatINR(row.buckets["16-30"]) : "—"}</td>
                        <td className="py-3 px-4 text-right font-mono text-xs">{row.buckets["31-45"] > 0 ? formatINR(row.buckets["31-45"]) : "—"}</td>
                        <td className="py-3 px-4 text-right font-mono text-xs">{row.buckets["46-60"] > 0 ? formatINR(row.buckets["46-60"]) : "—"}</td>
                        <td className="py-3 px-4 text-right font-mono text-xs">{row.buckets["60+"] > 0 ? formatINR(row.buckets["60+"]) : "—"}</td>
                        <td className="py-3 px-4 text-right font-semibold">{formatINR(row.total)}</td>
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            slaStatus === "escalate" ? "bg-red-100 text-red-700" :
                            slaStatus === "alert" ? "bg-amber-100 text-amber-700" :
                            "bg-green-100 text-green-700"
                          }`}>
                            {slaStatus === "escalate" ? "Overdue" : slaStatus === "alert" ? "Alert" : "On Track"}
                          </span>
                        </td>
                      </tr>
                    );
                  }) : (
                  <tr><td colSpan={9} className="py-12 text-center text-muted-foreground">All invoices are paid — no outstanding amounts</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Payment Turnaround Distribution */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Payment Turnaround Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={turnaroundRanges}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,10%,90%)" />
                <XAxis dataKey="range" tick={{ fontSize: 12 }} tickLine={false} />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" name="Invoices" radius={[4, 4, 0, 0]}>
                  {turnaroundRanges.map((_, i) => (
                    <Cell key={i} fill={turnaroundColors[i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* SLA Reference */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">SLA Thresholds Reference</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {Object.entries(SLA_THRESHOLDS).map(([cat, t]) => (
              <div key={cat} className="p-3 rounded-lg border border-border bg-muted/20">
                <div className="text-sm font-semibold">{cat} Vendors</div>
                <div className="text-xs text-muted-foreground mt-1">SLA: {t.label}</div>
                <div className="text-xs text-muted-foreground">Alert at Day {t.alert} | Escalate at Day {t.escalate}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
