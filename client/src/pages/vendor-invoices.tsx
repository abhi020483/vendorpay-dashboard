import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, ChevronDown, ChevronRight, Building2, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { formatINR, formatDate, getDaysAge, getDueClassification } from "@/lib/sla";
import type { Vendor, Invoice } from "@shared/schema";

function statusBadgeClass(status: string) {
  switch (status) {
    case "Paid": return "bg-green-100 text-green-700";
    case "Pending": return "bg-amber-100 text-amber-700";
    case "Accepted": return "bg-blue-100 text-blue-700";
    case "Rejected": return "bg-red-100 text-red-700";
    default: return "bg-gray-100 text-gray-600";
  }
}

type SortKey = "name" | "invoiceCount" | "totalInvoiced" | "totalOutstanding" | "advances" | "overdueCount";
type SortDir = "asc" | "desc";

export default function VendorInvoices() {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("totalOutstanding");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 inline ml-1 opacity-40" />;
    return sortDir === "desc"
      ? <ArrowDown className="h-3 w-3 inline ml-1" />
      : <ArrowUp className="h-3 w-3 inline ml-1" />;
  }

  const { data: vendors = [], isLoading: loadingVendors } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
    queryFn: async () => {
      const res = await fetch("/api/vendors");
      if (!res.ok) throw new Error("Failed to fetch vendors");
      return res.json();
    },
  });
  const { data: invoices = [], isLoading: loadingInvoices } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
    queryFn: async () => {
      const res = await fetch("/api/invoices");
      if (!res.ok) throw new Error("Failed to fetch invoices");
      return res.json();
    },
  });
  const { data: payments = [] } = useQuery<any[]>({
    queryKey: ["/api/payments"],
    queryFn: async () => {
      const res = await fetch("/api/payments");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const vendorData = useMemo(() => {
    const byVendor = new Map<number, {
      vendor: Vendor;
      invoices: Invoice[];
      totalInvoiced: number;
      totalPaid: number;
      totalOutstanding: number;
      advances: number;
      overdueCount: number;
    }>();

    vendors.forEach(v => {
      byVendor.set(v.id, {
        vendor: v,
        invoices: [],
        totalInvoiced: 0,
        totalPaid: 0,
        totalOutstanding: 0,
        advances: 0,
        overdueCount: 0,
      });
    });

    invoices.forEach(inv => {
      const entry = byVendor.get(inv.vendorId);
      if (!entry) return;
      entry.invoices.push(inv);
      entry.totalInvoiced += inv.netPayable || 0;
      if (inv.status === "Paid") {
        entry.totalPaid += inv.netPayable || 0;
      } else {
        entry.totalOutstanding += inv.netPayable || 0;
        const age = getDaysAge(inv.receiptDate, inv.paymentDate);
        if (age > 45) entry.overdueCount++;
      }
    });

    payments.forEach(p => {
      if (!p.invoiceId) {
        const entry = byVendor.get(p.vendorId);
        if (entry) entry.advances += p.amount;
      }
    });

    const arr = Array.from(byVendor.values()).filter(e => e.invoices.length > 0);
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      let va: any, vb: any;
      switch (sortKey) {
        case "name": va = a.vendor.name.toLowerCase(); vb = b.vendor.name.toLowerCase(); break;
        case "invoiceCount": va = a.invoices.length; vb = b.invoices.length; break;
        case "totalInvoiced": va = a.totalInvoiced; vb = b.totalInvoiced; break;
        case "totalOutstanding": va = a.totalOutstanding; vb = b.totalOutstanding; break;
        case "advances": va = a.advances; vb = b.advances; break;
        case "overdueCount": va = a.overdueCount; vb = b.overdueCount; break;
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    return arr;
  }, [vendors, invoices, payments, sortKey, sortDir]);

  const filtered = vendorData.filter(e =>
    !search || e.vendor.name.toLowerCase().includes(search.toLowerCase())
  );

  function toggleExpand(vendorId: number) {
    const next = new Set(expanded);
    if (next.has(vendorId)) next.delete(vendorId);
    else next.add(vendorId);
    setExpanded(next);
  }

  if (loadingVendors || loadingInvoices) {
    return <div className="p-6 space-y-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-96 w-full" /></div>;
  }

  return (
    <div className="p-6 space-y-4">
      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search vendors..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <div className="text-xs text-muted-foreground ml-auto">
          {filtered.length} vendors · {filtered.reduce((s, e) => s + e.invoices.length, 0)} invoices
        </div>
      </div>

      {/* Vendor List with expandable invoices */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">No vendors with invoices found</div>
          ) : (
            <div>
              {/* Header - clickable for sorting */}
              <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b bg-muted/30 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground select-none">
                <button onClick={() => toggleSort("name")} className="col-span-4 text-left hover:text-foreground cursor-pointer">
                  Vendor<SortIcon col="name" />
                </button>
                <button onClick={() => toggleSort("invoiceCount")} className="col-span-1 text-center hover:text-foreground cursor-pointer">
                  Invoices<SortIcon col="invoiceCount" />
                </button>
                <button onClick={() => toggleSort("totalInvoiced")} className="col-span-2 text-right hover:text-foreground cursor-pointer">
                  Total Invoiced<SortIcon col="totalInvoiced" />
                </button>
                <button onClick={() => toggleSort("totalOutstanding")} className="col-span-2 text-right hover:text-foreground cursor-pointer">
                  Outstanding<SortIcon col="totalOutstanding" />
                </button>
                <button onClick={() => toggleSort("advances")} className="col-span-2 text-right hover:text-foreground cursor-pointer">
                  Advances<SortIcon col="advances" />
                </button>
                <button onClick={() => toggleSort("overdueCount")} className="col-span-1 text-center hover:text-foreground cursor-pointer">
                  Overdue<SortIcon col="overdueCount" />
                </button>
              </div>

              {filtered.map(entry => {
                const isOpen = expanded.has(entry.vendor.id);
                return (
                  <div key={entry.vendor.id}>
                    <div
                      className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-border/50 hover:bg-muted/20 cursor-pointer transition-colors items-center"
                      onClick={() => toggleExpand(entry.vendor.id)}
                    >
                      <div className="col-span-4 flex items-center gap-2 font-medium">
                        {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{entry.vendor.name}</span>
                      </div>
                      <div className="col-span-1 text-center text-sm">{entry.invoices.length}</div>
                      <div className="col-span-2 text-right text-sm font-medium">{formatINR(entry.totalInvoiced)}</div>
                      <div className={`col-span-2 text-right text-sm font-medium ${entry.totalOutstanding > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                        {formatINR(entry.totalOutstanding)}
                      </div>
                      <div className={`col-span-2 text-right text-sm ${entry.advances > 0 ? "text-blue-600 font-medium" : "text-muted-foreground"}`}>
                        {entry.advances > 0 ? formatINR(entry.advances) : "—"}
                      </div>
                      <div className="col-span-1 text-center">
                        {entry.overdueCount > 0 ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">
                            {entry.overdueCount}
                          </span>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </div>
                    </div>

                    {/* Expanded invoice list */}
                    {isOpen && (
                      <div className="bg-muted/10 border-b">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-[10px] uppercase text-muted-foreground">
                              <th className="text-left py-2 px-4 pl-12 font-semibold">Invoice #</th>
                              <th className="text-left py-2 px-2 font-semibold">Inv. Date</th>
                              <th className="text-right py-2 px-2 font-semibold">Base</th>
                              <th className="text-right py-2 px-2 font-semibold">GST</th>
                              <th className="text-right py-2 px-2 font-semibold">Net</th>
                              <th className="text-left py-2 px-2 font-semibold">Status</th>
                              <th className="text-left py-2 px-2 font-semibold">Due</th>
                              <th className="text-right py-2 px-4 font-semibold">Age</th>
                            </tr>
                          </thead>
                          <tbody>
                            {entry.invoices.map(inv => {
                              const age = getDaysAge(inv.receiptDate, inv.paymentDate);
                              const due = getDueClassification(age);
                              return (
                                <tr key={inv.id} className="border-t border-border/30 hover:bg-muted/20">
                                  <td className="py-2 px-4 pl-12 font-mono">{inv.invoiceNumber}</td>
                                  <td className="py-2 px-2">{formatDate(inv.invoiceDate)}</td>
                                  <td className="py-2 px-2 text-right">{formatINR(inv.amount)}</td>
                                  <td className="py-2 px-2 text-right text-muted-foreground">{inv.gstAmount ? formatINR(inv.gstAmount) : "—"}</td>
                                  <td className="py-2 px-2 text-right font-semibold">{formatINR(inv.netPayable)}</td>
                                  <td className="py-2 px-2">
                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${statusBadgeClass(inv.status)}`}>{inv.status}</span>
                                  </td>
                                  <td className="py-2 px-2">
                                    {inv.status !== "Paid" ? <span className={`text-[10px] font-medium ${due.color}`}>{due.label}</span> : <span className="text-[10px] text-muted-foreground">—</span>}
                                  </td>
                                  <td className="py-2 px-4 text-right">{age}d</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
