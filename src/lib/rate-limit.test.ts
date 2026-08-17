import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { checkRateLimit, clientIp, rateLimitResponse, _resetRateLimits } from "./rate-limit";

describe("rate-limit", () => {
  beforeEach(() => {
    _resetRateLimits();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("mengizinkan request di bawah limit", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await checkRateLimit("ip-1", 5, 60_000);
      expect(r.allowed).toBe(true);
    }
  });

  it("menolak request di atas limit dan memberi retryAfterSec", async () => {
    for (let i = 0; i < 5; i++) await checkRateLimit("ip-1", 5, 60_000);
    const r = await checkRateLimit("ip-1", 5, 60_000);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSec).toBeGreaterThan(0);
  });

  it("key berbeda tidak saling memengaruhi", async () => {
    for (let i = 0; i < 5; i++) await checkRateLimit("ip-a", 5, 60_000);
    const r = await checkRateLimit("ip-b", 5, 60_000);
    expect(r.allowed).toBe(true);
  });

  it("window bergeser: setelah window lewat, request diizinkan lagi", async () => {
    for (let i = 0; i < 5; i++) await checkRateLimit("ip-1", 5, 60_000);
    expect((await checkRateLimit("ip-1", 5, 60_000)).allowed).toBe(false);

    vi.advanceTimersByTime(61_000);
    expect((await checkRateLimit("ip-1", 5, 60_000)).allowed).toBe(true);
  });

  it("window fixed-bucket: request di bucket baru dihitung ulang", async () => {
    await checkRateLimit("ip-1", 3, 60_000); // bucket t0
    vi.advanceTimersByTime(30_000);
    await checkRateLimit("ip-1", 3, 60_000); // bucket t0 (2/3)
    vi.advanceTimersByTime(31_000); // t61 → bucket baru
    const r = await checkRateLimit("ip-1", 3, 60_000);
    expect(r.allowed).toBe(true); // bucket baru mulai dari 1/3
  });

  it("clientIp prefer CF-Connecting-IP lalu X-Forwarded-For", () => {
    const req = new Request("http://x", {
      headers: { "CF-Connecting-IP": "1.2.3.4", "X-Forwarded-For": "9.9.9.9, 8.8.8.8" },
    });
    expect(clientIp(req)).toBe("1.2.3.4");

    const req2 = new Request("http://x", {
      headers: { "X-Forwarded-For": "9.9.9.9, 8.8.8.8" },
    });
    expect(clientIp(req2)).toBe("9.9.9.9");
  });

  it("clientIp fallback unknown", () => {
    expect(clientIp(new Request("http://x"))).toBe("unknown");
  });

  it("rateLimitResponse 429 + Retry-After", () => {
    const res = rateLimitResponse(30);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});
