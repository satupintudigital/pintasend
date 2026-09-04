import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { executeRequestPairingCode } from "./pairingCode";
import { queryD1One } from "./d1";
import { openwa, OpenwaError } from "./openwa";
import { checkRateLimit } from "./rate-limit";

vi.mock("./d1", () => ({ queryD1One: vi.fn() }));
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
    openwa: { requestPairingCode: vi.fn() },
    OpenwaError: MockOpenwaError,
    publicOpenwaError: () => "Gateway WhatsApp sedang bermasalah.",
  };
});
vi.mock("./rate-limit", () => ({ checkRateLimit: vi.fn() }));

const ctx = { tenantId: "t1", keyId: "k1", requestId: "req-pair-1" };
const mockDevice = { id: "dev1", openwaSessionId: "owa-1", status: "ready" };

beforeEach(() => { vi.clearAllMocks(); vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true }); });
afterEach(() => vi.restoreAllMocks());

describe("executeRequestPairingCode", () => {
  it("requests pairing code successfully", async () => {
    vi.mocked(queryD1One).mockResolvedValue(mockDevice);
    vi.mocked(openwa.requestPairingCode).mockResolvedValue({ pairingCode: "12345678", status: "pairing" });

    const r = await executeRequestPairingCode("dev1", "6281234567890", ctx);
    expect(r).toMatchObject({ ok: true, status: 200 });
    if (r.ok) {
      const body = r.body as Record<string, unknown>;
      expect(body.pairingCode).toBe("12345678");
    }
    expect(openwa.requestPairingCode).toHaveBeenCalledWith("owa-1", "6281234567890");
  });

  it("normalizes phone number (strips +, spaces, dashes)", async () => {
    vi.mocked(queryD1One).mockResolvedValue(mockDevice);
    vi.mocked(openwa.requestPairingCode).mockResolvedValue({ pairingCode: "12345678", status: "pairing" });

    await executeRequestPairingCode("dev1", "+62 812-345-67890", ctx);
    expect(openwa.requestPairingCode).toHaveBeenCalledWith("owa-1", "6281234567890");
  });

  it("deviceId empty → 400", async () => {
    const r = await executeRequestPairingCode("", "6281234567890", ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it("empty phoneNumber → 400", async () => {
    const r = await executeRequestPairingCode("dev1", "", ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it("invalid phoneNumber format → 400", async () => {
    const r = await executeRequestPairingCode("dev1", "abc", ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it("too short phoneNumber → 400", async () => {
    const r = await executeRequestPairingCode("dev1", "12345", ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it("device not found → 404", async () => {
    vi.mocked(queryD1One).mockResolvedValue(undefined);
    const r = await executeRequestPairingCode("nope", "6281234567890", ctx);
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it("rate limit → 429", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSec: 30 });
    const r = await executeRequestPairingCode("dev1", "6281234567890", ctx);
    expect(r).toMatchObject({ ok: false, status: 429 });
  });

  it("OpenWA error → 502", async () => {
    vi.mocked(queryD1One).mockResolvedValue(mockDevice);
    vi.mocked(openwa.requestPairingCode).mockRejectedValue(new OpenwaError(502, "fail"));
    const r = await executeRequestPairingCode("dev1", "6281234567890", ctx);
    expect(r).toMatchObject({ ok: false, status: 502 });
  });
});
