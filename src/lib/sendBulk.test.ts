import { describe, expect, it, vi, beforeEach } from "vitest";
import { executeSendBulk } from "./sendBulk";

const queryD1OneMock = vi.fn();
const checkRateLimitMock = vi.fn();
const getTenantConfigMock = vi.fn();
const sendBulkMock = vi.fn();
const insertMessageLogMock = vi.fn();
const prepaidSendGateMock = vi.fn();
const spendCreditMock = vi.fn();

vi.mock("./d1", () => ({ queryD1One: (...a: unknown[]) => queryD1OneMock(...a) }));
vi.mock("./tenantConfig", () => ({ getTenantConfig: (...a: unknown[]) => getTenantConfigMock(...a) }));
vi.mock("./credit", () => ({
  prepaidSendGate: (...a: unknown[]) => prepaidSendGateMock(...a),
  spendCredit: (...a: unknown[]) => spendCreditMock(...a),
}));
vi.mock("./rate-limit", () => ({
  checkRateLimit: (...a: unknown[]) => checkRateLimitMock(...a),
}));
vi.mock("./messageStore", () => ({
  insertMessageLog: (...a: unknown[]) => insertMessageLogMock(...a),
}));
vi.mock("./openwa", () => ({
  openwa: { sendBulk: (...a: unknown[]) => sendBulkMock(...a) },
  OpenwaError: class OpenwaError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  publicOpenwaError: () => "Gateway WhatsApp sedang bermasalah. Coba lagi nanti.",
}));

const CTX = { tenantId: "t1", keyId: "k1", requestId: "req-1" };
const DEVICE = { id: "dev1", label: "HP Kasir", openwaSessionId: "sess-1", status: "ready" };

const BATCH_RESULT = {
  batchId: "batch-1",
  status: "processing",
  totalMessages: 2,
  estimatedCompletionTime: "2026-08-20T18:00:00.000Z",
  statusUrl: "/api/sessions/sess-1/messages/batch/batch-1",
};

function bulkInput(overrides: Record<string, unknown> = {}) {
  return {
    deviceId: "dev1",
    messages: [
      {
        to: "081234567890",
        type: "text" as const,
        content: { text: "Halo {nama}" },
        variables: { nama: "Budi" },
      },
      { to: "6281199998888", type: "text" as const, content: { text: "Halo semua" } },
    ],
    delayBetweenMessages: 3000,
    ...overrides,
  };
}

beforeEach(() => {
  queryD1OneMock.mockReset();
  checkRateLimitMock.mockReset();
  getTenantConfigMock.mockReset();
  sendBulkMock.mockReset();
  insertMessageLogMock.mockReset();
  prepaidSendGateMock.mockReset();
  spendCreditMock.mockReset();

  queryD1OneMock.mockResolvedValue(DEVICE);
  checkRateLimitMock.mockResolvedValue({ allowed: true });
  getTenantConfigMock.mockResolvedValue({ plan: { maxDevices: 10, maxUsers: 20, maxMessagesPerMonth: 100, includesDelay: false }, addons: {}, features: {}, messageCount: 1, ts: Date.now() });
  sendBulkMock.mockResolvedValue(BATCH_RESULT);
  insertMessageLogMock.mockResolvedValue(undefined);
  prepaidSendGateMock.mockResolvedValue({ ok: true });
  spendCreditMock.mockResolvedValue({ ok: true, balance: 0 });
});

