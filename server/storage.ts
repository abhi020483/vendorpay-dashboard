import {
  type Vendor, type InsertVendor, vendors,
  type Invoice, type InsertInvoice, invoices,
  type Payment, type InsertPayment, payments,
  type SyncConfig, type InsertSyncConfig, syncConfig,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

export interface IStorage {
  // Vendors
  getVendors(): Promise<Vendor[]>;
  getVendor(id: number): Promise<Vendor | undefined>;
  createVendor(vendor: InsertVendor): Promise<Vendor>;
  updateVendor(id: number, vendor: Partial<InsertVendor>): Promise<Vendor | undefined>;
  deleteVendor(id: number): Promise<void>;

  // Invoices
  getInvoices(): Promise<Invoice[]>;
  getInvoice(id: number): Promise<Invoice | undefined>;
  getInvoicesByVendor(vendorId: number): Promise<Invoice[]>;
  createInvoice(invoice: InsertInvoice): Promise<Invoice>;
  updateInvoice(id: number, invoice: Partial<InsertInvoice>): Promise<Invoice | undefined>;
  deleteInvoice(id: number): Promise<void>;

  // Payments
  getPayments(): Promise<Payment[]>;
  getPaymentsByVendor(vendorId: number): Promise<Payment[]>;
  getPaymentsByInvoice(invoiceId: number): Promise<Payment[]>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  deleteAllPayments(): Promise<void>;
  deleteAllVendors(): Promise<void>;
  deleteAllInvoices(): Promise<void>;

  // Sync Config
  getSyncConfig(): Promise<SyncConfig | undefined>;
  upsertSyncConfig(config: Partial<InsertSyncConfig>): Promise<SyncConfig>;
}

export class DatabaseStorage implements IStorage {
  // Vendors
  async getVendors(): Promise<Vendor[]> {
    return db.select().from(vendors).all();
  }

  async getVendor(id: number): Promise<Vendor | undefined> {
    return db.select().from(vendors).where(eq(vendors.id, id)).get();
  }

  async createVendor(vendor: InsertVendor): Promise<Vendor> {
    return db.insert(vendors).values(vendor).returning().get();
  }

  async updateVendor(id: number, vendor: Partial<InsertVendor>): Promise<Vendor | undefined> {
    return db.update(vendors).set(vendor).where(eq(vendors.id, id)).returning().get();
  }

  async deleteVendor(id: number): Promise<void> {
    db.delete(vendors).where(eq(vendors.id, id)).run();
  }

  // Invoices
  async getInvoices(): Promise<Invoice[]> {
    return db.select().from(invoices).orderBy(desc(invoices.invoiceDate)).all();
  }

  async getInvoice(id: number): Promise<Invoice | undefined> {
    return db.select().from(invoices).where(eq(invoices.id, id)).get();
  }

  async getInvoicesByVendor(vendorId: number): Promise<Invoice[]> {
    return db.select().from(invoices).where(eq(invoices.vendorId, vendorId)).all();
  }

  async createInvoice(invoice: InsertInvoice): Promise<Invoice> {
    return db.insert(invoices).values(invoice).returning().get();
  }

  async updateInvoice(id: number, invoice: Partial<InsertInvoice>): Promise<Invoice | undefined> {
    return db.update(invoices).set(invoice).where(eq(invoices.id, id)).returning().get();
  }

  async deleteInvoice(id: number): Promise<void> {
    db.delete(invoices).where(eq(invoices.id, id)).run();
  }

  // Payments
  async getPayments(): Promise<Payment[]> {
    return db.select().from(payments).orderBy(desc(payments.paymentDate)).all();
  }

  async getPaymentsByVendor(vendorId: number): Promise<Payment[]> {
    return db.select().from(payments).where(eq(payments.vendorId, vendorId)).all();
  }

  async getPaymentsByInvoice(invoiceId: number): Promise<Payment[]> {
    return db.select().from(payments).where(eq(payments.invoiceId, invoiceId)).all();
  }

  async createPayment(payment: InsertPayment): Promise<Payment> {
    return db.insert(payments).values(payment).returning().get();
  }

  async deleteAllPayments(): Promise<void> {
    db.delete(payments).run();
  }

  async deleteAllVendors(): Promise<void> {
    db.delete(vendors).run();
  }

  async deleteAllInvoices(): Promise<void> {
    db.delete(invoices).run();
  }

  // Sync Config
  async getSyncConfig(): Promise<SyncConfig | undefined> {
    return db.select().from(syncConfig).get();
  }

  async upsertSyncConfig(config: Partial<InsertSyncConfig>): Promise<SyncConfig> {
    const existing = await this.getSyncConfig();
    if (existing) {
      return db.update(syncConfig).set(config).where(eq(syncConfig.id, existing.id)).returning().get();
    }
    return db.insert(syncConfig).values(config as InsertSyncConfig).returning().get();
  }
}

export const storage = new DatabaseStorage();
