import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { executeGetDeviceConfig, executePatchDeviceConfig } from "./deviceConfig";
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
    openwa: { getConfig: vi.fn(), patchConfig: vi.fn() },
    OpenwaError: MockOpenwaError,
    publicOpenwaError: () => "Gateway WhatsApp sedang bermasalah.",
  };
});
vi.mock("./rate-limit", () => ({ checkRateLimit: vi.fn() }));

const ctx = { tenantId: "t1", keyId: "k1", requestId: "req-cfg-1" };
const mockDevice = { id: "dev1", openwaSessionId: "owa-1", status: "ready" };
const mockConfig = { autoRejectCalls: false, maxReconnectAttempts: null, reconnectBaseDelay: 5000 };

beforeEach(() => { vi.clearAllMocks(); vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true }); });
afterEach(() => vi.restoreAllMocks());

// ── Get Config ──────────────────────────────────────────────────────────────

describe("executeGetDeviceConfig", () => {
  it("returns config for ready device", async () => {
    vi.mocked(queryD1One).mockResolvedValue(mockDevice);
    vi.mocked(openwa.getConfig).mockResolvedValue(mockConfig);

    const r = await executeGetDeviceConfig("dev1", ctx);
    expect(r).toMatchObject({ ok: true, status: 200 });
    expect(openwa.getConfig).toHaveBeenCalledWith("owa-1");
  });

  it("deviceId empty → 400", async () => {
    const r = await executeGetDeviceConfig("", ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it("device not found → 404", async () => {
    vi.mocked(queryD1One).mockResolvedValue(undefined);
    const r = await executeGetDeviceConfig("nope", ctx);
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it("device not ready → 409", async () => {
    vi.mocked(queryD1One).mockResolvedValue({ ...mockDevice, status: "initializing" });
    const r = await executeGetDeviceConfig("dev1", ctx);
    expect(r).toMatchObject({ ok: false, status: 409 });
  });

  it("rate limit → 429", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSec: 30 });
    const r = await executeGetDeviceConfig("dev1", ctx);
    expect(r).toMatchObject({ ok: false, status: 429 });
  });

  it("OpenWA error → 502", async () => {
    vi.mocked(queryD1One).mockResolvedValue(mockDevice);
    vi.mocked(openwa.getConfig).mockRejectedValue(new OpenwaError(502, "fail"));
    const r = await executeGetDeviceConfig("dev1", ctx);
    expect(r).toMatchObject({ ok: false, status: 502 });
  });
});

// ── Patch Config ────────────────────────────────────────────────────────────

describe("executePatchDeviceConfig", () => {
  it("patches autoRejectCalls", async () => {
    vi.mocked(queryD1One).mockResolvedValue(mockDevice);
    vi.mocked(openwa.patchConfig).mockResolvedValue({ ...mockConfig, autoRejectCalls: true });

    const r = await executePatchDeviceConfig("dev1", { autoRejectCalls: true }, ctx);
    expect(r).toMatchObject({ ok: true, status: 200 });
    expect(openwa.patchConfig).toHaveBeenCalledWith("owa-1", { autoRejectCalls: true });
  });

  it("patches maxReconnectAttempts to null (unlimited)", async () => {
    vi.mocked(queryD1One).mockResolvedValue(mockDevice);
    vi.mocked(openwa.patchConfig).mockResolvedValue({ ...mockConfig, maxReconnectAttempts: null });

    const r = await executePatchDeviceConfig("dev1", { maxReconnectAttempts: null }, ctx);
    expect(r).toMatchObject({ ok: true, status: 200 });
  });

  it("patches reconnectBaseDelay", async () => {
    vi.mocked(queryD1One).mockResolvedValue(mockDevice);
    vi.mocked(openwa.patchConfig).mockResolvedValue({ ...mockConfig, reconnectBaseDelay: 10000 });

    const r = await executePatchDeviceConfig("dev1", { reconnectBaseDelay: 10000 }, ctx);
    expect(r).toMatchObject({ ok: true, status: 200 });
  });

  it("invalid reconnectBaseDelay → 400", async () => {
    const r = await executePatchDeviceConfig("dev1", { reconnectBaseDelay: 500 }, ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it("invalid maxReconnectAttempts → 400", async () => {
    const r = await executePatchDeviceConfig("dev1", { maxReconnectAttempts: -1 }, ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it("device not found → 404", async () => {
    vi.mocked(queryD1One).mockResolvedValue(undefined);
    const r = await executePatchDeviceConfig("nope", { autoRejectCalls: true }, ctx);
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it("OpenWA error → 502", async () => {
    vi.mocked(queryD1One).mockResolvedValue(mockDevice);
    vi.mocked(openwa.patchConfig).mockRejectedValue(new OpenwaError(502, "fail"));
    const r = await executePatchDeviceConfig("dev1", { autoRejectCalls: true }, ctx);
    expect(r).toMatchObject({ ok: false, status: 502 });
  });
});
