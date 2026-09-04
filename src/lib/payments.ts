// ─── Payment provider abstraction ───────────────────────────────────────────
// Interface tunggal untuk gateway pembayaran. Implementasi nyata:
//   src/lib/providers/tripay.ts
// Service billing (src/lib/billing.ts) TIDAK pernah import Tripay langsung —
// hanya lewat fungsi ini, sehingga provider bisa diganti/ditambah tanpa
// menyentuh logika order.

export interface PaymentCreateInput {
  merchantRef: string;
  amount: number;
  customerName: string;
  customerEmail: string;
  items: { name: string; price: number; quantity: number }[];
  method: string;
  returnUrl: string;
  expiryMinutes: number;
}

export interface PaymentCreateResult {
  gatewayRef: string;
  payCode: string | null;
  checkoutUrl: string | null;
  payMethod: string;
  qrString: string | null;
}

export interface PaymentStatus {
  status: string; // PAID | UNPAID | EXPIRED | REFUND | FAILED
  paidAt: string | null;
}

export interface PaymentChannel {
  code: string;
  name: string;
  group: string;
  type: string;
  active: boolean;
}

export interface PaymentProvider {
  createPayment(input: PaymentCreateInput): Promise<PaymentCreateResult>;
  verifyCallback(
    bodyText: string,
    signatureHeader: string | null,
  ): Promise<{ merchantRef: string; status: string } | null>;
  checkStatus(gatewayRef: string): Promise<PaymentStatus>;
  listChannels(): Promise<PaymentChannel[]>;
}

import { createPaymentProvider as createTripayProvider } from "@/lib/providers/tripay";

/** Factory default: Tripay (satu-satunya provider terdaftar saat ini). */
export function getPaymentProvider(env?: Record<string, string | undefined>): PaymentProvider {
  return createTripayProvider(env);
}