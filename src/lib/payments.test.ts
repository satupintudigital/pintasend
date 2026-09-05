import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { hmacSha256Hex } from "@/lib/hmac";
import { tripaySignature, createPaymentProvider } from "./providers/tripay";

const ENV: Record<string, string> = {
  TRIPAY_MODE: "sandbox",
  TRIPAY_API_KEY: "api-key-123",
  TRIPAY_PRIVATE_KEY: "private-key-456",
  TRIPAY_MERCHANT_CODE: "T12345",
};

describe("tripaySignature", () => {
  it("HMAC-SHA256 hex dari method+merchant_ref+amount dengan private key (vektor tetap)", async () => {
    const sig = await tripaySignature("key", "POST", "REF-1", 25000);
    expect(sig).toBe("4e4adb63c72384f3cbda525413fbf1cdc19fc1b5ddd74dfe1b4dab0d980ac7d1");
  });
});

describe("createPaymentProvider", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 }))));
  afterEach(() => vi.unstubAllGlobals());

  it("default mode sandbox — createPayment mengirim signature & membaca respon", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            reference: "REF-GW-1",
            pay_code: "711234567890",
            checkout_url: "https://tripay.co.id/checkout/REF-GW-1",
            qr_string: null,
          },
        }),
        { status: 200 },
      ),
    );

    const provider = createPaymentProvider(ENV);
    const result = await provider.createPayment({
      merchantRef: "ord-1",
      amount: 150000,
      customerName: "PT Contoh",
      customerEmail: "owner@contoh.id",
      items: [{ name: "Paket Latte", price: 150000, quantity: 1 }],
      method: "BRIVA0",
      returnUrl: "https://wavio.test/checkout/ord-1",
      expiryMinutes: 1440,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://tripay.co.id/api-sandbox/transaction/create");
    // Header bisa berupa Headers instance (dari helper postJson) atau plain
    // object — baca via Headers agar assertion robust terhadap keduanya.
    const headers = new Headers(init.headers as HeadersInit);
    expect(headers.get("Authorization")).toBe("Bearer api-key-123");
    expect(headers.get("content-type")).toBe("application/json");
    const body = JSON.parse(String(init.body));
    expect(body.method).toBe("BRIVA0");
    expect(body.merchant_ref).toBe("ord-1");
    expect(body.amount).toBe(150000);
    expect(body.signature).toMatch(/^[0-9a-f]{64}$/);
    // Signature dihitung dari POST + merchant_ref + amount dengan private key
    const expected = await tripaySignature("private-key-456", "POST", "ord-1", 150000);
    expect(body.signature).toBe(expected);

    expect(result.gatewayRef).toBe("REF-GW-1");
    expect(result.payCode).toBe("711234567890");
    expect(result.checkoutUrl).toBe("https://tripay.co.id/checkout/REF-GW-1");
    expect(result.payMethod).toBe("BRIVA0");
    expect(result.qrString).toBeNull();
  });

  it("verifyCallback: signature sah → merchantRef+status; salah → null", async () => {
    const provider = createPaymentProvider(ENV);
    const bodyText = JSON.stringify({ event: "payment_status", data: { merchant_ref: "ord-2", status: "PAID" } });
    // Callback signature Tripay = HMAC-SHA256(privateKey, raw body text).
    const goodSig = await hmacSha256Hex("private-key-456", bodyText);

    const ok = await provider.verifyCallback(bodyText, goodSig);
    expect(ok).toEqual({ merchantRef: "ord-2", status: "PAID" });

    const bad = await provider.verifyCallback(bodyText, "deadbeef".padEnd(64, "0"));
    expect(bad).toBeNull();
  });

  it("checkStatus membaca status & paidAt dari detail", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ data: { status: "PAID", paid_at: "2026-09-04 10:00:00" } }),
        { status: 200 },
      ),
    );
    const provider = createPaymentProvider(ENV);
    const status = await provider.checkStatus("REF-GW-1");
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("/transaction/detail");
    expect(url).toContain("reference=REF-GW-1");
    expect(status).toEqual({ status: "PAID", paidAt: "2026-09-04 10:00:00" });
  });

  it("listChannels memetakan data channel", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            { code: "BRIVA", name: "Bank BRI", group: "Virtual Account", type: "bank", active: true },
            { code: "QRIS2", name: "QRIS", group: "QR Code", type: "qris", active: true },
          ],
        }),
        { status: 200 },
      ),
    );
    const provider = createPaymentProvider(ENV);
    const channels = await provider.listChannels();
    expect(channels).toHaveLength(2);
    expect(channels[0].code).toBe("BRIVA");
    expect(channels[0].group).toBe("Virtual Account");
    expect(channels[1].code).toBe("QRIS2");
  });

  it("mode production memakai base api (bukan api-sandbox)", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { reference: "R1", pay_code: null, checkout_url: null, qr_string: null } }), { status: 200 }),
    );
    const provider = createPaymentProvider({ ...ENV, TRIPAY_MODE: "production" });
    await provider.createPayment({
      merchantRef: "ord-3",
      amount: 10000,
      customerName: "A",
      customerEmail: "a@b.id",
      items: [{ name: "Top-up", price: 10000, quantity: 1 }],
      method: "QRIS2",
      returnUrl: "https://wavio.test/x",
      expiryMinutes: 60,
    });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("https://tripay.co.id/api/transaction/create");
  });
});