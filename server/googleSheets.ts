import { storage } from "./storage";
import type { InsertVendor, InsertInvoice } from "@shared/schema";

// Fetch a Google Sheet tab as CSV using the public export URL
// Sheet must be "Published to web" OR shared as "Anyone with the link"
// URL format: https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv&sheet={TAB_NAME}
async function fetchSheetAsCSV(spreadsheetId: string, sheetName: string): Promise<Record<string, string>[]> {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url);

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 404 || text.includes("not found")) {
      throw new Error(`Sheet tab "${sheetName}" not found. Check the tab name in your Google Sheet.`);
    }
    throw new Error(`Failed to fetch sheet "${sheetName}": ${res.status} ${text.substring(0, 200)}`);
  }

  const csv = await res.text();
  return parseCSV(csv);
}

// Simple CSV parser that handles quoted fields with commas and newlines
function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        current.push(field.trim());
        field = "";
      } else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
        current.push(field.trim());
        field = "";
        if (current.some(c => c !== "")) rows.push(current);
        current = [];
        if (ch === '\r') i++;
      } else {
        field += ch;
      }
    }
  }
  // Last field
  current.push(field.trim());
  if (current.some(c => c !== "")) rows.push(current);

  if (rows.length < 2) return [];

  const headers = rows[0];
  return rows.slice(1).map(row => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = (row[i] || "").trim();
    });
    return obj;
  });
}

// Map a header name loosely (case-insensitive, ignore spaces/underscores)
function findCol(row: Record<string, string>, ...candidates: string[]): string {
  for (const c of candidates) {
    const key = Object.keys(row).find(k =>
      k.toLowerCase().replace(/[_\s]/g, "") === c.toLowerCase().replace(/[_\s]/g, "")
    );
    if (key && row[key]) return row[key];
  }
  return "";
}

function inferCategory(row: Record<string, string>): string {
  const cat = findCol(row, "Category", "VendorCategory", "Type");
  if (!cat) return "Regular";
  const normalized = cat.trim().toLowerCase();
  if (normalized === "regular") return "Regular";
  if (normalized === "occasional" || normalized === "occassional") return "Occasional";
  if (normalized === "one-time" || normalized === "onetime" || normalized === "rare") return "One-time";
  return "Regular";
}

function parseVendor(row: Record<string, string>): InsertVendor {
  return {
    name: findCol(row, "VendorName", "Vendor Name", "Name") || "Unknown",
    category: inferCategory(row),
    service: findCol(row, "ServiceType", "Service Type", "Service") || "General Services",
    contactPerson: findCol(row, "ContactPerson", "Contact Person", "Contact") || null,
    email: findCol(row, "Email", "EmailAddress", "E-mail") || null,
    phone: findCol(row, "Phone", "PhoneNumber", "Mobile") || null,
    gstin: findCol(row, "GSTIN", "GST", "GSTNumber") || null,
    pan: findCol(row, "PAN", "PANNumber", "PAN No", "Pan No", "PanNo") || null,
    bankAccount: findCol(row, "BankAccount", "Bank Account", "AccountNumber") || null,
    ifsc: findCol(row, "IFSC", "IFSCCode", "IFSC Code") || null,
    address: findCol(row, "Address", "FullAddress") || null,
    status: findCol(row, "Status") || "Active",
  };
}

// Parse dates like "01-Apr-25", "2025-04-01", "01/04/2025" to YYYY-MM-DD
function parseDate(val: string): string | null {
  if (!val) return null;
  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(val)) return val.substring(0, 10);
  // DD-MMM-YY or DD-MMM-YYYY (e.g., "01-Apr-25")
  const m = val.match(/^(\d{1,2})-(\w{3})-(\d{2,4})$/);
  if (m) {
    const months: Record<string, string> = { Jan:"01",Feb:"02",Mar:"03",Apr:"04",May:"05",Jun:"06",Jul:"07",Aug:"08",Sep:"09",Oct:"10",Nov:"11",Dec:"12" };
    const mon = months[m[2]];
    if (mon) {
      const yr = m[3].length === 2 ? `20${m[3]}` : m[3];
      return `${yr}-${mon}-${m[1].padStart(2, "0")}`;
    }
  }
  // DD/MM/YYYY
  const m2 = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2) return `${m2[3]}-${m2[2].padStart(2, "0")}-${m2[1].padStart(2, "0")}`;
  // Try native Date parsing as last resort
  const d = new Date(val);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  return null;
}

