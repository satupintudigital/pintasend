import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { GET, POST } from "./route";

// Route THIN: mock auth + service; yang diuji = X-Request-Id, parsing body & log.
const verifyApiKeyMock = vi.fn();
const executeGetMock = vi.fn();
const executeSetMock = vi.fn();

vi.mock("@/lib/authStore", () => ({
  verifyApiKey: (...args: unknown[]) => verifyApiKeyMock(...args),
}));
vi.mock("@/lib/watermarkAddon", () => ({
  executeWatermarkAddonGet: (...args: unknown[]) => executeGetMock(...args),
  executeWatermarkAddonSet: (...args: unknown[]) => executeSetMock(...args),
}));

const okGet = {
  ok: true,
  status: 200,
  body: { ok: true, addon: "remove_watermark", active: false, watermark: true },
};
const okSet = {
  ok: true,
  status: 200,
  body: { ok: true, addon: "remove_watermark", active: true, watermark: false },
};

beforeEach(() => {
  verifyApiKeyMock.mockReset();
  executeGetMock.mockReset();
  executeSetMock.mockReset();
  verifyApiKeyMock.mockResolvedValue({ tenantId: "t1", keyId: "k1" });
  executeGetMock.mockResolvedValue(okGet);
  executeSetMock.mockResolvedValue(okSet);
});

afterEach(() => vi.restoreAllMocks());

const UUIDV7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("GET /v1/addons/remove-watermark", () => {
  it("auth Bearer → delegasi ke service dengan ctx + echo X-Request-Id", async () => {
    const res = await GET(new Request("http://x/v1/addons/remove-watermark", {
      headers: { "x-request-id": "req-g-1", authorization: "Bearer pintasend_abc" },
    }));

    expect(res.headers.get("x-request-id")).toBe("req-g-1");
    expect(executeGetMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t1", keyId: "k1", requestId: "req-g-1" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(okGet.body);
  });

  it("API key tidak valid → 401, service tidak dipanggil", async () => {
    verifyApiKeyMock.mockResolvedValue(null);
    const res = await GET(new Request("http://x/v1/addons/remove-watermark"));
    expect(res.status).toBe(401);
    expect(res.headers.get("x-request-id")).toMatch(UUIDV7_RE);
    expect(executeGetMock).not.toHaveBeenCalled();
  });

  it("error service (429) → status + Retry-After + X-Request-Id", async () => {
    executeGetMock.mockResolvedValue({ ok: false, status: 429, error: "Terlalu banyak", retryAfterSec: 30 });
    const res = await GET(new Request("http://x/v1/addons/remove-watermark", {
      headers: { authorization: "Bearer pintasend_abc" },
    }));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("30");
    expect(res.headers.get("x-request-id")).toMatch(UUIDV7_RE);
  });
});

describe("POST /v1/addons/remove-watermark", () => {
  function post(body: unknown): Promise<Response> {
    return POST(
      new Request("http://x/v1/addons/remove-watermark", {
        method: "POST",
        headers: { "content-type": "application/json", "x-request-id": "req-p-1", authorization: "Bearer pintasend_abc" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  }

  it("active:true → delegasi ke service + respons sukses", async () => {
    const res = await post({ active: true });

    expect(executeSetMock).toHaveBeenCalledWith(true, expect.objectContaining({ tenantId: "t1", keyId: "k1", requestId: "req-p-1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(okSet.body);
    expect(res.headers.get("x-request-id")).toBe("req-p-1");
  });

  it("active:false → delegasi dengan false", async () => {
    await post({ active: false });
    expect(executeSetMock).toHaveBeenCalledWith(false, expect.any(Object));
  });

  it("body bukan JSON / tanpa active → 400, service tidak dipanggil", async () => {
    const res = await post({});
    expect(res.status).toBe(400);
    expect(executeSetMock).not.toHaveBeenCalled();
  });

  it("active bukan boolean → 400", async () => {
    const res = await post({ active: "yes" });
    expect(res.status).toBe(400);
    expect(executeSetMock).not.toHaveBeenCalled();
  });

  it("API key tidak valid → 401", async () => {
    verifyApiKeyMock.mockResolvedValue(null);
    const res = await post({ active: true });
    expect(res.status).toBe(401);
    expect(executeSetMock).not.toHaveBeenCalled();
  });
});
