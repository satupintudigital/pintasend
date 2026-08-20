import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";

// Mock D1 — health check baca D1 (0 Neon).
const queryD1Mock = vi.fn();
vi.mock("@/lib/d1", () => ({
  queryD1: (...args: unknown[]) => queryD1Mock(...args),
}));

describe("GET /api/health — endpoint publik", () => {
  const originalUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    queryD1Mock.mockReset();
    queryD1Mock.mockResolvedValue([{ count: 3 }]);
  });

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
    vi.restoreAllMocks();
  });

  it("sehat: ok + hasUrl + userCount, TANPA host DB di respons", async () => {
    process.env.DATABASE_URL =
      "postgresql://user:pass@ep-silent-block-azloxik2-pooler.eu-central-1.aws.neon.tech/db?sslmode=require";
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, hasUrl: true, userCount: 3 });
    // Host / kredensial DB tidak pernah muncul di respons publik.
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("neon.tech");
    expect(raw).not.toContain("ep-silent");
    expect(raw).not.toContain("user:pass");
    expect(raw).not.toContain("host");
  });

  it("D1 gagal → ok false + pesan generik; detail internal hanya di log", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    queryD1Mock.mockRejectedValue(new Error("D1 down: connection refused 10.0.0.5"));

    const res = await GET();
    const body = await res.json();

    expect(body.ok).toBe(false);
    const raw = JSON.stringify(body);
    // Detail error internal tidak bocor ke publik.
    expect(raw).not.toContain("D1 down");
    expect(raw).not.toContain("10.0.0.5");
    // Tapi tetap tercatat di log server untuk debugging (argumen object).
    expect(spy).toHaveBeenCalled();
    const logged = JSON.stringify(spy.mock.calls[0]);
    expect(logged).toContain("10.0.0.5");
  });
});
