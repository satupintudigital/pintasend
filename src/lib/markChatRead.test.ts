import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { executeMarkChatRead } from "./markChatRead";
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
    openwa: { markChatRead: vi.fn() },
    OpenwaError: MockOpenwaError,
    publicOpenwaError: (e: unknown) =>
      e instanceof MockOpenwaError ? "Gateway WhatsApp sedang bermasalah. Coba lagi nanti." : String(e),
  };
});
vi.mock("./rate-limit", () => ({ checkRateLimit: vi.fn() }));

const ctx = { tenantId: "t1", keyId: "k1", requestId: "req-read-1" };

function readyDevice(over: Partial<{ id: string; label: string; openwaSessionId: string; status: string }> = {}) {
  return { id: "dev1", label: "HP Kasir", openwaSessionId: "owa-1", status: "ready", ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(queryD1One).mockResolvedValue(readyDevice());
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
  vi.mocked(openwa.markChatRead).mockResolvedValue({ success: true });
});

afterEach(() => vi.restoreAllMocks());

describe("executeMarkChatRead — sukses", () => {
  it("chatId nomor → normalisasi JID @c.us & panggil OpenWA markChatRead", async () => {
    const result = await executeMarkChatRead({ chatId: "081234567890" }, ctx);

    expect(result).toMatchObject({ ok: true, status: 200, body: { ok: true, read: true } });
    expect(openwa.markChatRead).toHaveBeenCalledWith("owa-1", "6281234567890@c.us", undefined);
  });

  it("chatId JID grup → diteruskan apa adanya", async () => {
    await executeMarkChatRead({ chatId: "120363024123456789@g.us" }, ctx);
    expect(openwa.markChatRead).toHaveBeenCalledWith("owa-1", "120363024123456789@g.us", undefined);
  });

  it("messageIds opsional → diteruskan ke OpenWA", async () => {
    await executeMarkChatRead(
      { chatId: "6281234567890", messageIds: ["true_1_ABC", "true_1_DEF"] },
      ctx,
    );
    expect(openwa.markChatRead).toHaveBeenCalledWith("owa-1", "6281234567890@c.us", [
      "true_1_ABC",
      "true_1_DEF",
    ]);
  });

  it("memakai deviceId bila diberikan", async () => {
    vi.mocked(queryD1One).mockResolvedValue(readyDevice({ id: "dev2", openwaSessionId: "owa-2" }));
    await executeMarkChatRead({ chatId: "6281234567890", deviceId: "dev2" }, ctx);
    expect(openwa.markChatRead).toHaveBeenCalledWith("owa-2", "6281234567890@c.us", undefined);
  });
});

describe("executeMarkChatRead — validasi & error", () => {
  it("chatId tidak valid → 400 (tanpa panggil OpenWA)", async () => {
    const result = await executeMarkChatRead({ chatId: "abc" }, ctx);
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(openwa.markChatRead).not.toHaveBeenCalled();
  });

  it("chatId kosong → 400", async () => {
    const result = await executeMarkChatRead({ chatId: "" }, ctx);
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it("messageIds bukan array → 400", async () => {
    const result = await executeMarkChatRead(
      { chatId: "6281234567890", messageIds: "true_1_ABC" as unknown as string[] },
      ctx,
    );
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it("tanpa device ready → 409", async () => {
    vi.mocked(queryD1One).mockResolvedValue(undefined);
    const result = await executeMarkChatRead({ chatId: "6281234567890" }, ctx);
    expect(result).toMatchObject({ ok: false, status: 409 });
  });

  it("rate limit → 429 dengan retryAfterSec", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSec: 30 });
    const result = await executeMarkChatRead({ chatId: "6281234567890" }, ctx);
    expect(result).toMatchObject({ ok: false, status: 429, retryAfterSec: 30 });
  });

  it("OpenWA error → 502, pesan publik generik", async () => {
    vi.mocked(openwa.markChatRead).mockRejectedValue(new OpenwaError(502, "Connection refused: 10.0.0.5:2785"));
    const result = await executeMarkChatRead({ chatId: "6281234567890" }, ctx);

    expect(result).toMatchObject({ ok: false, status: 502 });
    if (!result.ok) {
      expect(result.error).not.toContain("10.0.0.5");
      expect(result.error).toMatch(/Gateway WhatsApp/i);
    }
  });
});
