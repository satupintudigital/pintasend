import { describe, expect, it, vi, beforeEach } from "vitest";
import { executeReactToMessage } from "./reactToMessage";

const queryD1OneMock = vi.fn();
const checkRateLimitMock = vi.fn();
const reactMock = vi.fn();
const insertMessageLogMock = vi.fn();

vi.mock("./d1", () => ({ queryD1One: (...a: unknown[]) => queryD1OneMock(...a) }));
vi.mock("./tenantConfig", () => ({ getTenantConfig: vi.fn() }));
vi.mock("./rate-limit", () => ({
  checkRateLimit: (...a: unknown[]) => checkRateLimitMock(...a),
}));
vi.mock("./messageStore", () => ({
  insertMessageLog: (...a: unknown[]) => insertMessageLogMock(...a),
}));
vi.mock("./openwa", () => ({
  openwa: { react: (...a: unknown[]) => reactMock(...a) },
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
  reactMock.mockReset();
  insertMessageLogMock.mockReset();
  checkRateLimitMock.mockResolvedValue({ allowed: true });
  reactMock.mockResolvedValue({ success: true });
  insertMessageLogMock.mockResolvedValue(undefined);
  queryD1OneMock.mockResolvedValue(DEVICE);
});

describe("executeReactToMessage", () => {
  it("memberi reaksi emoji ke pesan", async () => {
    const res = await executeReactToMessage(
      { chatId: "6281234567890@c.us", messageId: "msg-1", emoji: "👍" },
      CTX,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.body).toMatchObject({ ok: true, chatId: "6281234567890@c.us", emoji: "👍" });
    expect(reactMock).toHaveBeenCalledWith("sess-1", "6281234567890@c.us", "msg-1", "👍");
  });

  it("emoji kosong = hapus reaksi (valid, diteruskan apa adanya)", async () => {
    const res = await executeReactToMessage({ chatId: "6281234567890@c.us", messageId: "msg-1", emoji: "" }, CTX);
    expect(res.ok).toBe(true);
    expect(reactMock).toHaveBeenCalledWith("sess-1", "6281234567890@c.us", "msg-1", "");
  });

  it("emoji > 32 karakter → 400", async () => {
    const res = await executeReactToMessage(
      { chatId: "6281234567890@c.us", messageId: "msg-1", emoji: "a".repeat(33) },
      CTX,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
  });

  it("chatId wajib → 400 saat kosong", async () => {
    const res = await executeReactToMessage({ chatId: "", messageId: "msg-1", emoji: "👍" }, CTX);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
  });

  it("messageId wajib → 400 saat kosong", async () => {
    const res = await executeReactToMessage({ chatId: "6281234567890@c.us", messageId: "", emoji: "👍" }, CTX);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
  });

  it("device tidak ditemukan → 404 (deviceId diberikan)", async () => {
    queryD1OneMock.mockResolvedValue(undefined);
    const res = await executeReactToMessage(
      { chatId: "6281234567890@c.us", messageId: "msg-1", emoji: "👍", deviceId: "dev-asing" },
      CTX,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(404);
  });

  it("error OpenWA → 502 dengan pesan publik generik", async () => {
    const { OpenwaError } = await import("./openwa");
    reactMock.mockRejectedValue(new OpenwaError(502, "gateway down"));
    const res = await executeReactToMessage({ chatId: "6281234567890@c.us", messageId: "msg-1", emoji: "👍" }, CTX);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(502);
      expect(res.error).toBe("Gateway WhatsApp sedang bermasalah. Coba lagi nanti.");
    }
  });
});