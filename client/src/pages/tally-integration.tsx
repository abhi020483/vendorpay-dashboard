import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet, RefreshCw, CheckCircle2, XCircle, Loader2,
  ArrowRight, Database, Globe, Server,
} from "lucide-react";

export default function TallyIntegration() {
  const { toast } = useToast();

  const { data: syncConfig } = useQuery<any>({
    queryKey: ["/api/sync-config"],
    refetchInterval: 3000,
  });

  const [sheetsId, setSheetsId] = useState("");
  const [tallyHost, setTallyHost] = useState("localhost");
  const [tallyPort, setTallyPort] = useState("9000");

  const updateConfigMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", "/api/sync-config", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sync-config"] });
      toast({ title: "Configuration saved" });
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/sync/trigger"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sync-config"] });
      toast({ title: "Sync started" });
    },
  });

  const status = syncConfig?.status || "idle";
  const lastSync = syncConfig?.lastSyncAt;

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Google Sheets Connection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Sheet className="h-5 w-5 text-green-600" />
              Google Sheets Connection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Connection Status */}
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
              <div className={`h-3 w-3 rounded-full ${
                status === "success" ? "bg-green-500" :
                status === "syncing" ? "bg-amber-500 animate-pulse" :
                status === "error" ? "bg-red-500" : "bg-gray-400"
              }`} />
              <div>
                <div className="text-sm font-medium capitalize">{status === "idle" ? "Not Connected" : status}</div>
                {lastSync && <div className="text-xs text-muted-foreground">Last sync: {new Date(lastSync).toLocaleString("en-IN")}</div>}
              </div>
            </div>

            <div>
              <Label className="text-xs">Google Sheet ID</Label>
              <Input
                placeholder="e.g., 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                value={sheetsId || syncConfig?.sheetsId || ""}
                onChange={e => setSheetsId(e.target.value)}
                className="h-9 text-sm mt-1 font-mono"
              />
              <p className="text-[11px] text-muted-foreground mt-1">Find this in your Google Sheets URL after /d/</p>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateConfigMutation.mutate({ sheetsId: sheetsId || syncConfig?.sheetsId })}
                disabled={updateConfigMutation.isPending}
                className="text-xs"
              >
                Save Config
              </Button>
              <Button
                size="sm"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending || status === "syncing"}
                className="text-xs"
              >
                {status === "syncing" ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Syncing...</> : <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Sync Now</>}
              </Button>
            </div>

            {/* Expected Sheet Structure */}
            <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border">
              <h4 className="text-xs font-semibold mb-2">Expected Sheet Structure</h4>
              <div className="space-y-1.5 text-[11px] text-muted-foreground">
                <div><span className="font-medium text-foreground">Sheet 1: "Vendor Master"</span> — VendorName, Category, ServiceType, ContactPerson, Email, Phone, GSTIN, PAN, BankAccount, IFSC, Status</div>
                <div><span className="font-medium text-foreground">Sheet 2: "Invoice Register"</span> — InvoiceNumber, VendorName, InvoiceDate, ReceiptDate, BaseAmount, GSTAmount, TDSAmount, Status, PaymentMode</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* TallyPrime Connection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Database className="h-5 w-5 text-blue-600" />
              TallyPrime Connection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
              <div className="h-3 w-3 rounded-full bg-gray-400" />
              <div className="text-sm font-medium text-muted-foreground">Not Connected</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Tally Host</Label>
                <Input value={tallyHost} onChange={e => setTallyHost(e.target.value)} className="h-9 text-sm mt-1" />
              </div>
              <div>
                <Label className="text-xs">Port</Label>
                <Input value={tallyPort} onChange={e => setTallyPort(e.target.value)} className="h-9 text-sm mt-1" />
              </div>
            </div>

            <Button size="sm" variant="outline" className="text-xs" disabled>
              Test Connection
            </Button>

            <p className="text-[11px] text-muted-foreground">
              TallyPrime XML/HTTP integration via port 9000. Ensure TallyPrime is running with ODBC/HTTP server enabled.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Data Flow Architecture */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Data Sync Architecture</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center gap-2 py-6 flex-wrap">
            {[
              { icon: Sheet, label: "Google Sheets", sub: "Source of Truth", color: "bg-green-500/10 text-green-600" },
              { icon: ArrowRight, label: "", sub: "", color: "text-muted-foreground" },
              { icon: Globe, label: "REST API", sub: "Sync Service", color: "bg-blue-500/10 text-blue-600" },
              { icon: ArrowRight, label: "", sub: "", color: "text-muted-foreground" },
              { icon: Server, label: "SQLite DB", sub: "Local Cache", color: "bg-purple-500/10 text-purple-600" },
              { icon: ArrowRight, label: "", sub: "", color: "text-muted-foreground" },
              { icon: Database, label: "Dashboard", sub: "Visualization", color: "bg-primary/10 text-primary" },
            ].map((item, i) => {
              const Icon = item.icon;
              if (!item.label) {
                return <ArrowRight key={i} className="h-5 w-5 text-muted-foreground flex-shrink-0" />;
              }
              return (
                <div key={i} className="flex flex-col items-center gap-2 min-w-[100px]">
                  <div className={`p-3 rounded-xl ${item.color}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="text-center">
                    <div className="text-xs font-semibold">{item.label}</div>
                    <div className="text-[10px] text-muted-foreground">{item.sub}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border">
            <h4 className="text-xs font-semibold mb-2">How It Works</h4>
            <ol className="space-y-1.5 text-[11px] text-muted-foreground list-decimal list-inside">
              <li>Maintain vendor and invoice data in Google Sheets (shared with team)</li>
              <li>Click "Sync Now" or configure auto-sync to pull data into the dashboard</li>
              <li>Dashboard reads from local SQLite for fast queries and analytics</li>
              <li>Status changes (Accept/Pay) are written back to Google Sheets</li>
              <li>Optional: TallyPrime XML/HTTP for direct accounting sync</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
