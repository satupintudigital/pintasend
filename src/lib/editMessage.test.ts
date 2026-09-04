import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { executeEditMessage } from "./editMessage";
import { queryD1One } from "./d1";
import { openwa, OpenwaError } from "./openwa";
import { checkRateLimit } from "./rate-limit";

// ── Mocks ───────────────────────────────────────────────────────────────────
vi.mock("./d1", () => ({ queryD1One: vi.fn() }));
vi.mock("./tenantConfig", () => ({ getTenantConfig: vi.fn() }));
vi.mock("./openwa", () => {
  class MockOpenwaError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = "OpenwaError";
      this.status = status;
    }
  }
  return {
    openwa: { editMessage: vi.fn() },
    OpenwaError: MockOpenwaError,
    publicOpenwaError: (e: unknown) =>
      e instanceof MockOpenwaError ? "Gateway WhatsApp sedang bermasalah. Coba lagi nanti." : String(e),
  };
});
vi.mock("./rate-limit", () => ({ checkRateLimit: vi.fn() }));

const ctx = { tenantId: "t1", keyId: "k1", requestId: "req-edit-1" };

function readyDevice(over: Partial<{ id: string; label: string; openwaSessionId: string; status: string }> = {}) {
  return { id: "dev1", label: "HP Kasir", openwaSessionId: "owa-1", status: "ready", ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(queryD1One).mockResolvedValue(readyDevice());
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
  vi.mocked(openwa.editMessage).mockResolvedValue({ messageId: "msg-1" });
});

afterEach(() => vi.restoreAllMocks());

describe("executeEditMessage", () => {
  it("edit teks → normalisasi chatId & panggil OpenWA editMessage", async () => {
    const result = await executeEditMessage(
      { chatId: "081234567890", messageId: "msg-1", text: "Corrected text" },
      ctx,
    );

    expect(result).toMatchObject({ ok: true, status: 200, body: { ok: true, edited: true } });
    expect(openwa.editMessage).toHaveBeenCalledWith("owa-1", "6281234567890@c.us", "msg-1", {
      text: "Corrected text",
    });
  });

  it("meneruskan mentions bila ada", async () => {
    await executeEditMessage(
      { chatId: "6281234567890", messageId: "msg-1", text: "Hello @62811", mentions: ["62811@c.us"] },
      ctx,
    );
    expect(openwa.editMessage).toHaveBeenCalledWith("owa-1", "6281234567890@c.us", "msg-1", {
      text: "Hello @62811",
      mentions: ["62811@c.us"],
    });
  });

  it("memakai deviceId bila diberikan", async () => {
    vi.mocked(queryD1One).mockResolvedValue(readyDevice({ id: "dev2", openwaSessionId: "owa-2" }));
    await executeEditMessage(
      { chatId: "6281234567890", messageId: "msg-1", text: "Hi", deviceId: "dev2" },
      ctx,
    );
    expect(openwa.editMessage).toHaveBeenCalledWith("owa-2", "6281234567890@c.us", "msg-1", { text: "Hi" });
  });

  it("chatId tidak valid → 400", async () => {
    const result = await executeEditMessage(
      { chatId: "abc", messageId: "msg-1", text: "Hi" },
      ctx,
    );
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(openwa.editMessage).not.toHaveBeenCalled();
  });

  it("text kosong → 400", async () => {
    const result = await executeEditMessage(
      { chatId: "6281234567890", messageId: "msg-1", text: "" },
      ctx,
    );
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it("text terlalu panjang → 400", async () => {
    const result = await executeEditMessage(
      { chatId: "6281234567890", messageId: "msg-1", text: "x".repeat(4097) },
      ctx,
    );
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it("messageId kosong → 400", async () => {
    const result = await executeEditMessage(
      { chatId: "6281234567890", messageId: "", text: "Hi" },
      ctx,
    );
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it("tanpa device ready → 409", async () => {
    vi.mocked(queryD1One).mockResolvedValue(undefined);
    const result = await executeEditMessage(
      { chatId: "6281234567890", messageId: "msg-1", text: "Hi" },
      ctx,
    );
    expect(result).toMatchObject({ ok: false, status: 409 });
  });

  it("rate limit → 429", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSec: 30 });
    const result = await executeEditMessage(
      { chatId: "6281234567890", messageId: "msg-1", text: "Hi" },
      ctx,
    );
    expect(result).toMatchObject({ ok: false, status: 429, retryAfterSec: 30 });
  });

  it("OpenWA error → 502, pesan publik generik", async () => {
    vi.mocked(openwa.editMessage).mockRejectedValue(new OpenwaError(502, "Connection refused"));
    const result = await executeEditMessage(
      { chatId: "6281234567890", messageId: "msg-1", text: "Hi" },
      ctx,
    );
    expect(result).toMatchObject({ ok: false, status: 502 });
    if (!result.ok) {
      expect(result.error).not.toContain("Connection refused");
      expect(result.error).toMatch(/Gateway WhatsApp/i);
    }
  });
});