function parseInvoice(row: Record<string, string>, vendorNameToId: Map<string, number>): InsertInvoice | null {
  const vendorName = findCol(row, "VendorName", "Vendor Name", "Vendor");
  const vendorId = vendorNameToId.get(vendorName);
  if (!vendorId) return null;

  const amount = parseFloat(findCol(row, "BaseAmount", "Base Amount", "Amount")) || 0;
  const gst = parseFloat(findCol(row, "GSTAmount", "GST Amount", "GST")) || 0;
  const tds = parseFloat(findCol(row, "TDSAmount", "TDS Amount", "TDS")) || 0;
  const netPayable = parseFloat(findCol(row, "NetPayable", "Net Payable")) || (amount + gst - tds);
  const status = findCol(row, "Status") || "Pending";

  const invoiceDate = parseDate(findCol(row, "InvoiceDate", "Invoice Date")) || new Date().toISOString().split("T")[0];
  const receiptDate = parseDate(findCol(row, "ReceiptDate", "Receipt Date")) || invoiceDate;

  return {
    vendorId,
    invoiceNumber: findCol(row, "InvoiceID", "InvoiceNumber", "Invoice Number", "Invoice No", "Invoice #", "Inv ID") || `INV-${Date.now()}`,
    invoiceDate,
    receiptDate,
    acceptanceDate: parseDate(findCol(row, "AcceptanceDate", "Acceptance Date")),
    paymentDate: parseDate(findCol(row, "PaymentDate", "Payment Date")),
    amount,
    gstAmount: gst,
    tdsAmount: tds,
    netPayable,
    status: ["Pending", "Accepted", "Paid", "Rejected"].includes(status) ? status : "Pending",
    description: findCol(row, "Description", "Narration", "Remarks") || null,
    paymentMode: findCol(row, "PaymentMode", "Payment Mode", "Mode") || null,
    paymentReference: findCol(row, "PaymentReference", "Payment Reference", "Reference") || null,
  };
}

// No-op write-back (CSV approach is read-only)
export async function writeInvoiceStatus(
  _spreadsheetId: string,
  _invoiceNumber: string,
  _status: string,
  _dateField: string,
  _dateValue: string
) {
  // Write-back not supported with published CSV approach
  // Status updates are saved locally in SQLite only
}

// Main sync: fetch CSV from Google Sheets -> parse -> insert into SQLite
export async function syncFromSheets(spreadsheetId: string): Promise<{ vendors: number; invoices: number }> {
  // 1. Clear existing data
  const existingInvoices = await storage.getInvoices();
  for (const inv of existingInvoices) await storage.deleteInvoice(inv.id);
  const existingVendors = await storage.getVendors();
  for (const v of existingVendors) await storage.deleteVendor(v.id);

  const vendorNameToId = new Map<string, number>();

  // 2. Try to fetch Vendor Master tab
  try {
    const vendorRows = await fetchSheetAsCSV(spreadsheetId, "Vendor Master");
    for (const row of vendorRows) {
      const vendorData = parseVendor(row);
      if (!vendorData.name || vendorData.name === "Unknown") continue;
      const created = await storage.createVendor(vendorData);
      vendorNameToId.set(vendorData.name, created.id);
    }
  } catch (err: any) {
    console.log("Vendor Master tab not found or empty, will auto-create vendors from invoices");
  }

  // 3. Fetch Invoice Register tab
  let invoiceCount = 0;
  const invoiceRows = await fetchSheetAsCSV(spreadsheetId, "Invoice Register");
  if (invoiceRows.length === 0) {
    throw new Error('No data found in "Invoice Register" tab.');
  }

  // 4. Auto-create vendors from invoice data if Vendor Master was empty
  if (vendorNameToId.size === 0) {
    const uniqueVendors = new Set<string>();
    for (const row of invoiceRows) {
      const name = findCol(row, "VendorName", "Vendor Name", "Vendor");
      if (name && !uniqueVendors.has(name)) uniqueVendors.add(name);
    }

    // Count invoices per vendor to determine category
    const vendorInvCount = new Map<string, number>();
    for (const row of invoiceRows) {
      const name = findCol(row, "VendorName", "Vendor Name", "Vendor");
      if (name) vendorInvCount.set(name, (vendorInvCount.get(name) || 0) + 1);
    }

    for (const name of Array.from(uniqueVendors)) {
      const count = vendorInvCount.get(name) || 1;
      const category = count >= 6 ? "Regular" : count >= 2 ? "Occasional" : "One-time";
      const created = await storage.createVendor({
        name,
        category,
        service: "General Services",
        status: "Active",
        contactPerson: null, email: null, phone: null,
        gstin: null, pan: null, bankAccount: null, ifsc: null, address: null,
      });
      vendorNameToId.set(name, created.id);
    }
  }

  // 5. Insert invoices
  for (const row of invoiceRows) {
    const invoiceData = parseInvoice(row, vendorNameToId);
    if (invoiceData) {
      await storage.createInvoice(invoiceData);
      invoiceCount++;
    }
  }

  return { vendors: vendorNameToId.size, invoices: invoiceCount };
}
