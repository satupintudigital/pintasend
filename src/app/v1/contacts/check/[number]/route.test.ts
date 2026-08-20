import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";

// Route THIN: mock auth + service; yang diuji = X-Request-Id & structured log.
const verifyApiKeyMock = vi.fn();
const executeCheckContactMock = vi.fn();

vi.mock("@/lib/authStore", () => ({
  verifyApiKey: (...args: unknown[]) => verifyApiKeyMock(...args),
}));
vi.mock("@/lib/checkContact", () => ({
  executeCheckContact: (...args: unknown[]) => executeCheckContactMock(...args),
}));

const okResult = {
  ok: true,
  status: 200,
  body: { ok: true, exists: true, whatsappId: "6281234567890@c.us" },
};

beforeEach(() => {
  verifyApiKeyMock.mockReset();
  executeCheckContactMock.mockReset();
  verifyApiKeyMock.mockResolvedValue({ tenantId: "t1", keyId: "k1" });
  executeCheckContactMock.mockResolvedValue(okResult);
});

afterEach(() => vi.restoreAllMocks());

function get(headers: Record<string, string> = {}, deviceId?: string): Promise<Response> {
  const query = deviceId ? `?deviceId=${deviceId}` : "";
  return GET(
    new Request(`http://x/v1/contacts/check/6281234567890${query}`, { headers }),
    { params: Promise.resolve({ number: "6281234567890" }) },
  );
}

const UUIDV7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("GET /v1/contacts/check/:number", () => {
  it("auth Bearer → meneruskan number + deviceId ke service, echo X-Request-Id", async () => {
    const res = await get({ "x-request-id": "req-cc-1", authorization: "Bearer wavio_abc" }, "dev9");

    expect(res.headers.get("x-request-id")).toBe("req-cc-1");
    expect(executeCheckContactMock).toHaveBeenCalledWith(
      { number: "6281234567890", deviceId: "dev9" },
      expect.objectContaining({ tenantId: "t1", keyId: "k1", requestId: "req-cc-1" }),
    );
  });

  it("tanpa header → generate uuidv7 & echo di respons", async () => {
    const res = await get();
    expect(res.headers.get("x-request-id")).toMatch(UUIDV7_RE);
  });

  it("API key tidak valid → 401 + X-Request-Id tetap ada", async () => {
    verifyApiKeyMock.mockResolvedValue(null);
    const res = await get();
    expect(res.status).toBe(401);
    expect(res.headers.get("x-request-id")).toMatch(UUIDV7_RE);
    expect(executeCheckContactMock).not.toHaveBeenCalled();
  });

  it("error result (429) → status + Retry-After + X-Request-Id", async () => {
    executeCheckContactMock.mockResolvedValue({
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
    const res = await get({ "x-request-id": "req-ok-1" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, exists: true, whatsappId: "6281234567890@c.us" });
    expect(res.headers.get("x-request-id")).toBe("req-ok-1");
  });
});

describe("GET /v1/contacts/check/:number — structured logging", () => {
  it("mencatat event api_key_auth (info) dengan requestId + tenantId", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await get({ "x-request-id": "req-log-1", authorization: "Bearer wavio_abc" });

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

    await get({ "x-request-id": "req-log-2" });

    const lines = warn.mock.calls.map((c) => JSON.parse(c[0] as string));
    const auth = lines.find((l) => l.event === "api_key_auth");
    expect(auth).toBeTruthy();
    expect(auth.ok).toBe(false);
    expect(auth.requestId).toBe("req-log-2");
  });
});
