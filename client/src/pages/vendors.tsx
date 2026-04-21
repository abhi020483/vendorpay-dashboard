import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Search, Plus, Building2, Mail, Phone, MapPin } from "lucide-react";
import { formatINR, formatDate, getDaysAge } from "@/lib/sla";
import type { Vendor, Invoice } from "@shared/schema";

const CATEGORIES = ["All", "Regular", "Occasional", "One-time"] as const;
const SERVICES = [
  "IT Services", "Logistics", "Marketing", "Facility Management",
  "Legal & Compliance", "Printing & Stationery", "Interior Design",
  "Security Services", "Audit & Consulting", "AMC & Maintenance",
  "Data & Analytics", "Medical Supplies", "General Services",
];

function categoryBadgeClass(cat: string) {
  switch (cat) {
    case "Regular": return "bg-blue-100 text-blue-700 border-blue-200";
    case "Occasional": return "bg-amber-100 text-amber-700 border-amber-200";
    case "One-time": return "bg-gray-100 text-gray-600 border-gray-200";
    default: return "";
  }
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Paid: "bg-green-100 text-green-700",
    Pending: "bg-amber-100 text-amber-700",
    Accepted: "bg-blue-100 text-blue-700",
    Rejected: "bg-red-100 text-red-700",
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${styles[status] || "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}

export default function Vendors() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [showAdd, setShowAdd] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);

  const { data: vendors = [], isLoading } = useQuery<Vendor[]>({ queryKey: ["/api/vendors"] });

  const { data: vendorInvoices = [], isLoading: loadingInvoices } = useQuery<Invoice[]>({
    queryKey: ["/api/vendors", selectedVendor?.id, "invoices"],
    queryFn: async () => {
      if (!selectedVendor) return [];
      const res = await fetch(`/api/vendors/${selectedVendor.id}/invoices`);
      if (!res.ok) throw new Error("Failed to fetch invoices");
      return res.json();
    },
    enabled: !!selectedVendor,
    staleTime: 0,
    refetchOnMount: true,
  });

  const { data: vendorPayments = [] } = useQuery<any[]>({
    queryKey: ["/api/vendors", selectedVendor?.id, "payments"],
    queryFn: async () => {
      if (!selectedVendor) return [];
      const res = await fetch(`/api/vendors/${selectedVendor.id}/payments`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedVendor,
    staleTime: 0,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/vendors", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/summary"] });
      setShowAdd(false);
      toast({ title: "Vendor created" });
    },
  });

  const filtered = vendors.filter(v => {
    const matchesSearch = !search || v.name.toLowerCase().includes(search.toLowerCase()) ||
      v.gstin?.toLowerCase().includes(search.toLowerCase()) ||
      v.service.toLowerCase().includes(search.toLowerCase());
    const matchesCat = categoryFilter === "All" || v.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  if (isLoading) {
    return <div className="p-6 space-y-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-96 w-full" /></div>;
  }

  return (
    <div className="p-6 space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, GSTIN, or service..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
        </div>
        <div className="flex gap-1.5">
          {CATEGORIES.map(cat => (
            <Button key={cat} size="sm" variant={categoryFilter === cat ? "default" : "outline"} onClick={() => setCategoryFilter(cat)} className="text-xs h-8">
              {cat}
            </Button>
          ))}
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)} className="ml-auto h-8">
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Vendor
        </Button>
      </div>

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {["Vendor Name", "Category", "Service", "GSTIN", "PAN", "Contact", "Status"].map(h => (
                    <th key={h} className="text-left py-3 px-4 font-semibold text-xs uppercase tracking-wide text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(vendor => (
                  <tr key={vendor.id} className="border-b border-border/50 hover:bg-muted/20 cursor-pointer transition-colors" onClick={() => setSelectedVendor(vendor)}>
                    <td className="py-3 px-4 font-medium">{vendor.name}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${categoryBadgeClass(vendor.category)}`}>{vendor.category}</span>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">{vendor.service}</td>
                    <td className="py-3 px-4 text-muted-foreground font-mono text-xs">{vendor.gstin || "—"}</td>
                    <td className="py-3 px-4 text-muted-foreground font-mono text-xs">{vendor.pan || "—"}</td>
                    <td className="py-3 px-4 text-muted-foreground">{vendor.contactPerson || "—"}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${vendor.status === "Active" ? "text-green-600" : "text-gray-400"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${vendor.status === "Active" ? "bg-green-500" : "bg-gray-400"}`} />
                        {vendor.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">No vendors found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Vendor Detail Modal */}
      <Dialog open={!!selectedVendor} onOpenChange={() => setSelectedVendor(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedVendor && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div>{selectedVendor.name}</div>
                    <div className="text-sm font-normal text-muted-foreground">{selectedVendor.service}</div>
                  </div>
                </DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${categoryBadgeClass(selectedVendor.category)}`}>{selectedVendor.category}</span>
                    <span className={`text-xs ${selectedVendor.status === "Active" ? "text-green-600" : "text-gray-400"}`}>{selectedVendor.status}</span>
                  </div>
                  {selectedVendor.contactPerson && <div className="text-sm"><span className="text-muted-foreground">Contact:</span> {selectedVendor.contactPerson}</div>}
                  {selectedVendor.email && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Mail className="h-3.5 w-3.5" />{selectedVendor.email}</div>}
                  {selectedVendor.phone && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Phone className="h-3.5 w-3.5" />{selectedVendor.phone}</div>}
                  {selectedVendor.address && <div className="flex items-center gap-2 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{selectedVendor.address}</div>}
                </div>
                <div className="space-y-2 text-sm">
                  <div><span className="text-muted-foreground">GSTIN:</span> <span className="font-mono">{selectedVendor.gstin || "—"}</span></div>
                  <div><span className="text-muted-foreground">PAN:</span> <span className="font-mono">{selectedVendor.pan || "—"}</span></div>
                  <div><span className="text-muted-foreground">Bank A/C:</span> <span className="font-mono">{selectedVendor.bankAccount || "—"}</span></div>
                  <div><span className="text-muted-foreground">IFSC:</span> <span className="font-mono">{selectedVendor.ifsc || "—"}</span></div>
                </div>
              </div>
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3 mt-6">
                <div className="p-3 rounded-lg bg-muted/30 border border-border">
                  <div className="text-[10px] uppercase text-muted-foreground font-medium">Total Invoices</div>
                  <div className="text-lg font-bold mt-1">{vendorInvoices.length}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {formatINR(vendorInvoices.reduce((s, i) => s + i.netPayable, 0))}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <div className="text-[10px] uppercase text-amber-700 font-medium">Outstanding</div>
                  <div className="text-lg font-bold text-amber-700 mt-1">
                    {formatINR(vendorInvoices.filter(i => i.status !== "Paid").reduce((s, i) => s + i.netPayable, 0))}
                  </div>
                  <div className="text-[10px] text-amber-600">
                    {vendorInvoices.filter(i => i.status !== "Paid").length} pending
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <div className="text-[10px] uppercase text-blue-700 font-medium">Advances Paid</div>
                  <div className="text-lg font-bold text-blue-700 mt-1">
                    {formatINR(vendorPayments.filter((p: any) => !p.invoiceId).reduce((s: number, p: any) => s + p.amount, 0))}
                  </div>
                  <div className="text-[10px] text-blue-600">
                    {vendorPayments.filter((p: any) => !p.invoiceId).length} advance payments
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <h3 className="text-sm font-semibold mb-3">Invoice History {loadingInvoices && <span className="text-xs text-muted-foreground font-normal">(loading...)</span>}</h3>
                {vendorInvoices.length > 0 ? (
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-muted/30 border-b">
                        {["Invoice #", "Date", "Base", "GST", "Net", "Status", "Age"].map(h => (
                          <th key={h} className={`py-2 px-3 font-semibold ${["Base", "GST", "Net", "Age"].includes(h) ? "text-right" : "text-left"}`}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {vendorInvoices.map(inv => (
                          <tr key={inv.id} className="border-b border-border/50">
                            <td className="py-2 px-3 font-mono">{inv.invoiceNumber}</td>
                            <td className="py-2 px-3">{formatDate(inv.invoiceDate)}</td>
                            <td className="py-2 px-3 text-right">{formatINR(inv.amount)}</td>
                            <td className="py-2 px-3 text-right text-muted-foreground">{inv.gstAmount ? formatINR(inv.gstAmount) : "—"}</td>
                            <td className="py-2 px-3 text-right font-semibold">{formatINR(inv.netPayable)}</td>
                            <td className="py-2 px-3"><StatusBadge status={inv.status} /></td>
                            <td className="py-2 px-3 text-right">{getDaysAge(inv.receiptDate, inv.paymentDate)}d</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="text-sm text-muted-foreground">No invoices found</p>}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Vendor Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Vendor</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); const fd = new FormData(e.currentTarget); const data: any = {}; fd.forEach((val, key) => { data[key] = val; }); createMutation.mutate(data); }} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label className="text-xs">Name *</Label><Input name="name" required className="h-9 text-sm mt-1" /></div>
              <div>
                <Label className="text-xs">Category *</Label>
                <select name="category" required className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="Regular">Regular</option><option value="Occasional">Occasional</option><option value="One-time">One-time</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">Service *</Label>
                <select name="service" required className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                  {SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div><Label className="text-xs">Contact Person</Label><Input name="contactPerson" className="h-9 text-sm mt-1" /></div>
              <div><Label className="text-xs">Email</Label><Input name="email" type="email" className="h-9 text-sm mt-1" /></div>
              <div><Label className="text-xs">Phone</Label><Input name="phone" className="h-9 text-sm mt-1" /></div>
              <div><Label className="text-xs">GSTIN</Label><Input name="gstin" className="h-9 text-sm mt-1" /></div>
              <div><Label className="text-xs">PAN</Label><Input name="pan" className="h-9 text-sm mt-1" /></div>
              <div><Label className="text-xs">Bank Account</Label><Input name="bankAccount" className="h-9 text-sm mt-1" /></div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={createMutation.isPending}>{createMutation.isPending ? "Creating..." : "Create Vendor"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
