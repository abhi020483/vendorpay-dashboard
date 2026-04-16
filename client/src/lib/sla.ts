export const SLA_THRESHOLDS = {
  Regular: { alert: 12, escalate: 15, label: "15 business days" },
  Occasional: { alert: 17, escalate: 21, label: "21 business days" },
  "One-time": { alert: 25, escalate: 30, label: "30 business days" },
} as const;

export type SlaStatus = "normal" | "alert" | "escalate";

export function getSlaStatus(category: string, ageDays: number): SlaStatus {
  const thresholds = SLA_THRESHOLDS[category as keyof typeof SLA_THRESHOLDS];
  if (!thresholds) return "normal";
  if (ageDays >= thresholds.escalate) return "escalate";
  if (ageDays >= thresholds.alert) return "alert";
  return "normal";
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
