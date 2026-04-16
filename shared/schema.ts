import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const vendors = sqliteTable("vendors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  category: text("category").notNull(), // Regular, Occasional, One-time
  service: text("service").notNull(), // IT Services, Logistics, Marketing, etc.
  contactPerson: text("contact_person"),
  email: text("email"),
  phone: text("phone"),
  gstin: text("gstin"),
  pan: text("pan"),
  bankAccount: text("bank_account"),
  ifsc: text("ifsc"),
  address: text("address"),
  status: text("status").notNull().default("Active"),
});

export const invoices = sqliteTable("invoices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  vendorId: integer("vendor_id").notNull(),
  invoiceNumber: text("invoice_number").notNull(),
  invoiceDate: text("invoice_date").notNull(),
  receiptDate: text("receipt_date").notNull(),
  acceptanceDate: text("acceptance_date"),
  paymentDate: text("payment_date"),
  amount: real("amount").notNull(),
  gstAmount: real("gst_amount").default(0),
  tdsAmount: real("tds_amount").default(0),
  netPayable: real("net_payable").notNull(),
  status: text("status").notNull().default("Pending"), // Pending, Accepted, Paid, Rejected
  description: text("description"),
  paymentMode: text("payment_mode"), // NEFT, RTGS, Cheque, UPI
  paymentReference: text("payment_reference"),
});

export const syncConfig = sqliteTable("sync_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sheetsId: text("sheets_id"),
  sheetsUrl: text("sheets_url"),
  lastSyncAt: text("last_sync_at"),
  status: text("status").notNull().default("idle"), // idle, syncing, success, error
});

export const insertVendorSchema = createInsertSchema(vendors).omit({ id: true });
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true });
export const insertSyncConfigSchema = createInsertSchema(syncConfig).omit({ id: true });

export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type Vendor = typeof vendors.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;
export type SyncConfig = typeof syncConfig.$inferSelect;
export type InsertSyncConfig = z.infer<typeof insertSyncConfigSchema>;
