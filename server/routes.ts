import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertVendorSchema, insertInvoiceSchema, type Invoice } from "@shared/schema";
import { syncFromSheets, writeInvoiceStatus } from "./googleSheets";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ============ VENDORS ============
  app.get("/api/vendors", async (_req, res) => {
    const allVendors = await storage.getVendors();
    res.json(allVendors);
  });

  app.get("/api/vendors/:id", async (req, res) => {
    const vendor = await storage.getVendor(Number(req.params.id));
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });
    res.json(vendor);
  });

  app.post("/api/vendors", async (req, res) => {
    const parsed = insertVendorSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const vendor = await storage.createVendor(parsed.data);
    res.status(201).json(vendor);
  });

  app.patch("/api/vendors/:id", async (req, res) => {
    const vendor = await storage.updateVendor(Number(req.params.id), req.body);
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });
    res.json(vendor);
  });

  app.delete("/api/vendors/:id", async (req, res) => {
    await storage.deleteVendor(Number(req.params.id));
    res.status(204).end();
  });

  // ============ INVOICES ============
  app.get("/api/invoices", async (_req, res) => {
    const allInvoices = await storage.getInvoices();
    res.json(allInvoices);
  });

  app.get("/api/invoices/:id", async (req, res) => {
    const invoice = await storage.getInvoice(Number(req.params.id));
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    res.json(invoice);
  });

  app.get("/api/vendors/:id/invoices", async (req, res) => {
    const vendorInvoices = await storage.getInvoicesByVendor(Number(req.params.id));
    res.json(vendorInvoices);
  });

  app.get("/api/vendors/:id/payments", async (req, res) => {
    const vendorPayments = await storage.getPaymentsByVendor(Number(req.params.id));
    res.json(vendorPayments);
  });

  // ============ PAYMENTS ============
  app.get("/api/payments", async (_req, res) => {
    const all = await storage.getPayments();
    res.json(all);
  });

  app.post("/api/payments", async (req, res) => {
    const payment = await storage.createPayment(req.body);
    res.status(201).json(payment);
  });

  app.post("/api/invoices", async (req, res) => {
    const parsed = insertInvoiceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const invoice = await storage.createInvoice(parsed.data);
    res.status(201).json(invoice);
  });

  app.patch("/api/invoices/:id", async (req, res) => {
    const invoice = await storage.updateInvoice(Number(req.params.id), req.body);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    // Write status change back to Google Sheets (best-effort, non-blocking)
    const config = await storage.getSyncConfig();
    const sheetsId = config?.sheetsId || process.env.GOOGLE_SHEETS_ID;
    if (sheetsId && req.body.status) {
      const dateField = req.body.status === "Accepted" ? "AcceptanceDate" : req.body.status === "Paid" ? "PaymentDate" : "";
      const dateValue = req.body.acceptanceDate || req.body.paymentDate || "";
      if (dateField) {
        writeInvoiceStatus(sheetsId, invoice.invoiceNumber, req.body.status, dateField, dateValue).catch(() => {});
      }
    }

    res.json(invoice);
  });

  app.delete("/api/invoices/:id", async (req, res) => {
    await storage.deleteInvoice(Number(req.params.id));
    res.status(204).end();
  });

  // ============ DASHBOARD ANALYTICS ============
  app.get("/api/analytics/summary", async (_req, res) => {
    const allVendors = await storage.getVendors();
    const allInvoices = await storage.getInvoices();
    const allPayments = await storage.getPayments();

    // Calculate actual paid amount per invoice from payments
    const paidPerInvoice = new Map<number, number>();
    let totalAdvances = 0;
    const advancesByVendor = new Map<number, number>();
    allPayments.forEach(p => {
      if (p.invoiceId) {
        paidPerInvoice.set(p.invoiceId, (paidPerInvoice.get(p.invoiceId) || 0) + p.amount);
      } else {
        // Advance / on-account payment
        totalAdvances += p.amount;
        advancesByVendor.set(p.vendorId, (advancesByVendor.get(p.vendorId) || 0) + p.amount);
      }
    });

    const totalVendors = allVendors.length;
    const regularCount = allVendors.filter(v => v.category === "Regular").length;
    const occasionalCount = allVendors.filter(v => v.category === "Occasional").length;
    const oneTimeCount = allVendors.filter(v => v.category === "One-time").length;

    const totalPayouts = allInvoices.reduce((sum, inv) => sum + (inv.netPayable || 0), 0);
    const paidInvoices = allInvoices.filter(i => i.status === "Paid");
    // Pending = everything that's NOT Paid (i.e., no payment date / no "paid" status)
    const nonPaidInvoices = allInvoices.filter(i => i.status !== "Paid" && i.status !== "Rejected");
    const acceptedInvoices = allInvoices.filter(i => i.status === "Accepted");
    const totalPaid = paidInvoices.reduce((sum, inv) => sum + (inv.netPayable || 0), 0);
    const totalPending = nonPaidInvoices.reduce((sum, inv) => sum + (inv.netPayable || 0), 0);
    const totalAccepted = acceptedInvoices.reduce((sum, inv) => sum + (inv.netPayable || 0), 0);

    // Ageing data (spec buckets: 0-15, 16-30, 31-45, 46-60, 60+)
    const now = new Date();
    const ageingBuckets = { "0-15": 0, "16-30": 0, "31-45": 0, "46-60": 0, "60+": 0 };
    allInvoices.forEach(inv => {
      if (inv.status === "Paid") return;
      const receiptDate = new Date(inv.receiptDate);
      const days = Math.floor((now.getTime() - receiptDate.getTime()) / (1000 * 60 * 60 * 24));
      if (days <= 15) ageingBuckets["0-15"]++;
      else if (days <= 30) ageingBuckets["16-30"]++;
      else if (days <= 45) ageingBuckets["31-45"]++;
      else if (days <= 60) ageingBuckets["46-60"]++;
      else ageingBuckets["60+"]++;
    });

    // Service-wise split
    const serviceSplit: Record<string, number> = {};
    allInvoices.forEach(inv => {
      const vendor = allVendors.find(v => v.id === inv.vendorId);
      if (vendor) {
        serviceSplit[vendor.service] = (serviceSplit[vendor.service] || 0) + inv.netPayable;
      }
    });

    // Vendor-wise business
    const vendorBusiness: Record<string, { name: string; category: string; service: string; total: number; count: number }> = {};
    allInvoices.forEach(inv => {
      const vendor = allVendors.find(v => v.id === inv.vendorId);
      if (vendor) {
        if (!vendorBusiness[vendor.name]) {
          vendorBusiness[vendor.name] = { name: vendor.name, category: vendor.category, service: vendor.service, total: 0, count: 0 };
        }
        vendorBusiness[vendor.name].total += inv.netPayable;
        vendorBusiness[vendor.name].count += 1;
      }
    });

    // Monthly trend by invoice date
    const monthlyPayouts: Record<string, number> = {};
    const monthlyCount: Record<string, number> = {};
    allInvoices.forEach(inv => {
      const date = inv.invoiceDate;
      if (date) {
        const month = date.substring(0, 7); // YYYY-MM
        monthlyPayouts[month] = (monthlyPayouts[month] || 0) + inv.netPayable;
        monthlyCount[month] = (monthlyCount[month] || 0) + 1;
      }
    });

    // Weekly trend by invoice date
    const weeklyPayouts: Record<string, number> = {};
    const weeklyCount: Record<string, number> = {};
    allInvoices.forEach(inv => {
      const date = inv.invoiceDate;
      if (date) {
        const d = new Date(date);
        // Get ISO week start (Monday)
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const weekStart = new Date(d.setDate(diff));
        const key = weekStart.toISOString().split("T")[0]; // YYYY-MM-DD of Monday
        weeklyPayouts[key] = (weeklyPayouts[key] || 0) + inv.netPayable;
        weeklyCount[key] = (weeklyCount[key] || 0) + 1;
      }
    });

    // Vendor-wise ageing
    const vendorAgeing: Array<{ vendorName: string; avgDays: number; invoiceCount: number; totalAmount: number }> = [];
    const vendorGroups: Record<number, Invoice[]> = {};
    allInvoices.forEach(inv => {
      if (!vendorGroups[inv.vendorId]) vendorGroups[inv.vendorId] = [];
      vendorGroups[inv.vendorId].push(inv);
    });

    Object.entries(vendorGroups).forEach(([vendorId, invs]) => {
      const vendor = allVendors.find(v => v.id === Number(vendorId));
      if (!vendor) return;
      let totalDays = 0;
      let count = 0;
      let totalAmt = 0;
      invs.forEach(inv => {
        if (inv.paymentDate && inv.receiptDate) {
          const days = Math.floor(
            (new Date(inv.paymentDate).getTime() - new Date(inv.receiptDate).getTime()) / (1000 * 60 * 60 * 24)
          );
          totalDays += days;
          count++;
        }
        totalAmt += inv.netPayable;
      });
      vendorAgeing.push({
        vendorName: vendor.name,
        avgDays: count > 0 ? Math.round(totalDays / count) : 0,
        invoiceCount: invs.length,
        totalAmount: totalAmt,
      });
    });

    // Vendor-wise ageing buckets (amounts in each bucket per vendor)
    const vendorAgeingBuckets: Array<{
      vendorId: number; vendorName: string; category: string;
      buckets: Record<string, number>; total: number;
    }> = [];
    Object.entries(vendorGroups).forEach(([vendorId, invs]) => {
      const vendor = allVendors.find(v => v.id === Number(vendorId));
      if (!vendor) return;
      const buckets: Record<string, number> = { "0-15": 0, "16-30": 0, "31-45": 0, "46-60": 0, "60+": 0 };
      let total = 0;
      invs.forEach(inv => {
        if (inv.status === "Paid") return;
        const receiptDate = new Date(inv.receiptDate);
        const days = Math.floor((now.getTime() - receiptDate.getTime()) / (1000 * 60 * 60 * 24));
        const amt = inv.netPayable || 0;
        if (days <= 15) buckets["0-15"] += amt;
        else if (days <= 30) buckets["16-30"] += amt;
        else if (days <= 45) buckets["31-45"] += amt;
        else if (days <= 60) buckets["46-60"] += amt;
        else buckets["60+"] += amt;
        total += amt;
      });
      if (total > 0) {
        vendorAgeingBuckets.push({ vendorId: Number(vendorId), vendorName: vendor.name, category: vendor.category, buckets, total });
      }
    });

    // Calculate real paid and outstanding from payment records
    const totalActualPaid = Array.from(paidPerInvoice.values()).reduce((s, v) => s + v, 0) + totalAdvances;
    const totalOutstanding = allInvoices.reduce((sum, inv) => {
      if (inv.status === "Paid") return sum;
      const paidAmount = paidPerInvoice.get(inv.id) || 0;
      return sum + Math.max(0, (inv.netPayable || 0) - paidAmount);
    }, 0);

    res.json({
      totalVendors,
      vendorSplit: { regular: regularCount, occasional: occasionalCount, oneTime: oneTimeCount },
      totalPayouts,
      totalPaid: Math.max(totalPaid, totalActualPaid),
      totalPending,
      totalAccepted,
      totalOutstanding,
      totalAdvances,
      invoiceCount: allInvoices.length,
      ageingBuckets,
      serviceSplit,
      vendorBusiness: Object.values(vendorBusiness),
      monthlyPayouts,
      monthlyCount,
      weeklyPayouts,
      weeklyCount,
      vendorAgeing,
      vendorAgeingBuckets,
      advancesByVendor: Array.from(advancesByVendor.entries()).map(([vid, amt]) => {
        const v = allVendors.find(vv => vv.id === vid);
        return { vendorId: vid, vendorName: v?.name || "Unknown", amount: amt };
      }),
    });
  });

  // ============ SYNC CONFIG ============
  app.get("/api/sync-config", async (_req, res) => {
    const config = await storage.getSyncConfig();
    res.json(config || { sheetsId: null, sheetsUrl: null, lastSyncAt: null, status: "idle" });
  });

  app.patch("/api/sync-config", async (req, res) => {
    const config = await storage.upsertSyncConfig(req.body);
    res.json(config);
  });

  app.post("/api/sync/trigger", async (_req, res) => {
    const config = await storage.getSyncConfig();
    const sheetsId = config?.sheetsId || process.env.GOOGLE_SHEETS_ID;

    if (!sheetsId) {
      return res.status(400).json({ error: "No Google Sheet ID configured. Set it in the Integration tab or via GOOGLE_SHEETS_ID env var." });
    }

    await storage.upsertSyncConfig({ status: "syncing" });
    res.json({ message: "Sync started" });

    // Run sync in background
    try {
      const result = await syncFromSheets(sheetsId);
      await storage.upsertSyncConfig({
        status: "success",
        lastSyncAt: new Date().toISOString(),
        sheetsId,
      });
      console.log(`Sync complete: ${result.vendors} vendors, ${result.invoices} invoices, ${result.payments} payments matched, ${result.advances} advances`);
    } catch (err: any) {
      console.error("Sync failed:", err.message);
      await storage.upsertSyncConfig({ status: "error" });
    }
  });

  // ============ BULK IMPORT API ============

  // POST /api/import/vendors — bulk import vendors as JSON array
  app.post("/api/import/vendors", async (req, res) => {
    const vendors = req.body;
    if (!Array.isArray(vendors)) return res.status(400).json({ error: "Expected JSON array of vendors" });
    let created = 0;
    for (const v of vendors) {
      try {
        await storage.createVendor({
          name: v.name || v.VendorName || v.vendorName || "Unknown",
          category: v.category || v.Category || "Regular",
          service: v.service || v.ServiceType || v.serviceType || "General Services",
          contactPerson: v.contactPerson || v.ContactPerson || null,
          email: v.email || v.Email || null,
          phone: v.phone || v.Phone || null,
          gstin: v.gstin || v.GSTIN || null,
          pan: v.pan || v.PAN || v.panNo || null,
          bankAccount: v.bankAccount || v.BankAccount || null,
          ifsc: v.ifsc || v.IFSC || null,
          address: v.address || v.Address || null,
          status: v.status || v.Status || "Active",
        });
        created++;
      } catch (err) { /* skip duplicates */ }
    }
    res.json({ message: `Imported ${created} vendors`, count: created });
  });

  // POST /api/import/invoices — bulk import invoices as JSON array
  app.post("/api/import/invoices", async (req, res) => {
    const invoices = req.body;
    if (!Array.isArray(invoices)) return res.status(400).json({ error: "Expected JSON array of invoices" });

    const allVendors = await storage.getVendors();
    const vendorMap = new Map<string, number>();
    allVendors.forEach(v => vendorMap.set(v.name.toLowerCase(), v.id));

    let created = 0;
    let vendorsCreated = 0;
    for (const inv of invoices) {
      const vendorName = inv.vendorName || inv.VendorName || inv["Vendor Name"] || "";
      let vendorId = inv.vendorId;

      // Auto-resolve vendor by name if vendorId not provided
      if (!vendorId && vendorName) {
        vendorId = vendorMap.get(vendorName.toLowerCase());
        // Auto-create vendor if not found
        if (!vendorId) {
          const newVendor = await storage.createVendor({
            name: vendorName,
            category: "Regular",
            service: "General Services",
            status: "Active",
            contactPerson: null, email: null, phone: null,
            gstin: null, pan: null, bankAccount: null, ifsc: null, address: null,
          });
          vendorId = newVendor.id;
          vendorMap.set(vendorName.toLowerCase(), vendorId);
          vendorsCreated++;
        }
      }
      if (!vendorId) continue;

      const amount = parseFloat(inv.amount || inv.BaseAmount || inv.baseAmount || 0);
      const gst = parseFloat(inv.gstAmount || inv.GSTAmount || inv.gst || 0);
      const tds = parseFloat(inv.tdsAmount || inv.TDSAmount || inv.tds || 0);

      try {
        await storage.createInvoice({
          vendorId,
          invoiceNumber: inv.invoiceNumber || inv.InvoiceNumber || inv["Invoice No"] || `INV-${Date.now()}`,
          invoiceDate: inv.invoiceDate || inv.InvoiceDate || new Date().toISOString().split("T")[0],
          receiptDate: inv.receiptDate || inv.ReceiptDate || inv.invoiceDate || inv.InvoiceDate || new Date().toISOString().split("T")[0],
          acceptanceDate: inv.acceptanceDate || inv.AcceptanceDate || null,
          paymentDate: inv.paymentDate || inv.PaymentDate || null,
          amount,
          gstAmount: gst,
          tdsAmount: tds,
          netPayable: parseFloat(inv.netPayable || inv.NetPayable || 0) || (amount + gst - tds),
          status: inv.status || inv.Status || "Pending",
          description: inv.description || inv.Description || null,
          paymentMode: inv.paymentMode || inv.PaymentMode || null,
          paymentReference: inv.paymentReference || inv.PaymentReference || null,
        });
        created++;
      } catch (err) { /* skip errors */ }
    }
    res.json({ message: `Imported ${created} invoices, auto-created ${vendorsCreated} vendors`, invoices: created, vendors: vendorsCreated });
  });

  // POST /api/import/tally-xml — accept TallyPrime XML voucher data
  app.post("/api/import/tally-xml", async (req, res) => {
    const rawBody = req.body;
    // Accept raw XML string or JSON with xml field
    const xml = typeof rawBody === "string" ? rawBody : rawBody?.xml;
    if (!xml) return res.status(400).json({ error: "Expected XML body or JSON with 'xml' field" });

    // Simple XML parser for Tally voucher export format
    const vouchers: Array<any> = [];
    const voucherRegex = /<VOUCHER[^>]*>([\s\S]*?)<\/VOUCHER>/gi;
    let match;
    while ((match = voucherRegex.exec(xml)) !== null) {
      const block = match[1];
      const get = (tag: string) => {
        const m = block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, "i"));
        return m ? m[1].trim() : "";
      };
      vouchers.push({
        date: get("DATE"),
        voucherType: get("VOUCHERTYPENAME"),
        voucherNumber: get("VOUCHERNUMBER"),
        partyName: get("PARTYLEDGERNAME"),
        amount: Math.abs(parseFloat(get("AMOUNT")) || 0),
        narration: get("NARRATION"),
      });
    }

    if (vouchers.length === 0) {
      return res.status(400).json({ error: "No vouchers found in XML. Ensure it contains <VOUCHER> elements." });
    }

    // Get or create vendors
    const allVendors = await storage.getVendors();
    const vendorMap = new Map<string, number>();
    allVendors.forEach(v => vendorMap.set(v.name.toLowerCase(), v.id));

    let invoicesCreated = 0;
    let vendorsCreated = 0;

    for (const v of vouchers) {
      if (!v.partyName) continue;

      let vendorId = vendorMap.get(v.partyName.toLowerCase());
      if (!vendorId) {
        const newVendor = await storage.createVendor({
          name: v.partyName, category: "Regular", service: "General Services",
          status: "Active", contactPerson: null, email: null, phone: null,
          gstin: null, pan: null, bankAccount: null, ifsc: null, address: null,
        });
        vendorId = newVendor.id;
        vendorMap.set(v.partyName.toLowerCase(), vendorId);
        vendorsCreated++;
      }

      // Convert Tally date (YYYYMMDD) to YYYY-MM-DD
      const dateStr = v.date.length === 8
        ? `${v.date.slice(0, 4)}-${v.date.slice(4, 6)}-${v.date.slice(6, 8)}`
        : v.date;

      const isPurchase = /purchase|journal/i.test(v.voucherType);
      const status = /payment/i.test(v.voucherType) ? "Paid" : "Pending";

      await storage.createInvoice({
        vendorId,
        invoiceNumber: v.voucherNumber || `TALLY-${Date.now()}`,
        invoiceDate: dateStr,
        receiptDate: dateStr,
        acceptanceDate: status === "Paid" ? dateStr : null,
        paymentDate: status === "Paid" ? dateStr : null,
        amount: v.amount,
        gstAmount: 0,
        tdsAmount: 0,
        netPayable: v.amount,
        status,
        description: v.narration || `${v.voucherType} voucher`,
        paymentMode: /payment/i.test(v.voucherType) ? "NEFT" : null,
        paymentReference: null,
      });
      invoicesCreated++;
    }

    res.json({
      message: `Imported ${invoicesCreated} vouchers from Tally XML`,
      vouchers: invoicesCreated,
      vendors: vendorsCreated,
    });
  });

  // DELETE /api/import/clear — clear all data for fresh import
  app.delete("/api/import/clear", async (_req, res) => {
    const invoices = await storage.getInvoices();
    for (const inv of invoices) await storage.deleteInvoice(inv.id);
    const vendors = await storage.getVendors();
    for (const v of vendors) await storage.deleteVendor(v.id);
    res.json({ message: "All data cleared", vendorsDeleted: vendors.length, invoicesDeleted: invoices.length });
  });

  // Seed sample data
  app.post("/api/seed", async (_req, res) => {
    const existingVendors = await storage.getVendors();
    if (existingVendors.length > 0) {
      return res.json({ message: "Data already seeded" });
    }

    const sampleVendors = [
      { name: "TechServ Solutions", category: "Regular", service: "IT Services", contactPerson: "Raj Mehta", email: "raj@techserv.in", phone: "9876543210", gstin: "27AABCT1234F1Z5", pan: "AABCT1234F", status: "Active" },
      { name: "FastTrack Logistics", category: "Regular", service: "Logistics", contactPerson: "Priya Sharma", email: "priya@fasttrack.in", phone: "9876543211", gstin: "27AABCF5678G1Z6", pan: "AABCF5678G", status: "Active" },
      { name: "BrandMax Agency", category: "Occasional", service: "Marketing", contactPerson: "Anil Kumar", email: "anil@brandmax.in", phone: "9876543212", gstin: "27AABCB9012H1Z7", pan: "AABCB9012H", status: "Active" },
      { name: "CleanSpace Facility Mgmt", category: "Regular", service: "Facility Management", contactPerson: "Suresh Patel", email: "suresh@cleanspace.in", phone: "9876543213", gstin: "27AABCC3456I1Z8", pan: "AABCC3456I", status: "Active" },
      { name: "LegalEase Advisors", category: "Occasional", service: "Legal & Compliance", contactPerson: "Adv. Neha Gupta", email: "neha@legalease.in", phone: "9876543214", gstin: "27AABCL7890J1Z9", pan: "AABCL7890J", status: "Active" },
      { name: "PrintHub India", category: "One-time", service: "Printing & Stationery", contactPerson: "Deepak Jain", email: "deepak@printhub.in", phone: "9876543215", gstin: "27AABCP2345K1Z0", pan: "AABCP2345K", status: "Active" },
      { name: "Skynet Cloud Services", category: "Regular", service: "IT Services", contactPerson: "Vikram Singh", email: "vikram@skynet.in", phone: "9876543216", gstin: "27AABCS6789L1Z1", pan: "AABCS6789L", status: "Active" },
      { name: "GreenLeaf Interiors", category: "One-time", service: "Interior Design", contactPerson: "Meera Reddy", email: "meera@greenleaf.in", phone: "9876543217", gstin: "27AABCG1234M1Z2", pan: "AABCG1234M", status: "Active" },
      { name: "SafeGuard Security", category: "Regular", service: "Security Services", contactPerson: "Ravi Mishra", email: "ravi@safeguard.in", phone: "9876543218", gstin: "27AABCS5678N1Z3", pan: "AABCS5678N", status: "Active" },
      { name: "ProAudit Consultants", category: "Occasional", service: "Audit & Consulting", contactPerson: "CA Amit Joshi", email: "amit@proaudit.in", phone: "9876543219", gstin: "27AABCP9012O1Z4", pan: "AABCP9012O", status: "Active" },
      { name: "QuickFix Maintenance", category: "Regular", service: "AMC & Maintenance", contactPerson: "Sanjay Verma", email: "sanjay@quickfix.in", phone: "9876543220", gstin: "27AABCQ3456P1Z5", pan: "AABCQ3456P", status: "Active" },
      { name: "DataPrime Analytics", category: "Occasional", service: "Data & Analytics", contactPerson: "Dr. Kavita Rao", email: "kavita@dataprime.in", phone: "9876543221", gstin: "27AABCD7890Q1Z6", pan: "AABCD7890Q", status: "Active" },
    ];

    const createdVendors: any[] = [];
    for (const v of sampleVendors) {
      const created = await storage.createVendor(v as any);
      createdVendors.push(created);
    }

    // Sample invoices spread across months
    const sampleInvoices = [
      { vendorId: 1, invoiceNumber: "TS-2025-001", invoiceDate: "2025-10-05", receiptDate: "2025-10-08", acceptanceDate: "2025-10-10", paymentDate: "2025-10-25", amount: 250000, gstAmount: 45000, tdsAmount: 25000, netPayable: 270000, status: "Paid", description: "Monthly IT support Oct", paymentMode: "NEFT" },
      { vendorId: 1, invoiceNumber: "TS-2025-002", invoiceDate: "2025-11-05", receiptDate: "2025-11-07", acceptanceDate: "2025-11-09", paymentDate: "2025-11-22", amount: 250000, gstAmount: 45000, tdsAmount: 25000, netPayable: 270000, status: "Paid", description: "Monthly IT support Nov", paymentMode: "NEFT" },
      { vendorId: 1, invoiceNumber: "TS-2025-003", invoiceDate: "2025-12-05", receiptDate: "2025-12-08", acceptanceDate: "2025-12-10", paymentDate: "2025-12-28", amount: 250000, gstAmount: 45000, tdsAmount: 25000, netPayable: 270000, status: "Paid", description: "Monthly IT support Dec", paymentMode: "NEFT" },
      { vendorId: 1, invoiceNumber: "TS-2026-001", invoiceDate: "2026-01-05", receiptDate: "2026-01-07", acceptanceDate: "2026-01-09", paymentDate: "2026-01-20", amount: 275000, gstAmount: 49500, tdsAmount: 27500, netPayable: 297000, status: "Paid", description: "Monthly IT support Jan", paymentMode: "NEFT" },
      { vendorId: 1, invoiceNumber: "TS-2026-002", invoiceDate: "2026-02-05", receiptDate: "2026-02-07", acceptanceDate: "2026-02-10", paymentDate: "2026-02-25", amount: 275000, gstAmount: 49500, tdsAmount: 27500, netPayable: 297000, status: "Paid", description: "Monthly IT support Feb", paymentMode: "NEFT" },
      { vendorId: 1, invoiceNumber: "TS-2026-003", invoiceDate: "2026-03-05", receiptDate: "2026-03-08", acceptanceDate: null, paymentDate: null, amount: 275000, gstAmount: 49500, tdsAmount: 27500, netPayable: 297000, status: "Pending", description: "Monthly IT support Mar", paymentMode: null },
      { vendorId: 2, invoiceNumber: "FT-2025-010", invoiceDate: "2025-10-12", receiptDate: "2025-10-14", acceptanceDate: "2025-10-16", paymentDate: "2025-11-05", amount: 180000, gstAmount: 32400, tdsAmount: 18000, netPayable: 194400, status: "Paid", description: "Q3 logistics services", paymentMode: "RTGS" },
      { vendorId: 2, invoiceNumber: "FT-2026-001", invoiceDate: "2026-01-15", receiptDate: "2026-01-18", acceptanceDate: "2026-01-20", paymentDate: "2026-02-10", amount: 195000, gstAmount: 35100, tdsAmount: 19500, netPayable: 210600, status: "Paid", description: "Q4 logistics services", paymentMode: "RTGS" },
      { vendorId: 2, invoiceNumber: "FT-2026-002", invoiceDate: "2026-03-01", receiptDate: "2026-03-03", acceptanceDate: "2026-03-05", paymentDate: null, amount: 195000, gstAmount: 35100, tdsAmount: 19500, netPayable: 210600, status: "Accepted", description: "Jan-Feb logistics", paymentMode: null },
      { vendorId: 3, invoiceNumber: "BM-2025-005", invoiceDate: "2025-11-20", receiptDate: "2025-11-22", acceptanceDate: "2025-11-25", paymentDate: "2025-12-15", amount: 450000, gstAmount: 81000, tdsAmount: 45000, netPayable: 486000, status: "Paid", description: "Brand campaign Q3", paymentMode: "NEFT" },
      { vendorId: 3, invoiceNumber: "BM-2026-001", invoiceDate: "2026-02-10", receiptDate: "2026-02-12", acceptanceDate: "2026-02-14", paymentDate: "2026-03-10", amount: 350000, gstAmount: 63000, tdsAmount: 35000, netPayable: 378000, status: "Paid", description: "Digital marketing Feb", paymentMode: "NEFT" },
      { vendorId: 4, invoiceNumber: "CS-2025-012", invoiceDate: "2025-12-01", receiptDate: "2025-12-03", acceptanceDate: "2025-12-05", paymentDate: "2025-12-20", amount: 85000, gstAmount: 15300, tdsAmount: 8500, netPayable: 91800, status: "Paid", description: "Monthly facility Dec", paymentMode: "NEFT" },
      { vendorId: 4, invoiceNumber: "CS-2026-001", invoiceDate: "2026-01-01", receiptDate: "2026-01-03", acceptanceDate: "2026-01-05", paymentDate: "2026-01-18", amount: 85000, gstAmount: 15300, tdsAmount: 8500, netPayable: 91800, status: "Paid", description: "Monthly facility Jan", paymentMode: "NEFT" },
      { vendorId: 4, invoiceNumber: "CS-2026-002", invoiceDate: "2026-02-01", receiptDate: "2026-02-03", acceptanceDate: "2026-02-05", paymentDate: "2026-02-18", amount: 85000, gstAmount: 15300, tdsAmount: 8500, netPayable: 91800, status: "Paid", description: "Monthly facility Feb", paymentMode: "NEFT" },
      { vendorId: 4, invoiceNumber: "CS-2026-003", invoiceDate: "2026-03-01", receiptDate: "2026-03-04", acceptanceDate: null, paymentDate: null, amount: 85000, gstAmount: 15300, tdsAmount: 8500, netPayable: 91800, status: "Pending", description: "Monthly facility Mar", paymentMode: null },
      { vendorId: 5, invoiceNumber: "LE-2026-001", invoiceDate: "2026-01-20", receiptDate: "2026-01-22", acceptanceDate: "2026-01-25", paymentDate: "2026-02-20", amount: 175000, gstAmount: 31500, tdsAmount: 17500, netPayable: 189000, status: "Paid", description: "Contract review services", paymentMode: "NEFT" },
      { vendorId: 5, invoiceNumber: "LE-2026-002", invoiceDate: "2026-03-10", receiptDate: "2026-03-12", acceptanceDate: null, paymentDate: null, amount: 120000, gstAmount: 21600, tdsAmount: 12000, netPayable: 129600, status: "Pending", description: "Compliance advisory", paymentMode: null },
      { vendorId: 6, invoiceNumber: "PH-2026-001", invoiceDate: "2026-02-15", receiptDate: "2026-02-17", acceptanceDate: "2026-02-18", paymentDate: "2026-03-05", amount: 65000, gstAmount: 11700, tdsAmount: 6500, netPayable: 70200, status: "Paid", description: "Annual stationery order", paymentMode: "UPI" },
      { vendorId: 7, invoiceNumber: "SC-2025-010", invoiceDate: "2025-10-10", receiptDate: "2025-10-12", acceptanceDate: "2025-10-14", paymentDate: "2025-10-30", amount: 320000, gstAmount: 57600, tdsAmount: 32000, netPayable: 345600, status: "Paid", description: "Cloud hosting Q3", paymentMode: "NEFT" },
      { vendorId: 7, invoiceNumber: "SC-2026-001", invoiceDate: "2026-01-10", receiptDate: "2026-01-12", acceptanceDate: "2026-01-14", paymentDate: "2026-01-28", amount: 340000, gstAmount: 61200, tdsAmount: 34000, netPayable: 367200, status: "Paid", description: "Cloud hosting Q4", paymentMode: "NEFT" },
      { vendorId: 7, invoiceNumber: "SC-2026-002", invoiceDate: "2026-03-10", receiptDate: "2026-03-12", acceptanceDate: "2026-03-14", paymentDate: null, amount: 340000, gstAmount: 61200, tdsAmount: 34000, netPayable: 367200, status: "Accepted", description: "Cloud hosting Jan-Mar", paymentMode: null },
      { vendorId: 8, invoiceNumber: "GL-2025-001", invoiceDate: "2025-11-05", receiptDate: "2025-11-07", acceptanceDate: "2025-11-10", paymentDate: "2025-12-01", amount: 850000, gstAmount: 153000, tdsAmount: 85000, netPayable: 918000, status: "Paid", description: "Office interior project", paymentMode: "RTGS" },
      { vendorId: 9, invoiceNumber: "SG-2025-012", invoiceDate: "2025-12-01", receiptDate: "2025-12-03", acceptanceDate: "2025-12-04", paymentDate: "2025-12-18", amount: 95000, gstAmount: 17100, tdsAmount: 9500, netPayable: 102600, status: "Paid", description: "Monthly security Dec", paymentMode: "NEFT" },
      { vendorId: 9, invoiceNumber: "SG-2026-001", invoiceDate: "2026-01-01", receiptDate: "2026-01-03", acceptanceDate: "2026-01-05", paymentDate: "2026-01-18", amount: 95000, gstAmount: 17100, tdsAmount: 9500, netPayable: 102600, status: "Paid", description: "Monthly security Jan", paymentMode: "NEFT" },
      { vendorId: 9, invoiceNumber: "SG-2026-002", invoiceDate: "2026-02-01", receiptDate: "2026-02-03", acceptanceDate: "2026-02-04", paymentDate: "2026-02-17", amount: 95000, gstAmount: 17100, tdsAmount: 9500, netPayable: 102600, status: "Paid", description: "Monthly security Feb", paymentMode: "NEFT" },
      { vendorId: 9, invoiceNumber: "SG-2026-003", invoiceDate: "2026-03-01", receiptDate: "2026-03-03", acceptanceDate: null, paymentDate: null, amount: 95000, gstAmount: 17100, tdsAmount: 9500, netPayable: 102600, status: "Pending", description: "Monthly security Mar", paymentMode: null },
      { vendorId: 10, invoiceNumber: "PA-2025-003", invoiceDate: "2025-12-15", receiptDate: "2025-12-17", acceptanceDate: "2025-12-19", paymentDate: "2026-01-10", amount: 225000, gstAmount: 40500, tdsAmount: 22500, netPayable: 243000, status: "Paid", description: "Annual audit FY25", paymentMode: "NEFT" },
      { vendorId: 11, invoiceNumber: "QF-2025-012", invoiceDate: "2025-12-05", receiptDate: "2025-12-07", acceptanceDate: "2025-12-09", paymentDate: "2025-12-22", amount: 45000, gstAmount: 8100, tdsAmount: 4500, netPayable: 48600, status: "Paid", description: "Monthly AMC Dec", paymentMode: "NEFT" },
      { vendorId: 11, invoiceNumber: "QF-2026-001", invoiceDate: "2026-01-05", receiptDate: "2026-01-07", acceptanceDate: "2026-01-09", paymentDate: "2026-01-22", amount: 45000, gstAmount: 8100, tdsAmount: 4500, netPayable: 48600, status: "Paid", description: "Monthly AMC Jan", paymentMode: "NEFT" },
      { vendorId: 11, invoiceNumber: "QF-2026-002", invoiceDate: "2026-02-05", receiptDate: "2026-02-07", acceptanceDate: "2026-02-09", paymentDate: "2026-02-22", amount: 45000, gstAmount: 8100, tdsAmount: 4500, netPayable: 48600, status: "Paid", description: "Monthly AMC Feb", paymentMode: "NEFT" },
      { vendorId: 11, invoiceNumber: "QF-2026-003", invoiceDate: "2026-03-05", receiptDate: "2026-03-07", acceptanceDate: null, paymentDate: null, amount: 45000, gstAmount: 8100, tdsAmount: 4500, netPayable: 48600, status: "Pending", description: "Monthly AMC Mar", paymentMode: null },
      { vendorId: 12, invoiceNumber: "DP-2026-001", invoiceDate: "2026-02-01", receiptDate: "2026-02-03", acceptanceDate: "2026-02-05", paymentDate: "2026-02-28", amount: 185000, gstAmount: 33300, tdsAmount: 18500, netPayable: 199800, status: "Paid", description: "Data analytics project", paymentMode: "NEFT" },
    ];

    for (const inv of sampleInvoices) {
      await storage.createInvoice(inv as any);
    }

    res.json({ message: "Sample data seeded successfully", vendors: sampleVendors.length, invoices: sampleInvoices.length });
  });

  return httpServer;
}
