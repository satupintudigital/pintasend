import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { executeListChannels, executeCreateChannel } from "./channels";
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
    openwa: { listChannels: vi.fn(), createChannel: vi.fn() },
    OpenwaError: MockOpenwaError,
    publicOpenwaError: () => "Gateway WhatsApp sedang bermasalah.",
  };
});
vi.mock("./rate-limit", () => ({ checkRateLimit: vi.fn() }));

const ctx = { tenantId: "t1", keyId: "k1", requestId: "req-ch-1" };
const mockDevice = { id: "dev1", openwaSessionId: "owa-1", status: "ready" };

beforeEach(() => { vi.clearAllMocks(); vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true }); });
afterEach(() => vi.restoreAllMocks());

// ── List Channels ───────────────────────────────────────────────────────────

describe("executeListChannels", () => {
  it("lists channels", async () => {
    vi.mocked(queryD1One).mockResolvedValue(mockDevice);
    vi.mocked(openwa.listChannels).mockResolvedValue([
      { id: "ch1", name: "My Channel", description: "Test", subscriberCount: 100 },
    ]);

    const r = await executeListChannels("dev1", ctx);
    expect(r).toMatchObject({ ok: true, status: 200 });
    expect(openwa.listChannels).toHaveBeenCalledWith("owa-1");
  });

  it("returns empty list", async () => {
    vi.mocked(queryD1One).mockResolvedValue(mockDevice);
    vi.mocked(openwa.listChannels).mockResolvedValue([]);

    const r = await executeListChannels("dev1", ctx);
    expect(r).toMatchObject({ ok: true, status: 200 });
  });

  it("deviceId empty → 400", async () => {
    const r = await executeListChannels("", ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it("device not found → 404", async () => {
    vi.mocked(queryD1One).mockResolvedValue(undefined);
    const r = await executeListChannels("nope", ctx);
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it("rate limit → 429", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSec: 30 });
    const r = await executeListChannels("dev1", ctx);
    expect(r).toMatchObject({ ok: false, status: 429 });
  });

  it("OpenWA error → 502", async () => {
    vi.mocked(queryD1One).mockResolvedValue(mockDevice);
    vi.mocked(openwa.listChannels).mockRejectedValue(new OpenwaError(502, "fail"));
    const r = await executeListChannels("dev1", ctx);
    expect(r).toMatchObject({ ok: false, status: 502 });
  });
});

// ── Create Channel ──────────────────────────────────────────────────────────

describe("executeCreateChannel", () => {
  it("creates channel", async () => {
    vi.mocked(queryD1One).mockResolvedValue(mockDevice);
    vi.mocked(openwa.createChannel).mockResolvedValue({ id: "ch_new", name: "New Channel" });

    const r = await executeCreateChannel("dev1", { name: "New Channel" }, ctx);
    expect(r).toMatchObject({ ok: true, status: 200 });
    expect(openwa.createChannel).toHaveBeenCalledWith("owa-1", { name: "New Channel" });
  });

  it("creates channel with description", async () => {
    vi.mocked(queryD1One).mockResolvedValue(mockDevice);
    vi.mocked(openwa.createChannel).mockResolvedValue({ id: "ch_new", name: "New" });

    const r = await executeCreateChannel("dev1", { name: "New", description: "My desc" }, ctx);
    expect(r).toMatchObject({ ok: true, status: 200 });
    expect(openwa.createChannel).toHaveBeenCalledWith("owa-1", { name: "New", description: "My desc" });
  });

  it("empty name → 400", async () => {
    const r = await executeCreateChannel("dev1", { name: "" }, ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it("deviceId empty → 400", async () => {
    const r = await executeCreateChannel("", { name: "Test" }, ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it("device not found → 404", async () => {
    vi.mocked(queryD1One).mockResolvedValue(undefined);
    const r = await executeCreateChannel("nope", { name: "Test" }, ctx);
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it("rate limit → 429", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSec: 30 });
    const r = await executeCreateChannel("dev1", { name: "Test" }, ctx);
    expect(r).toMatchObject({ ok: false, status: 429 });
  });

  it("OpenWA error → 502", async () => {
    vi.mocked(queryD1One).mockResolvedValue(mockDevice);
    vi.mocked(openwa.createChannel).mockRejectedValue(new OpenwaError(502, "fail"));
    const r = await executeCreateChannel("dev1", { name: "Test" }, ctx);
    expect(r).toMatchObject({ ok: false, status: 502 });
  });
});
