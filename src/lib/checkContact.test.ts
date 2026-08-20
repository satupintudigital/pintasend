import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { executeCheckContact } from "./checkContact";
import { queryOne } from "./db";
import { openwa, OpenwaError } from "./openwa";
import { checkRateLimit } from "./rate-limit";

// ── Mocks ───────────────────────────────────────────────────────────────────
vi.mock("./db", () => ({ queryOne: vi.fn() }));
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
    openwa: { checkContact: vi.fn() },
    OpenwaError: MockOpenwaError,
    publicOpenwaError: (e: unknown) =>
      e instanceof MockOpenwaError ? "Gateway WhatsApp sedang bermasalah. Coba lagi nanti." : String(e),
  };
});
vi.mock("./rate-limit", () => ({ checkRateLimit: vi.fn() }));

const ctx = { tenantId: "t1", keyId: "k1", requestId: "req-check-1" };

function readyDevice(over: Partial<{ id: string; label: string; openwaSessionId: string; status: string }> = {}) {
  return { id: "dev1", label: "HP Kasir", openwaSessionId: "owa-1", status: "ready", ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(queryOne).mockResolvedValue(readyDevice());
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
  vi.mocked(openwa.checkContact).mockResolvedValue({
    number: "6281234567890",
    exists: true,
    whatsappId: "6281234567890@c.us",
  });
});

afterEach(() => vi.restoreAllMocks());

describe("executeCheckContact — sukses", () => {
  it("nomor valid → cek via OpenWA & balas exists + whatsappId", async () => {
    const result = await executeCheckContact({ number: "081234567890" }, ctx);

    expect(result).toMatchObject({
      ok: true,
      status: 200,
      body: { ok: true, exists: true, whatsappId: "6281234567890@c.us", number: "6281234567890" },
    });
    expect(openwa.checkContact).toHaveBeenCalledWith("owa-1", "6281234567890");
  });

  it("nomor tidak terdaftar → exists false + whatsappId null (tetap 200)", async () => {
    vi.mocked(openwa.checkContact).mockResolvedValue({
      number: "6281234567890",
      exists: false,
      whatsappId: null,
    });
    const result = await executeCheckContact({ number: "6281234567890" }, ctx);
    expect(result).toMatchObject({ ok: true, status: 200, body: { exists: false, whatsappId: null } });
  });

  it("memakai deviceId bila diberikan", async () => {
    vi.mocked(queryOne).mockResolvedValue(readyDevice({ id: "dev2", openwaSessionId: "owa-2" }));
    await executeCheckContact({ number: "6281234567890", deviceId: "dev2" }, ctx);

    expect(queryOne).toHaveBeenCalledWith(expect.stringContaining("WHERE id = $1"), ["dev2", "t1"]);
    expect(openwa.checkContact).toHaveBeenCalledWith("owa-2", "6281234567890");
  });
});

describe("executeCheckContact — validasi & error", () => {
  it("nomor tidak valid → 400 (tanpa panggil OpenWA)", async () => {
    const result = await executeCheckContact({ number: "abc" }, ctx);
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(openwa.checkContact).not.toHaveBeenCalled();
  });

  it("tanpa device ready → 409", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);
    const result = await executeCheckContact({ number: "6281234567890" }, ctx);
    expect(result).toMatchObject({ ok: false, status: 409 });
  });

  it("deviceId tidak ditemukan → 404", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);
    const result = await executeCheckContact({ number: "6281234567890", deviceId: "nope" }, ctx);
    expect(result).toMatchObject({ ok: false, status: 404 });
  });

  it("device tidak siap → 409", async () => {
    vi.mocked(queryOne).mockResolvedValue(readyDevice({ status: "disconnected" }));
    const result = await executeCheckContact({ number: "6281234567890" }, ctx);
    expect(result).toMatchObject({ ok: false, status: 409 });
  });

  it("rate limit → 429 dengan retryAfterSec", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSec: 30 });
    const result = await executeCheckContact({ number: "6281234567890" }, ctx);
    expect(result).toMatchObject({ ok: false, status: 429, retryAfterSec: 30 });
    expect(openwa.checkContact).not.toHaveBeenCalled();
  });

  it("OpenWA error → 502, pesan publik generik (tanpa detail internal)", async () => {
    vi.mocked(openwa.checkContact).mockRejectedValue(new OpenwaError(502, "Connection refused: 10.0.0.5:2785"));
    const result = await executeCheckContact({ number: "6281234567890" }, ctx);

    expect(result).toMatchObject({ ok: false, status: 502 });
    if (!result.ok) {
      expect(result.error).not.toContain("10.0.0.5");
      expect(result.error).not.toContain("Connection refused");
      expect(result.error).toMatch(/Gateway WhatsApp/i);
    }
  });
});
