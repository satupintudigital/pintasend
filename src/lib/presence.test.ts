import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { executeSetOwnPresence, executeSubscribePresence, executeGetPresence } from "./presence";
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
    openwa: { setOwnPresence: vi.fn(), subscribePresence: vi.fn(), getPresence: vi.fn() },
    OpenwaError: MockOpenwaError,
    publicOpenwaError: () => "Gateway WhatsApp sedang bermasalah.",
  };
});
vi.mock("./rate-limit", () => ({ checkRateLimit: vi.fn() }));

const ctx = { tenantId: "t1", keyId: "k1", requestId: "req-pres-1" };
const mockDevice = { id: "dev1", openwaSessionId: "owa-1", status: "ready" };

beforeEach(() => { vi.clearAllMocks(); vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true }); });
afterEach(() => vi.restoreAllMocks());

// ── Set Own Presence ────────────────────────────────────────────────────────

describe("executeSetOwnPresence", () => {
  it("sets online presence", async () => {
    vi.mocked(queryD1One).mockResolvedValue(mockDevice);
    vi.mocked(openwa.setOwnPresence).mockResolvedValue({ success: true });

    const r = await executeSetOwnPresence("dev1", true, ctx);
    expect(r).toMatchObject({ ok: true, status: 200, body: { available: true } });
    expect(openwa.setOwnPresence).toHaveBeenCalledWith("owa-1", true);
  });

  it("sets offline presence", async () => {
    vi.mocked(queryD1One).mockResolvedValue(mockDevice);
    vi.mocked(openwa.setOwnPresence).mockResolvedValue({ success: true });

    const r = await executeSetOwnPresence("dev1", false, ctx);
    expect(r).toMatchObject({ ok: true, status: 200, body: { available: false } });
  });

  it("deviceId empty → 400", async () => {
    const r = await executeSetOwnPresence("", true, ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it("device not found → 404", async () => {
    vi.mocked(queryD1One).mockResolvedValue(undefined);
    const r = await executeSetOwnPresence("nope", true, ctx);
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it("rate limit → 429", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSec: 30 });
    const r = await executeSetOwnPresence("dev1", true, ctx);
    expect(r).toMatchObject({ ok: false, status: 429 });
  });

  it("OpenWA error → 502", async () => {
    vi.mocked(queryD1One).mockResolvedValue(mockDevice);
    vi.mocked(openwa.setOwnPresence).mockRejectedValue(new OpenwaError(502, "fail"));
    const r = await executeSetOwnPresence("dev1", true, ctx);
    expect(r).toMatchObject({ ok: false, status: 502 });
  });
});

// ── Subscribe Presence ──────────────────────────────────────────────────────

describe("executeSubscribePresence", () => {
  it("subscribes to chat presence", async () => {
    vi.mocked(queryD1One).mockResolvedValue(mockDevice);
    vi.mocked(openwa.subscribePresence).mockResolvedValue({ success: true });

    const r = await executeSubscribePresence("dev1", "6281234567890@c.us", ctx);
    expect(r).toMatchObject({ ok: true, status: 200, body: { subscribed: true } });
    expect(openwa.subscribePresence).toHaveBeenCalledWith("owa-1", "6281234567890@c.us");
  });

  it("chatId empty → 400", async () => {
    const r = await executeSubscribePresence("dev1", "", ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it("device not found → 404", async () => {
    vi.mocked(queryD1One).mockResolvedValue(undefined);
    const r = await executeSubscribePresence("nope", "6281234567890@c.us", ctx);
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it("OpenWA error → 502", async () => {
    vi.mocked(queryD1One).mockResolvedValue(mockDevice);
    vi.mocked(openwa.subscribePresence).mockRejectedValue(new OpenwaError(502, "fail"));
    const r = await executeSubscribePresence("dev1", "6281234567890@c.us", ctx);
    expect(r).toMatchObject({ ok: false, status: 502 });
  });
});

// ── Get Presence ────────────────────────────────────────────────────────────

describe("executeGetPresence", () => {
  it("returns presence data", async () => {
    vi.mocked(queryD1One).mockResolvedValue(mockDevice);
    vi.mocked(openwa.getPresence).mockResolvedValue({
      chatId: "6281234567890@c.us",
      participants: [{ id: "6281234567890@c.us", state: "available" }],
      observedAt: "2026-09-04T00:00:00.000Z",
    });

    const r = await executeGetPresence("dev1", "6281234567890@c.us", ctx);
    expect(r).toMatchObject({ ok: true, status: 200 });
    expect(openwa.getPresence).toHaveBeenCalledWith("owa-1", "6281234567890@c.us");
  });

  it("returns null when no presence data", async () => {
    vi.mocked(queryD1One).mockResolvedValue(mockDevice);
    vi.mocked(openwa.getPresence).mockResolvedValue(null);

    const r = await executeGetPresence("dev1", "6281234567890@c.us", ctx);
    expect(r).toMatchObject({ ok: true, status: 200 });
    if (r.ok) {
      const body = r.body as Record<string, unknown>;
      expect(body.presence).toBeNull();
    }
  });

  it("chatId empty → 400", async () => {
    const r = await executeGetPresence("dev1", "", ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it("device not found → 404", async () => {
    vi.mocked(queryD1One).mockResolvedValue(undefined);
    const r = await executeGetPresence("nope", "6281234567890@c.us", ctx);
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it("OpenWA error → 502", async () => {
    vi.mocked(queryD1One).mockResolvedValue(mockDevice);
    vi.mocked(openwa.getPresence).mockRejectedValue(new OpenwaError(502, "fail"));
    const r = await executeGetPresence("dev1", "6281234567890@c.us", ctx);
    expect(r).toMatchObject({ ok: false, status: 502 });
  });
});
