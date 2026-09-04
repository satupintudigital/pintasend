import { getPaymentProvider } from "@/lib/payments";
import { finalizePaidOrder, getOrderAnyScope, markOrderExpiredFromGateway } from "@/lib/billing";

// ─── POST /api/billing/tripay/callback (webhook, TANPA session) ─────────────
// Dipanggil Tripay saat status pembayaran berubah (PAID / EXPIRED / dll).
//   - Keaslian diverifikasi HMAC-SHA256(private key, raw body) via provider
//     (verifyCallback) — header `X-Callback-Signature`.
//   - merchant_ref = order.id → finalisasi idempoten (status guard di
//     billing.ts), sehingga callback ganda aman.
//   - Selalu balas 200 setelah diproses (Tripay retry bila non-2xx); body raw
//     disimpan ke order.callbackRaw untuk audit.
//   - UNPAID/REFUND/FAILED → 200 tanpa aksi (jangan batalkan order PAID).

export async function POST(req: Request) {
  const bodyText = await req.text();
  try {
    const provider = getPaymentProvider();
    const verified = await provider.verifyCallback(bodyText, req.headers.get("X-Callback-Signature"));
    if (!verified) {
      console.error("billing/tripay callback: signature tidak sah, body ditolak");
      return Response.json({ ok: false }, { status: 401 });
    }

    // merchant_ref sudah diverifikasi HMAC → lookup tanpa scope tenant.
    const order = await getOrderAnyScope(verified.merchantRef);
    if (!order) {
      // Order tidak dikenal: balas 200 (bukan 404) — tidak membocorkan info &
      // mencegah Tripay mengulang callback yang tak berguna.
      return Response.json({ ok: true });
    }

    if (verified.status === "PAID") {
      await finalizePaidOrder(order.id, {
        gatewayRef: order.gatewayRef ?? verified.merchantRef,
        payMethod: order.payMethod ?? undefined,
        callbackRaw: bodyText,
      });
    } else if (verified.status === "EXPIRED") {
      await markOrderExpiredFromGateway(order.id);
    }
    // Status lain (UNPAID/REFUND/FAILED) → tanpa aksi.

    return Response.json({ ok: true });
  } catch (e) {
    console.error("billing/tripay callback:", e);
    return Response.json({ ok: false }, { status: 500 });
  }
}
