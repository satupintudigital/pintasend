import { describe, expect, it, vi, beforeEach } from "vitest";
import { executeSendRichMessage } from "./sendRichMessage";

const queryD1OneMock = vi.fn();
const checkRateLimitMock = vi.fn();
const getTenantConfigMock = vi.fn();
const sendLocationMock = vi.fn();
const sendContactMock = vi.fn();
const sendPollMock = vi.fn();
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
  openwa: {
    sendLocation: (...a: unknown[]) => sendLocationMock(...a),
    sendContact: (...a: unknown[]) => sendContactMock(...a),
    sendPoll: (...a: unknown[]) => sendPollMock(...a),
  },
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

beforeEach(() => {
  queryD1OneMock.mockReset();
  checkRateLimitMock.mockReset();
  getTenantConfigMock.mockReset();
  sendLocationMock.mockReset();
  sendContactMock.mockReset();
  sendPollMock.mockReset();
  insertMessageLogMock.mockReset();
  prepaidSendGateMock.mockReset();
  spendCreditMock.mockReset();

  checkRateLimitMock.mockResolvedValue({ allowed: true });
  getTenantConfigMock.mockResolvedValue({ plan: { maxDevices: 10, maxUsers: 20, maxMessagesPerMonth: 100, includesDelay: false }, addons: {}, features: {}, messageCount: 1, ts: Date.now() });
  sendLocationMock.mockResolvedValue({ messageId: "m-loc", status: "sent" });
  sendContactMock.mockResolvedValue({ messageId: "m-con", status: "sent" });
  sendPollMock.mockResolvedValue({ messageId: "m-poll", status: "sent" });
  insertMessageLogMock.mockResolvedValue(undefined);
  prepaidSendGateMock.mockResolvedValue({ ok: true });
  spendCreditMock.mockResolvedValue({ ok: true, balance: 0 });
});

describe("executeSendRichMessage — location", () => {
  beforeEach(() => {
    queryD1OneMock.mockResolvedValue(DEVICE);
  });

  it("kirim lokasi dengan koordinat + deskripsi + replyTo", async () => {
    const res = await executeSendRichMessage(
      "location",
      {
        to: "081234567890",
        latitude: -6.2088,
        longitude: 106.8456,
        description: "Toko kami",
        replyTo: "quoted-1",
      },
      CTX,
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.body).toMatchObject({ ok: true, deviceId: "dev1", to: "6281234567890@c.us", messageId: "m-loc" });
    }
    expect(sendLocationMock).toHaveBeenCalledWith("sess-1", "6281234567890@c.us", {
      latitude: -6.2088,
      longitude: 106.8456,
      description: "Toko kami",
      replyTo: "quoted-1",
    });
  });

  it("lokasi tanpa field opsional → body minimal", async () => {
    await executeSendRichMessage("location", { to: "6281234567890", latitude: 1, longitude: 2 }, CTX);
    expect(sendLocationMock).toHaveBeenCalledWith("sess-1", "6281234567890@c.us", {
      latitude: 1,
      longitude: 2,
    });
  });

  it("latitude/longitude non-angka → 400", async () => {
    const res = await executeSendRichMessage(
      "location",
      { to: "6281234567890", latitude: "abc" as never, longitude: 2 },
      CTX,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
  });
});

describe("executeSendRichMessage — contact", () => {
  beforeEach(() => {
    queryD1OneMock.mockResolvedValue(DEVICE);
  });

  it("kirim kartu kontak dengan nama + nomor", async () => {
    const res = await executeSendRichMessage(
      "contact",
      { to: "081234567890", contactName: "CS NalaNiaga", contactNumber: "628111222333" },
      CTX,
    );
    expect(res.ok).toBe(true);
    expect(sendContactMock).toHaveBeenCalledWith("sess-1", "6281234567890@c.us", {
      contactName: "CS NalaNiaga",
      contactNumber: "628111222333",
    });
  });

  it("contactNumber wajib → 400 saat kosong", async () => {
    const res = await executeSendRichMessage("contact", { to: "6281234567890", contactName: "X" }, CTX);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
  });
});

