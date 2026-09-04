import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { executeBlockContact } from "./blockContact";
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
    openwa: { blockContact: vi.fn(), unblockContact: vi.fn() },
    OpenwaError: MockOpenwaError,
    publicOpenwaError: (e: unknown) =>
      e instanceof MockOpenwaError ? "Gateway WhatsApp sedang bermasalah. Coba lagi nanti." : String(e),
  };
});
vi.mock("./rate-limit", () => ({ checkRateLimit: vi.fn() }));

const ctx = { tenantId: "t1", keyId: "k1", requestId: "req-block-1" };

function readyDevice(over: Partial<{ id: string; label: string; openwaSessionId: string; status: string }> = {}) {
  return { id: "dev1", label: "HP Kasir", openwaSessionId: "owa-1", status: "ready", ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(queryD1One).mockResolvedValue(readyDevice());
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
  vi.mocked(openwa.blockContact).mockResolvedValue({ success: true });
  vi.mocked(openwa.unblockContact).mockResolvedValue({ success: true });
});

afterEach(() => vi.restoreAllMocks());

describe("executeBlockContact — block", () => {
  it("block nomor → normalisasi ke JID @c.us & panggil OpenWA blockContact", async () => {
    const result = await executeBlockContact({ number: "081234567890", action: "block" }, ctx);

    expect(result).toMatchObject({ ok: true, status: 200, body: { ok: true, blocked: true } });
    expect(openwa.blockContact).toHaveBeenCalledWith("owa-1", "6281234567890@c.us");
    expect(openwa.unblockContact).not.toHaveBeenCalled();
  });

  it("block JID grup/lid tetap diteruskan apa adanya", async () => {
    await executeBlockContact({ number: "120363024123456789@g.us", action: "block" }, ctx);
    expect(openwa.blockContact).toHaveBeenCalledWith("owa-1", "120363024123456789@g.us");
  });

  it("memakai deviceId bila diberikan", async () => {
    vi.mocked(queryD1One).mockResolvedValue(readyDevice({ id: "dev2", openwaSessionId: "owa-2" }));
    await executeBlockContact({ number: "6281234567890", action: "block", deviceId: "dev2" }, ctx);
    expect(openwa.blockContact).toHaveBeenCalledWith("owa-2", "6281234567890@c.us");
  });
});

describe("executeBlockContact — unblock", () => {
  it("unblock nomor → panggil OpenWA unblockContact", async () => {
    const result = await executeBlockContact({ number: "6281234567890", action: "unblock" }, ctx);

    expect(result).toMatchObject({ ok: true, status: 200, body: { ok: true, blocked: false } });
    expect(openwa.unblockContact).toHaveBeenCalledWith("owa-1", "6281234567890@c.us");
    expect(openwa.blockContact).not.toHaveBeenCalled();
  });
});

describe("executeBlockContact — validasi & error", () => {
  it("nomor tidak valid → 400 (tanpa panggil OpenWA)", async () => {
    const result = await executeBlockContact({ number: "abc", action: "block" }, ctx);
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(openwa.blockContact).not.toHaveBeenCalled();
  });

  it("tanpa device ready → 409", async () => {
    vi.mocked(queryD1One).mockResolvedValue(undefined);
    const result = await executeBlockContact({ number: "6281234567890", action: "block" }, ctx);
    expect(result).toMatchObject({ ok: false, status: 409 });
  });

  it("deviceId tidak ditemukan → 404", async () => {
    vi.mocked(queryD1One).mockResolvedValue(undefined);
    const result = await executeBlockContact({ number: "6281234567890", action: "block", deviceId: "nope" }, ctx);
    expect(result).toMatchObject({ ok: false, status: 404 });
  });

  it("device tidak siap → 409", async () => {
    vi.mocked(queryD1One).mockResolvedValue(readyDevice({ status: "disconnected" }));
    const result = await executeBlockContact({ number: "6281234567890", action: "block" }, ctx);
    expect(result).toMatchObject({ ok: false, status: 409 });
  });

  it("rate limit → 429 dengan retryAfterSec", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSec: 30 });
    const result = await executeBlockContact({ number: "6281234567890", action: "block" }, ctx);
    expect(result).toMatchObject({ ok: false, status: 429, retryAfterSec: 30 });
    expect(openwa.blockContact).not.toHaveBeenCalled();
  });

  it("OpenWA error → 502, pesan publik generik", async () => {
    vi.mocked(openwa.blockContact).mockRejectedValue(new OpenwaError(502, "Connection refused: 10.0.0.5:2785"));
    const result = await executeBlockContact({ number: "6281234567890", action: "block" }, ctx);

    expect(result).toMatchObject({ ok: false, status: 502 });
    if (!result.ok) {
      expect(result.error).not.toContain("10.0.0.5");
      expect(result.error).toMatch(/Gateway WhatsApp/i);
    }
  });
});
