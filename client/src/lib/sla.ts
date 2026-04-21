// All vendors: 45-day standard payment window
export const SLA_DAYS = 45;
export const SLA_ALERT_DAYS = 40;

export const SLA_THRESHOLDS = {
  Regular: { alert: SLA_ALERT_DAYS, escalate: SLA_DAYS, label: "45 days" },
  Occasional: { alert: SLA_ALERT_DAYS, escalate: SLA_DAYS, label: "45 days" },
  "One-time": { alert: SLA_ALERT_DAYS, escalate: SLA_DAYS, label: "45 days" },
} as const;

export type SlaStatus = "normal" | "alert" | "escalate";

export function getSlaStatus(_category: string, ageDays: number): SlaStatus {
  if (ageDays >= SLA_DAYS) return "escalate";
  if (ageDays >= SLA_ALERT_DAYS) return "alert";
  return "normal";
}

// Due date classification
export function getDueClassification(ageDays: number): { label: string; color: string } {
  if (ageDays <= 30) return { label: "Current", color: "text-green-600" };
  if (ageDays <= 45) return { label: "Due Soon", color: "text-amber-600" };
  if (ageDays <= 60) return { label: "Overdue", color: "text-orange-600" };
  return { label: "Critical", color: "text-red-600" };
}

export function formatINR(amount: number): string {
  if (Math.abs(amount) >= 10000000) {
    return `₹${(amount / 10000000).toFixed(2)} Cr`;
  }
  if (Math.abs(amount) >= 100000) {
    return `₹${(amount / 100000).toFixed(2)} L`;
  }
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

export function getDaysAge(receiptDate: string, paymentDate?: string | null): number {
  const end = paymentDate ? new Date(paymentDate) : new Date();
  const start = new Date(receiptDate);
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
}
