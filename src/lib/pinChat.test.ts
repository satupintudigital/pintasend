import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { executePinChat } from "./pinChat";
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
    openwa: { pinChat: vi.fn() },
    OpenwaError: MockOpenwaError,
    publicOpenwaError: (e: unknown) =>
      e instanceof MockOpenwaError ? "Gateway WhatsApp sedang bermasalah." : String(e),
  };
});
vi.mock("./rate-limit", () => ({ checkRateLimit: vi.fn() }));

const ctx = { tenantId: "t1", keyId: "k1", requestId: "req-pin-1" };

function readyDevice(over = {}) {
  return { id: "dev1", label: "HP", openwaSessionId: "owa-1", status: "ready", ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(queryD1One).mockResolvedValue(readyDevice());
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
  vi.mocked(openwa.pinChat).mockResolvedValue({ success: true });
});

afterEach(() => vi.restoreAllMocks());

describe("executePinChat", () => {
  it("pin chat → panggil openwa.pinChat dengan pin=true", async () => {
    const r = await executePinChat({ chatId: "6281234567890@c.us", pin: true }, ctx);
    expect(r).toMatchObject({ ok: true, status: 200, body: { ok: true, pinned: true } });
    expect(openwa.pinChat).toHaveBeenCalledWith("owa-1", "6281234567890@c.us", true);
  });

  it("unpin chat → panggil openwa.pinChat dengan pin=false", async () => {
    const r = await executePinChat({ chatId: "6281234567890@c.us", pin: false }, ctx);
    expect(r).toMatchObject({ ok: true, status: 200, body: { ok: true, pinned: false } });
    expect(openwa.pinChat).toHaveBeenCalledWith("owa-1", "6281234567890@c.us", false);
  });

  it("chatId tidak valid → 400", async () => {
    const r = await executePinChat({ chatId: "", pin: true }, ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it("device tidak ditemukan → 409", async () => {
    vi.mocked(queryD1One).mockResolvedValue(undefined);
    const r = await executePinChat({ chatId: "6281234567890@c.us", pin: true }, ctx);
    expect(r).toMatchObject({ ok: false, status: 409 });
  });

  it("deviceId tidak ditemukan → 404", async () => {
    vi.mocked(queryD1One).mockResolvedValue(undefined);
    const r = await executePinChat({ chatId: "6281234567890@c.us", pin: true, deviceId: "nope" }, ctx);
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it("rate limit → 429", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSec: 30 });
    const r = await executePinChat({ chatId: "6281234567890@c.us", pin: true }, ctx);
    expect(r).toMatchObject({ ok: false, status: 429 });
  });

  it("OpenWA error → 502", async () => {
    vi.mocked(openwa.pinChat).mockRejectedValue(new OpenwaError(502, "fail"));
    const r = await executePinChat({ chatId: "6281234567890@c.us", pin: true }, ctx);
    expect(r).toMatchObject({ ok: false, status: 502 });
  });
});