describe("executeSendBulk", () => {
  it("kirim batch: normalisasi to→JID, kuota per penerima, delegasi ke OpenWA", async () => {
    const res = await executeSendBulk(bulkInput(), CTX);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.body).toMatchObject({
        ok: true,
        deviceId: "dev1",
        batchId: "batch-1",
        totalMessages: 2,
        status: "processing",
      });
    }
    expect(sendBulkMock).toHaveBeenCalledWith("sess-1", {
      messages: [
        {
          chatId: "6281234567890@c.us",
          type: "text",
          content: { text: "Halo {nama}" },
          variables: { nama: "Budi" },
        },
        { chatId: "6281199998888@c.us", type: "text", content: { text: "Halo semua" } },
      ],
      options: { delayBetweenMessages: 3000 },
    });
  });

  it("kuota per penerima: used + count > max → 429", async () => {
    getTenantConfigMock.mockResolvedValue({ plan: { maxDevices: 10, maxUsers: 20, maxMessagesPerMonth: 100, includesDelay: false }, addons: {}, features: {}, messageCount: 99, ts: Date.now() });
    const res = await executeSendBulk(bulkInput(), CTX);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(429);
      expect(res.error).toContain("2 pesan");
    }
    expect(sendBulkMock).not.toHaveBeenCalled();
  });

  it("kuota unlimited (max null) → tidak diblokir", async () => {
    getTenantConfigMock.mockResolvedValue({ plan: { maxDevices: 10, maxUsers: 20, maxMessagesPerMonth: null, includesDelay: false }, addons: {}, features: {}, messageCount: 0, ts: Date.now() });
    const res = await executeSendBulk(bulkInput(), CTX);
    expect(res.ok).toBe(true);
    expect(sendBulkMock).toHaveBeenCalledTimes(1);
  });

  it("messages kosong → 400", async () => {
    const res = await executeSendBulk(bulkInput({ messages: [] }), CTX);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
  });

  it("messages > 100 → 400", async () => {
    const messages = Array.from({ length: 101 }, (_, i) => ({
      to: `6281${String(i).padStart(9, "0")}`,
      type: "text",
      content: { text: "x" },
    }));
    const res = await executeSendBulk(bulkInput({ messages }), CTX);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
  });

  it("item dengan nomor tidak valid → 400 (sebutkan index)", async () => {
    const res = await executeSendBulk(bulkInput({ messages: [{ to: "abc", type: "text", content: { text: "x" } }] }), CTX);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(400);
      expect(res.error).toContain("1");
    }
  });

  it("item tanpa tipe didukung → 400", async () => {
    const res = await executeSendBulk(
      bulkInput({ messages: [{ to: "6281234567890", type: "sticker", content: { text: "x" } }] }),
      CTX,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
  });

  it("delayBetweenMessages di luar 1000–60000 → 400", async () => {
    const res = await executeSendBulk(bulkInput({ delayBetweenMessages: 500 }), CTX);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
  });

  it("device tidak siap → 409", async () => {
    queryD1OneMock.mockResolvedValue({ ...DEVICE, status: "created" });
    const res = await executeSendBulk(bulkInput(), CTX);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(409);
  });

  it("error OpenWA → 502 dengan pesan publik generik", async () => {
    const { OpenwaError } = await import("./openwa");
    sendBulkMock.mockRejectedValue(new OpenwaError(502, "gateway down"));
    const res = await executeSendBulk(bulkInput(), CTX);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(502);
      expect(res.error).toBe("Gateway WhatsApp sedang bermasalah. Coba lagi nanti.");
    }
  });

  it("mencatat 1 log ringkasan batch (type bulk)", async () => {
    await executeSendBulk(bulkInput(), CTX);
    expect(insertMessageLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t1",
        deviceId: "dev1",
        direction: "outgoing",
        chatId: "bulk:batch-1",
        type: "bulk",
        messageId: null,
      }),
    );
  });

  it("prepaid saldo < jumlah batch → 402 INSUFFICIENT_CREDIT tanpa kirim", async () => {
    getTenantConfigMock.mockResolvedValue({ plan: { maxDevices: 10, maxUsers: 20, maxMessagesPerMonth: null, includesDelay: false, kind: "prepaid" }, addons: {}, features: {}, messageCount: 0, ts: Date.now() });
    prepaidSendGateMock.mockResolvedValueOnce({ ok: false, code: "INSUFFICIENT_CREDIT", balance: 1 });
    const res = await executeSendBulk(bulkInput(), CTX);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(402);
      expect(res.error).toContain("INSUFFICIENT_CREDIT");
    }
    expect(sendBulkMock).not.toHaveBeenCalled();
    expect(spendCreditMock).not.toHaveBeenCalled();
  });

  it("prepaid saldo cukup → submit batch & potong total pesan (refId bulk:batchId)", async () => {
    getTenantConfigMock.mockResolvedValue({ plan: { maxDevices: 10, maxUsers: 20, maxMessagesPerMonth: null, includesDelay: false, kind: "prepaid" }, addons: {}, features: {}, messageCount: 0, ts: Date.now() });
    const res = await executeSendBulk(bulkInput(), CTX);

    expect(res.ok).toBe(true);
    expect(prepaidSendGateMock).toHaveBeenCalledWith("prepaid", "t1", 2);
    expect(spendCreditMock).toHaveBeenCalledWith({
      tenantId: "t1",
      messages: 2,
      refId: "bulk:batch-1",
      reason: "send",
    });
  });

  it("subscription/tanpa kind → tidak memotong saldo", async () => {
    await executeSendBulk(bulkInput(), CTX);
    expect(spendCreditMock).not.toHaveBeenCalled();
  });
});