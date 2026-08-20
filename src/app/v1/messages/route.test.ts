import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

// Route THIN: mock auth + service; yang diuji = X-Request-Id & structured log.
const verifyApiKeyMock = vi.fn();
const executeSendMessageMock = vi.fn();

vi.mock("@/lib/authStore", () => ({
  verifyApiKey: (...args: unknown[]) => verifyApiKeyMock(...args),
}));
vi.mock("@/lib/sendMessage", () => ({
  executeSendMessage: (...args: unknown[]) => executeSendMessageMock(...args),
}));

const okResult = {
  ok: true,
  status: 200,
  body: { ok: true, messageId: "m1", to: "6281234567890@c.us" },
};

beforeEach(() => {
  verifyApiKeyMock.mockReset();
  executeSendMessageMock.mockReset();
  verifyApiKeyMock.mockResolvedValue({ tenantId: "t1", keyId: "k1" });
  executeSendMessageMock.mockResolvedValue(okResult);
});

afterEach(() => vi.restoreAllMocks());

function post(headers: Record<string, string> = {}): Promise<Response> {
  return POST(
    new Request("http://x/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ to: "6281234567890", text: "Halo" }),
    }),
  );
}

const UUIDV7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("POST /v1/messages — X-Request-Id", () => {
  it("echo X-Request-Id masuk di header respons & meneruskan ke service", async () => {
    const res = await post({ "x-request-id": "req-client-1", authorization: "Bearer wavio_abc" });

    expect(res.headers.get("x-request-id")).toBe("req-client-1");
    expect(executeSendMessageMock).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({ tenantId: "t1", keyId: "k1", requestId: "req-client-1" }),
    );
  });

  it("tanpa header → generate uuidv7 & echo di respons", async () => {
    const res = await post();
    expect(res.headers.get("x-request-id")).toMatch(UUIDV7_RE);
  });

  it("API key tidak valid → 401 + X-Request-Id tetap ada (untuk tracing)", async () => {
    verifyApiKeyMock.mockResolvedValue(null);
    const res = await post();
    expect(res.status).toBe(401);
    expect(res.headers.get("x-request-id")).toMatch(UUIDV7_RE);
    expect(executeSendMessageMock).not.toHaveBeenCalled();
  });

  it("error result (429) → status + Retry-After + X-Request-Id", async () => {
    executeSendMessageMock.mockResolvedValue({
      ok: false,
      status: 429,
      error: "Terlalu banyak permintaan",
      retryAfterSec: 30,
    });
    const res = await post();
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("30");
    expect(res.headers.get("x-request-id")).toMatch(UUIDV7_RE);
  });

  it("sukses → status 200 + body dari service + X-Request-Id", async () => {
    const res = await post({ "x-request-id": "req-ok-1" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, messageId: "m1", to: "6281234567890@c.us" });
    expect(res.headers.get("x-request-id")).toBe("req-ok-1");
  });
});

describe("POST /v1/messages — structured logging", () => {
  it("mencatat event api_key_auth (info) dengan requestId + tenantId", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await post({ "x-request-id": "req-log-1", authorization: "Bearer wavio_abc" });

    const lines = spy.mock.calls.map((c) => JSON.parse(c[0] as string));
    const auth = lines.find((l) => l.event === "api_key_auth");
    expect(auth).toBeTruthy();
    expect(auth.requestId).toBe("req-log-1");
    expect(auth.tenantId).toBe("t1");
    expect(auth.keyId).toBe("k1");
    expect(auth.ok).toBe(true);
  });

  it("API key invalid → log warn dengan ok:false (bukan info)", async () => {
    verifyApiKeyMock.mockResolvedValue(null);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await post({ "x-request-id": "req-log-2" });

    const lines = warn.mock.calls.map((c) => JSON.parse(c[0] as string));
    const auth = lines.find((l) => l.event === "api_key_auth");
    expect(auth).toBeTruthy();
    expect(auth.ok).toBe(false);
    expect(auth.requestId).toBe("req-log-2");
  });
});
