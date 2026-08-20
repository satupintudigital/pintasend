import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";

// Route THIN: mock auth + service; yang diuji = X-Request-Id, parsing query & log.
const verifyApiKeyMock = vi.fn();
const executeListGroupsMock = vi.fn();

vi.mock("@/lib/authStore", () => ({
  verifyApiKey: (...args: unknown[]) => verifyApiKeyMock(...args),
}));
vi.mock("@/lib/listGroups", () => ({
  executeListGroups: (...args: unknown[]) => executeListGroupsMock(...args),
}));

const okResult = {
  ok: true,
  status: 200,
  body: {
    ok: true,
    deviceId: "dev1",
    count: 1,
    groups: [{ id: "120363024@g.us", name: "Tim Engineering", linkedParentJID: null }],
  },
};

beforeEach(() => {
  verifyApiKeyMock.mockReset();
  executeListGroupsMock.mockReset();
  verifyApiKeyMock.mockResolvedValue({ tenantId: "t1", keyId: "k1" });
  executeListGroupsMock.mockResolvedValue(okResult);
});

afterEach(() => vi.restoreAllMocks());

function get(query = "", headers: Record<string, string> = {}): Promise<Response> {
  return GET(new Request(`http://x/v1/groups${query}`, { headers }));
}

const UUIDV7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("GET /v1/groups", () => {
  it("auth Bearer → meneruskan deviceId + limit + offset ke service, echo X-Request-Id", async () => {
    const res = await get("?deviceId=dev9&limit=20&offset=5", {
      "x-request-id": "req-g-1",
      authorization: "Bearer wavio_abc",
    });

    expect(res.headers.get("x-request-id")).toBe("req-g-1");
    expect(executeListGroupsMock).toHaveBeenCalledWith(
      { deviceId: "dev9", limit: 20, offset: 5 },
      expect.objectContaining({ tenantId: "t1", keyId: "k1", requestId: "req-g-1" }),
    );
  });

  it("tanpa query → deviceId/limit/offset undefined", async () => {
    await get("", { authorization: "Bearer wavio_abc" });
    expect(executeListGroupsMock).toHaveBeenCalledWith(
      { deviceId: undefined, limit: undefined, offset: undefined },
      expect.any(Object),
    );
  });

  it("limit/offset bukan angka → undefined", async () => {
    await get("?limit=abc&offset=zzz", { authorization: "Bearer wavio_abc" });
    expect(executeListGroupsMock).toHaveBeenCalledWith(
      { deviceId: undefined, limit: undefined, offset: undefined },
      expect.any(Object),
    );
  });

  it("API key tidak valid → 401 + X-Request-Id tetap ada", async () => {
    verifyApiKeyMock.mockResolvedValue(null);
    const res = await get();
    expect(res.status).toBe(401);
    expect(res.headers.get("x-request-id")).toMatch(UUIDV7_RE);
    expect(executeListGroupsMock).not.toHaveBeenCalled();
  });

  it("error result (429) → status + Retry-After + X-Request-Id", async () => {
    executeListGroupsMock.mockResolvedValue({
      ok: false,
      status: 429,
      error: "Terlalu banyak permintaan",
      retryAfterSec: 30,
    });
    const res = await get();
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("30");
    expect(res.headers.get("x-request-id")).toMatch(UUIDV7_RE);
  });

  it("sukses → status 200 + body dari service", async () => {
    const res = await get("", { "x-request-id": "req-ok-1", authorization: "Bearer wavio_abc" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(okResult.body);
    expect(res.headers.get("x-request-id")).toBe("req-ok-1");
  });
});

describe("GET /v1/groups — structured logging", () => {
  it("mencatat api_key_auth (info) dengan requestId + tenantId", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await get("", { "x-request-id": "req-log-1", authorization: "Bearer wavio_abc" });

    const lines = spy.mock.calls.map((c) => JSON.parse(c[0] as string));
    const auth = lines.find((l) => l.event === "api_key_auth");
    expect(auth).toBeTruthy();
    expect(auth.requestId).toBe("req-log-1");
    expect(auth.tenantId).toBe("t1");
    expect(auth.keyId).toBe("k1");
    expect(auth.ok).toBe(true);
  });

  it("API key invalid → log warn dengan ok:false", async () => {
    verifyApiKeyMock.mockResolvedValue(null);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await get("", { "x-request-id": "req-log-2" });

    const lines = warn.mock.calls.map((c) => JSON.parse(c[0] as string));
    const auth = lines.find((l) => l.event === "api_key_auth");
    expect(auth).toBeTruthy();
    expect(auth.ok).toBe(false);
    expect(auth.requestId).toBe("req-log-2");
  });
});
