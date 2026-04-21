import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Search, Plus, Download, CheckCircle2, CreditCard } from "lucide-react";
import { formatINR, formatDate, getDaysAge, getDueClassification } from "@/lib/sla";
import WorkflowIndicator from "@/components/WorkflowIndicator";
import type { Vendor, Invoice } from "@shared/schema";

const STATUS_TABS = ["All", "Pending", "Accepted", "Paid", "Rejected"] as const;

function statusBadgeClass(status: string) {
  switch (status) {
    case "Paid": return "bg-green-100 text-green-700";
    case "Pending": return "bg-amber-100 text-amber-700";
    case "Accepted": return "bg-blue-100 text-blue-700";
    case "Rejected": return "bg-red-100 text-red-700";
    default: return "bg-gray-100 text-gray-600";
  }
}

function ageBadgeClass(days: number) {
  if (days <= 30) return "text-green-600";
  if (days <= 45) return "text-amber-600";
  return "text-red-600";
}

export default function Invoices() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [showAdd, setShowAdd] = useState(false);

  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({ queryKey: ["/api/invoices"] });
  const { data: vendors = [] } = useQuery<Vendor[]>({ queryKey: ["/api/vendors"] });

  const vendorMap = useMemo(() => {
    const m = new Map<number, Vendor>();
    vendors.forEach(v => m.set(v.id, v));
    return m;
  }, [vendors]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { All: invoices.length };
    invoices.forEach(inv => { c[inv.status] = (c[inv.status] || 0) + 1; });
    return c;
  }, [invoices]);

  const acceptMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/invoices/${id}`, { status: "Accepted", acceptanceDate: new Date().toISOString().split("T")[0] }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/invoices"] }); queryClient.invalidateQueries({ queryKey: ["/api/analytics/summary"] }); toast({ title: "Invoice accepted" }); },
  });

  const payMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/invoices/${id}`, { status: "Paid", paymentDate: new Date().toISOString().split("T")[0] }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/invoices"] }); queryClient.invalidateQueries({ queryKey: ["/api/analytics/summary"] }); toast({ title: "Invoice marked as paid" }); },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/invoices", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/summary"] });
      setShowAdd(false);
      toast({ title: "Invoice created" });
    },
  });

  const filtered = invoices.filter(inv => {
    const vendor = vendorMap.get(inv.vendorId);
    const matchSearch = !search ||
      inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      vendor?.name.toLowerCase().includes(search.toLowerCase()) ||
      inv.description?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "All" || inv.status === statusFilter;
    return matchSearch && matchStatus;
  });

  function exportCSV() {
    const headers = ["Invoice #", "Vendor", "Invoice Date", "Receipt Date", "Net Payable", "Status", "Age (days)", "Description"];
    const rows = filtered.map(inv => {
      const vendor = vendorMap.get(inv.vendorId);
      return [inv.invoiceNumber, vendor?.name || "", inv.invoiceDate, inv.receiptDate, inv.netPayable, inv.status, getDaysAge(inv.receiptDate, inv.paymentDate), inv.description || ""];
    });
    const csv = [headers.join(","), ...rows.map(r => r.map(v => `"${v}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoices_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading) {
    return <div className="p-6 space-y-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-96 w-full" /></div>;
  }

  return (
    <div className="p-6 space-y-4">
      {/* Search + Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search invoices..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
        </div>
        <Button size="sm" variant="outline" onClick={exportCSV} className="h-8 text-xs">
          <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
        </Button>
        <Button size="sm" onClick={() => setShowAdd(true)} className="h-8 text-xs">
          <Plus className="h-3.5 w-3.5 mr-1.5" /> New Invoice
        </Button>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex gap-1.5 border-b border-border pb-0">
        {STATUS_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setStatusFilter(tab)}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              statusFilter === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab}
            {statusCounts[tab] !== undefined && (
              <span className="ml-1.5 text-[10px] bg-muted px-1.5 py-0.5 rounded-full">{statusCounts[tab] || 0}</span>
            )}
          </button>
        ))}
      </div>

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {["Invoice #", "Vendor", "Inv. Date", "Base Amount", "GST", "Net Payable", "Status", "Due", "Age", "Actions"].map(h => (
                    <th key={h} className={`py-3 px-4 font-semibold text-xs uppercase tracking-wide text-muted-foreground ${["Base Amount", "GST", "Net Payable", "Age"].includes(h) ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(inv => {
                  const vendor = vendorMap.get(inv.vendorId);
                  const age = getDaysAge(inv.receiptDate, inv.paymentDate);
                  const due = getDueClassification(age);
                  return (
                    <tr key={inv.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4 font-mono text-xs font-medium">{inv.invoiceNumber}</td>
                      <td className="py-3 px-4">{vendor?.name || "—"}</td>
                      <td className="py-3 px-4 text-muted-foreground">{formatDate(inv.invoiceDate)}</td>
                      <td className="py-3 px-4 text-right">{formatINR(inv.amount)}</td>
                      <td className="py-3 px-4 text-right text-muted-foreground">{inv.gstAmount ? formatINR(inv.gstAmount) : "—"}</td>
                      <td className="py-3 px-4 text-right font-semibold">{formatINR(inv.netPayable)}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${statusBadgeClass(inv.status)}`}>{inv.status}</span>
                      </td>
                      <td className="py-3 px-4">
                        {inv.status !== "Paid" ? (
                          <span className={`text-[11px] font-medium ${due.color}`}>{due.label}</span>
                        ) : <span className="text-[11px] text-muted-foreground">—</span>}
                      </td>
                      <td className={`py-3 px-4 text-right text-xs font-medium ${inv.status !== "Paid" ? ageBadgeClass(age) : "text-muted-foreground"}`}>{age}d</td>
                      <td className="py-3 px-4">
                        <div className="flex gap-1">
                          {inv.status === "Pending" && (
                            <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => acceptMutation.mutate(inv.id)}>
                              <CheckCircle2 className="h-3 w-3 mr-1" />Accept
                            </Button>
                          )}
                          {inv.status === "Accepted" && (
                            <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => payMutation.mutate(inv.id)}>
                              <CreditCard className="h-3 w-3 mr-1" />Pay
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={10} className="py-12 text-center text-muted-foreground">No invoices found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add Invoice Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Invoice</DialogTitle></DialogHeader>
          <form onSubmit={e => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const data: any = {};
            fd.forEach((val, key) => { data[key] = val; });
            data.vendorId = Number(data.vendorId);
            data.amount = Number(data.amount) || 0;
            data.gstAmount = Number(data.gstAmount) || 0;
            data.tdsAmount = Number(data.tdsAmount) || 0;
            data.netPayable = data.amount + data.gstAmount - data.tdsAmount;
            createMutation.mutate(data);
          }} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs">Vendor *</Label>
                <select name="vendorId" required className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">Select vendor</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div><Label className="text-xs">Invoice # *</Label><Input name="invoiceNumber" required className="h-9 text-sm mt-1" /></div>
              <div><Label className="text-xs">Status</Label>
                <select name="status" className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="Pending">Pending</option><option value="Accepted">Accepted</option><option value="Paid">Paid</option>
                </select>
              </div>
              <div><Label className="text-xs">Invoice Date *</Label><Input name="invoiceDate" type="date" required className="h-9 text-sm mt-1" /></div>
              <div><Label className="text-xs">Receipt Date *</Label><Input name="receiptDate" type="date" required className="h-9 text-sm mt-1" /></div>
              <div><Label className="text-xs">Amount *</Label><Input name="amount" type="number" step="0.01" required className="h-9 text-sm mt-1" /></div>
              <div><Label className="text-xs">GST Amount</Label><Input name="gstAmount" type="number" step="0.01" defaultValue="0" className="h-9 text-sm mt-1" /></div>
              <div><Label className="text-xs">TDS Amount</Label><Input name="tdsAmount" type="number" step="0.01" defaultValue="0" className="h-9 text-sm mt-1" /></div>
              <div><Label className="text-xs">Payment Mode</Label>
                <select name="paymentMode" className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">—</option><option value="NEFT">NEFT</option><option value="RTGS">RTGS</option><option value="UPI">UPI</option><option value="Cheque">Cheque</option>
                </select>
              </div>
              <div className="col-span-2"><Label className="text-xs">Description</Label><Input name="description" className="h-9 text-sm mt-1" /></div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={createMutation.isPending}>{createMutation.isPending ? "Creating..." : "Create Invoice"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
