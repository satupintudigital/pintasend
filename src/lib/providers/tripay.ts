// ─── Tripay payment provider (closed payment) ───────────────────────────────
// Fakta API (docs developer):
//   base sandbox  https://tripay.co.id/api-sandbox
//   base prod     https://tripay.co.id/api
//   header        Authorization: Bearer {TRIPAY_API_KEY}
//   create        POST /transaction/create
//                 body termasuk signature = HMAC-SHA256(TRIPAY_PRIVATE_KEY,
//                 `${method}${merchant_ref}${amount}`) — hex lowercase.
//                 respon: data.{reference, pay_code, checkout_url, qr_string}
//   status        GET  /transaction/detail?reference=
//                 respon: data.{status, paid_at} (PAID/UNPAID/EXPIRED/REFUND/FAILED)
//   channels      GET  /merchant/payment-channel
//                 respon: data[].{code, name, group, type, active}
//   callback      POST JSON; valid bila header `X-Callback-Signature` =
//                 HMAC-SHA256(TRIPAY_PRIVATE_KEY, raw body) hex lowercase;
//                 data.{merchant_ref, status}
// TRIPAY_MERCHANT_CODE dibaca & divalidasi ada (versi API saat ini tidak
// memakainya di body create — signature cukup method+ref+amount).

import { hmacSha256Hex } from "@/lib/hmac";
import type {
  PaymentProvider,
  PaymentCreateInput,
  PaymentCreateResult,
  PaymentStatus,
  PaymentChannel,
} from "@/lib/payments";

/** Signature penanda pembuatan pembayaran (HMAC hex lowercase). */
export async function tripaySignature(
  privateKey: string,
  method: string,
  merchantRef: string,
  amount: number,
): Promise<string> {
  return hmacSha256Hex(privateKey, `${method}${merchantRef}${amount}`);
}

function baseUrl(mode: string | undefined): string {
  return mode === "production" ? "https://tripay.co.id/api" : "https://tripay.co.id/api-sandbox";
}

/** Bandingkan dua hex HMAC secara konstan-waktu (hindari timing attack). */
function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function tripayFetch(
  env: Record<string, string | undefined>,
  path: string,
  init?: RequestInit,
): Promise<any> {
  const res = await fetch(`${baseUrl(env.TRIPAY_MODE)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.TRIPAY_API_KEY ?? ""}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const text = await res.text();
      if (text) message = text.slice(0, 300);
    } catch { /* ignore */ }
    throw new Error(`Tripay ${res.status}: ${message}`);
  }
  return res.json();
}

export function createPaymentProvider(
  env?: Record<string, string | undefined>,
): PaymentProvider {
  const e: Record<string, string | undefined> = env ?? (process.env as Record<string, string | undefined>);

  const requireKey = (key: string): string => {
    const v = String(e[key] ?? "").trim();
    if (!v) throw new Error(`Tripay: env ${key} belum diset`);
    return v;
  };

  return {
    async createPayment(input: PaymentCreateInput): Promise<PaymentCreateResult> {
      const privateKey = requireKey("TRIPAY_PRIVATE_KEY");
      requireKey("TRIPAY_API_KEY");
      requireKey("TRIPAY_MERCHANT_CODE");
      const signature = await tripaySignature(privateKey, "POST", input.merchantRef, input.amount);
      const body = {
        method: input.method,
        merchant_ref: input.merchantRef,
        amount: input.amount,
        customer_name: input.customerName,
        customer_email: input.customerEmail,
        order_items: input.items,
        return_url: input.returnUrl,
        expiry_time: input.expiryMinutes,
        signature,
      };
      const json = await tripayFetch(e, "/transaction/create", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const d = json?.data ?? {};
      return {
        gatewayRef: String(d.reference ?? ""),
        payCode: d.pay_code ?? null,
        checkoutUrl: d.checkout_url ?? null,
        payMethod: input.method,
        qrString: d.qr_string ?? null,
      };
    },

    async verifyCallback(
      bodyText: string,
      signatureHeader: string | null,
    ): Promise<{ merchantRef: string; status: string } | null> {
      if (!signatureHeader) return null;
      const privateKey = requireKey("TRIPAY_PRIVATE_KEY");
      const expected = await hmacSha256Hex(privateKey, bodyText);
      if (!constantTimeEqualHex(expected, signatureHeader.trim())) return null;
      try {
        const parsed = JSON.parse(bodyText);
        const data = parsed?.data ?? parsed;
        const merchantRef = String(data?.merchant_ref ?? "");
        const status = String(data?.status ?? "");
        if (!merchantRef || !status) return null;
        return { merchantRef, status };
      } catch {
        return null;
      }
    },

    async checkStatus(gatewayRef: string): Promise<PaymentStatus> {
      requireKey("TRIPAY_API_KEY");
      const json = await tripayFetch(e, `/transaction/detail?reference=${encodeURIComponent(gatewayRef)}`);
      const d = json?.data ?? {};
      return {
        status: String(d.status ?? "UNKNOWN"),
        paidAt: d.paid_at ?? null,
      };
    },

    async listChannels(): Promise<PaymentChannel[]> {
      requireKey("TRIPAY_API_KEY");
      const json = await tripayFetch(e, "/merchant/payment-channel");
      const rows: any[] = Array.isArray(json?.data) ? json.data : [];
      return rows.map((r) => ({
        code: String(r.code ?? ""),
        name: String(r.name ?? ""),
        group: String(r.group ?? ""),
        type: String(r.type ?? ""),
        active: Boolean(r.active),
      }));
    },
  };
}