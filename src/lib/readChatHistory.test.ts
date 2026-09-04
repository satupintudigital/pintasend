import { describe, expect, it, vi, beforeEach } from "vitest";
import { executeReadChatHistory } from "./readChatHistory";

const queryD1OneMock = vi.fn();
const checkRateLimitMock = vi.fn();
const listMessagesMock = vi.fn();

vi.mock("./d1", () => ({ queryD1One: (...a: unknown[]) => queryD1OneMock(...a) }));
vi.mock("./tenantConfig", () => ({ getTenantConfig: vi.fn() }));
vi.mock("./rate-limit", () => ({
  checkRateLimit: (...a: unknown[]) => checkRateLimitMock(...a),
}));
vi.mock("./openwa", () => ({
  openwa: { listMessages: (...a: unknown[]) => listMessagesMock(...a) },
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

const HISTORY = [
  { id: "m1", chatId: "6281234567890@c.us", body: "Halo", fromMe: false, timestamp: 1787220000 },
  { id: "m2", chatId: "6281234567890@c.us", body: "Hai", fromMe: true, timestamp: 1787220100 },
];

beforeEach(() => {
  queryD1OneMock.mockReset();
  checkRateLimitMock.mockReset();
  listMessagesMock.mockReset();
  queryD1OneMock.mockResolvedValue(DEVICE);
  checkRateLimitMock.mockResolvedValue({ allowed: true });
  listMessagesMock.mockResolvedValue({ messages: HISTORY });
});

describe("executeReadChatHistory", () => {
  it("baca riwayat chat dengan limit default", async () => {
    const res = await executeReadChatHistory({ chatId: "6281234567890@c.us" }, CTX);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.body).toMatchObject({ ok: true, messages: HISTORY });
    expect(listMessagesMock).toHaveBeenCalledWith("sess-1", "6281234567890@c.us", {});
  });

  it("limit diteruskan (1–100); di luar rentang → clamp", async () => {
    await executeReadChatHistory({ chatId: "6281234567890@c.us", limit: 50 }, CTX);
    expect(listMessagesMock).toHaveBeenCalledWith("sess-1", "6281234567890@c.us", { limit: 50 });

    await executeReadChatHistory({ chatId: "6281234567890@c.us", limit: 500 }, CTX);
    expect(listMessagesMock).toHaveBeenLastCalledWith("sess-1", "6281234567890@c.us", { limit: 100 });

    await executeReadChatHistory({ chatId: "6281234567890@c.us", limit: 0 }, CTX);
    expect(listMessagesMock).toHaveBeenLastCalledWith("sess-1", "6281234567890@c.us", {});
  });

  it("offset diteruskan (paginasi)", async () => {
    await executeReadChatHistory({ chatId: "6281234567890@c.us", limit: 20, offset: 40 }, CTX);
    expect(listMessagesMock).toHaveBeenCalledWith("sess-1", "6281234567890@c.us", { limit: 20, offset: 40 });
  });

  it("chatId wajib → 400 saat kosong", async () => {
    const res = await executeReadChatHistory({ chatId: "" }, CTX);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
  });

  it("chatId nomor biasa dinormalisasi ke JID", async () => {
    await executeReadChatHistory({ chatId: "081234567890" }, CTX);
    expect(listMessagesMock).toHaveBeenCalledWith("sess-1", "6281234567890@c.us", {});
  });

  it("device tidak ditemukan → 409 (tanpa deviceId)", async () => {
    queryD1OneMock.mockResolvedValue(undefined);
    const res = await executeReadChatHistory({ chatId: "6281234567890@c.us" }, CTX);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(409);
  });

  it("respons tanpa field messages → array kosong", async () => {
    listMessagesMock.mockResolvedValue(undefined);
    const res = await executeReadChatHistory({ chatId: "6281234567890@c.us" }, CTX);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.body.messages).toEqual([]);
  });

  it("error OpenWA → 502 dengan pesan publik generik", async () => {
    const { OpenwaError } = await import("./openwa");
    listMessagesMock.mockRejectedValue(new OpenwaError(502, "gateway down"));
    const res = await executeReadChatHistory({ chatId: "6281234567890@c.us" }, CTX);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(502);
      expect(res.error).toBe("Gateway WhatsApp sedang bermasalah. Coba lagi nanti.");
    }
  });
});