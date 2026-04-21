import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, RefreshCw } from "lucide-react";

const TABS = ["Vendor Master", "Invoice Register", "Payments"];

export default function SheetsView() {
  const { data: config } = useQuery<any>({ queryKey: ["/api/sync-config"] });
  const [activeTab, setActiveTab] = useState("Invoice Register");
  const [reloadKey, setReloadKey] = useState(0);

  const sheetsId = config?.sheetsId;

  if (!sheetsId) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-sm text-muted-foreground">
              No Google Sheet configured. Go to the Integration tab and set the Sheet ID.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const embedUrl = `https://docs.google.com/spreadsheets/d/${sheetsId}/preview?widget=true&headers=false&chrome=false&gid=0&single=false`;
  const directUrl = `https://docs.google.com/spreadsheets/d/${sheetsId}/edit`;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {TABS.map(tab => (
            <Button
              key={tab}
              size="sm"
              variant={activeTab === tab ? "default" : "outline"}
              onClick={() => setActiveTab(tab)}
              className="text-xs h-8"
            >
              {tab}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setReloadKey(k => k + 1)}
            className="h-8 text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Reload
          </Button>
          <a href={directUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" className="h-8 text-xs">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Open in Sheets
            </Button>
          </a>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <iframe
            key={`${activeTab}-${reloadKey}`}
            src={`https://docs.google.com/spreadsheets/d/${sheetsId}/htmlembed?widget=true&headers=false&chrome=false&gid=0&range=A1:Z10000&sheet=${encodeURIComponent(activeTab)}`}
            className="w-full border-0 rounded-lg"
            style={{ height: "calc(100vh - 220px)", minHeight: "500px" }}
            title={`Google Sheet - ${activeTab}`}
          />
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground text-center">
        Sheet must be shared as "Anyone with the link" to display here. Changes in Google Sheets will reflect after clicking Reload or Sync Now.
      </p>
    </div>
  );
}