describe("executeSendRichMessage — poll", () => {
  beforeEach(() => {
    queryD1OneMock.mockResolvedValue(DEVICE);
  });

  it("kirim poll dengan options + allowMultipleAnswers", async () => {
    const res = await executeSendRichMessage(
      "poll",
      { to: "081234567890", name: "Pilih menu?", options: ["A", "B", "C"], allowMultipleAnswers: true },
      CTX,
    );
    expect(res.ok).toBe(true);
    expect(sendPollMock).toHaveBeenCalledWith("sess-1", "6281234567890@c.us", {
      name: "Pilih menu?",
      options: ["A", "B", "C"],
      allowMultipleAnswers: true,
    });
  });

  it("options kurang dari 2 → 400", async () => {
    const res = await executeSendRichMessage("poll", { to: "6281234567890", name: "Q", options: ["A"] }, CTX);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
  });

  it("options lebih dari 12 → 400", async () => {
    const res = await executeSendRichMessage(
      "poll",
      { to: "6281234567890", name: "Q", options: Array.from({ length: 13 }, (_, i) => `O${i}`) },
      CTX,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
  });
});

describe("executeSendRichMessage — common flow", () => {
  it("device tertentu tidak milik tenant → 404", async () => {
    queryD1OneMock.mockResolvedValue(undefined);
    const res = await executeSendRichMessage(
      "location",
      { to: "6281234567890", latitude: 1, longitude: 2, deviceId: "dev-asing" },
      CTX,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(404);
  });

  it("kuota tercapai → 429", async () => {
    queryD1OneMock.mockResolvedValue(DEVICE);
    getTenantConfigMock.mockResolvedValue({ plan: { maxDevices: 10, maxUsers: 20, maxMessagesPerMonth: 100, includesDelay: false }, addons: {}, features: {}, messageCount: 100, ts: Date.now() });
    const res = await executeSendRichMessage(
      "location",
      { to: "6281234567890", latitude: 1, longitude: 2 },
      CTX,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(429);
  });

  it("error OpenWA → 502 dengan pesan publik generik", async () => {
    queryD1OneMock.mockResolvedValue(DEVICE);
    const { OpenwaError } = await import("./openwa");
    sendPollMock.mockRejectedValue(new OpenwaError(502, "gateway down"));
    const res = await executeSendRichMessage("poll", { to: "6281234567890", name: "Q", options: ["A", "B"] }, CTX);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(502);
      expect(res.error).toBe("Gateway WhatsApp sedang bermasalah. Coba lagi nanti.");
    }
  });

  it("mencatat riwayat keluar (type sesuai jenis)", async () => {
    queryD1OneMock.mockResolvedValue(DEVICE);
    await executeSendRichMessage("location", { to: "081234567890", latitude: 1, longitude: 2 }, CTX);
    expect(insertMessageLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t1",
        deviceId: "dev1",
        direction: "outgoing",
        chatId: "6281234567890@c.us",
        type: "location",
        messageId: "m-loc",
      }),
    );
  });

  it("prepaid saldo 0 → 402 INSUFFICIENT_CREDIT tanpa kirim & tanpa potong", async () => {
    queryD1OneMock.mockResolvedValue(DEVICE);
    getTenantConfigMock.mockResolvedValue({ plan: { maxDevices: 1, maxUsers: 3, maxMessagesPerMonth: null, includesDelay: false, kind: "prepaid" }, addons: {}, features: {}, messageCount: 0, ts: Date.now() });
    prepaidSendGateMock.mockResolvedValueOnce({ ok: false, code: "INSUFFICIENT_CREDIT", balance: 0 });
    const res = await executeSendRichMessage(
      "location",
      { to: "081234567890", latitude: 1, longitude: 2 },
      CTX,
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(402);
      expect(res.error).toContain("INSUFFICIENT_CREDIT");
    }
    expect(sendLocationMock).not.toHaveBeenCalled();
    expect(spendCreditMock).not.toHaveBeenCalled();
  });

  it("prepaid saldo cukup → kirim sukses & potong 1 pesan (refId messageId)", async () => {
    queryD1OneMock.mockResolvedValue(DEVICE);
    getTenantConfigMock.mockResolvedValue({ plan: { maxDevices: 1, maxUsers: 3, maxMessagesPerMonth: null, includesDelay: false, kind: "prepaid" }, addons: {}, features: {}, messageCount: 0, ts: Date.now() });
    const res = await executeSendRichMessage(
      "location",
      { to: "081234567890", latitude: 1, longitude: 2 },
      CTX,
    );

    expect(res.ok).toBe(true);
    expect(prepaidSendGateMock).toHaveBeenCalledWith("prepaid", "t1", 1);
    expect(spendCreditMock).toHaveBeenCalledWith({
      tenantId: "t1",
      messages: 1,
      refId: "m-loc",
      reason: "send",
    });
  });

  it("subscription/tanpa kind → tidak memotong saldo", async () => {
    queryD1OneMock.mockResolvedValue(DEVICE);
    const res = await executeSendRichMessage(
      "location",
      { to: "081234567890", latitude: 1, longitude: 2 },
      CTX,
    );
    expect(res.ok).toBe(true);
    expect(spendCreditMock).not.toHaveBeenCalled();
  });
});