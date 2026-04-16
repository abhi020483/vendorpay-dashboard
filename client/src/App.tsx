import { Switch, Route, Router, Link, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Vendors from "@/pages/vendors";
import Invoices from "@/pages/invoices";
import Ageing from "@/pages/ageing";
import TallyIntegration from "@/pages/tally-integration";
import { useState } from "react";
import {
  LayoutDashboard, Building2, FileText, Clock, Sheet,
  ChevronLeft, Menu
} from "lucide-react";

const NAV_ITEMS = [
  { path: "/", label: "Dashboard", title: "Dashboard Overview", icon: LayoutDashboard },
  { path: "/vendors", label: "Vendors", title: "Vendor Directory", icon: Building2 },
  { path: "/invoices", label: "Invoices", title: "Invoice Tracker", icon: FileText },
  { path: "/ageing", label: "Ageing", title: "Ageing Analysis", icon: Clock },
  { path: "/tally", label: "Integration", title: "Google Sheets & Tally Integration", icon: Sheet },
];

function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const currentNav = NAV_ITEMS.find(item =>
    item.path === "/" ? location === "/" : location.startsWith(item.path)
  );
  const pageTitle = currentNav?.title || "Dashboard";

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className={`${collapsed ? "w-[68px]" : "w-60"} flex-shrink-0 bg-sidebar text-sidebar-foreground flex flex-col transition-all duration-200`}>
        {/* Logo / Brand */}
        <div className={`h-16 flex items-center ${collapsed ? "justify-center px-2" : "px-5"} border-b border-sidebar-border`}>
          {!collapsed ? (
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <svg viewBox="0 0 20 20" className="h-5 w-5 text-white" fill="none">
                  <path d="M4 10L8 14L16 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-sm tracking-tight text-white">VendorPay</span>
                <span className="text-[10px] text-sidebar-foreground/50 uppercase tracking-wider">Dashboard</span>
              </div>
            </div>
          ) : (
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <svg viewBox="0 0 20 20" className="h-5 w-5 text-white" fill="none">
                <path d="M4 10L8 14L16 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          )}
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(item => {
            const isActive = item.path === "/" ? location === "/" : location.startsWith(item.path);
            const Icon = item.icon;
            return (
              <Link key={item.path} href={item.path}>
                <div
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] cursor-pointer transition-colors relative ${
                    isActive
                      ? "bg-sidebar-accent text-white font-medium"
                      : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  } ${collapsed ? "justify-center" : ""}`}
                >
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full" />
                  )}
                  <Icon className="flex-shrink-0" style={{ width: "18px", height: "18px" }} />
                  {!collapsed && <span>{item.label}</span>}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-2 border-t border-sidebar-border">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[13px] text-sidebar-foreground/60 hover:bg-sidebar-accent/50 transition-colors"
          >
            {collapsed ? <Menu className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-16 flex items-center justify-between px-6 bg-card border-b border-border flex-shrink-0">
          <h1 className="text-lg font-semibold text-foreground">{pageTitle}</h1>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">FY 2025-26</span>
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-xs font-semibold text-primary">OA</span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

function AppRouter() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/vendors" component={Vendors} />
        <Route path="/invoices" component={Invoices} />
        <Route path="/ageing" component={Ageing} />
        <Route path="/tally" component={TallyIntegration} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router hook={useHashLocation}>
          <AppRouter />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
