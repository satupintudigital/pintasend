import { describe, expect, it, vi, afterEach } from "vitest";
import { sanitizeRequestId, getRequestId, logEvent } from "./requestLogger";
import { uuidv7Timestamp } from "./uuidv7";

function reqWith(headers: Record<string, string> = {}): Request {
  return new Request("http://x/", { headers });
}

describe("requestLogger — X-Request-Id", () => {
  afterEach(() => vi.restoreAllMocks());

  it("memakai X-Request-Id masuk yang valid (trace lintas layanan)", () => {
    const req = reqWith({ "x-request-id": "req-abc_123.xyz" });
    expect(getRequestId(req)).toBe("req-abc_123.xyz");
  });

  it("menghasilkan uuidv7 bila header tidak ada", () => {
    const id = getRequestId(reqWith());
    // Format uuid v7: versi 7 di grup ke-3.
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("menolak header tidak aman (charset aneh) → generate baru", () => {
    // Header ber-newline ditolak platform, tapi sanitizeRequestId tetap bertahan
    // terhadap charset aneh (mis. spasi, karakter unicode, kurung).
    const req = reqWith({ "x-request-id": "req-abc (inject) " });
    const id = getRequestId(req);
    expect(id).not.toContain("inject");
    expect(id).toMatch(/^[0-9a-f-]+$/);
    expect(sanitizeRequestId("req-abc\nInjected-Log")).toBeNull();
  });

  it("menolak header terlalu panjang (>128) → generate baru", () => {
    const req = reqWith({ "x-request-id": "x".repeat(200) });
    expect(getRequestId(req).length).toBeLessThanOrEqual(36);
  });

  it("sanitizeRequestId: null/kosong/whitespace → null", () => {
    expect(sanitizeRequestId(null)).toBeNull();
    expect(sanitizeRequestId("")).toBeNull();
    expect(sanitizeRequestId("   ")).toBeNull();
    expect(sanitizeRequestId(undefined)).toBeNull();
  });
});

describe("requestLogger — structured logEvent", () => {
  afterEach(() => vi.restoreAllMocks());

  it("mengirim SATU baris JSON dengan level/event/requestId/timestamp + fields", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logEvent("info", "send_success", "req-1", { tenantId: "t1", status: 200 });

    expect(spy).toHaveBeenCalledTimes(1);
    const line = spy.mock.calls[0][0] as string;
    const parsed = JSON.parse(line);
    expect(parsed.level).toBe("info");
    expect(parsed.event).toBe("send_success");
    expect(parsed.requestId).toBe("req-1");
    expect(parsed.tenantId).toBe("t1");
    expect(parsed.status).toBe(200);
    expect(typeof parsed.timestamp).toBe("string");
    expect(new Date(parsed.timestamp).getTime()).not.toBeNaN();
  });

  it("level error → console.error; warn → console.warn", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    logEvent("error", "send_failed", "req-2", { detail: "down" });
    logEvent("warn", "rate_limited", "req-3", { retryAfterSec: 30 });

    expect(err).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(err.mock.calls[0][0] as string).event).toBe("send_failed");
    expect(JSON.parse(warn.mock.calls[0][0] as string).event).toBe("rate_limited");
  });

  it("tanpa fields → tetap JSON valid tanpa key tambahan", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logEvent("info", "ping", "req-4");
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed).toMatchObject({ level: "info", event: "ping", requestId: "req-4" });
  });

  it("uuidv7 dari getRequestId punya timestamp valid (baru dibuat)", () => {
    const id = getRequestId(reqWith());
    const ts = uuidv7Timestamp(id).getTime();
    expect(ts).toBeGreaterThan(0);
    expect(Math.abs(Date.now() - ts)).toBeLessThan(60_000);
  });
});
