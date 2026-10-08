import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";

const verifyApiKeyMock = vi.fn();
const executeHistoryMock = vi.fn();

vi.mock("@/lib/authStore", () => ({
  verifyApiKey: (...args: unknown[]) => verifyApiKeyMock(...args),
}));
vi.mock("@/lib/readChatHistory", () => ({
  executeReadChatHistory: (...args: unknown[]) => executeHistoryMock(...args),
}));

beforeEach(() => {
  verifyApiKeyMock.mockReset();
  executeHistoryMock.mockReset();
  verifyApiKeyMock.mockResolvedValue({ tenantId: "t1", keyId: "k1" });
  executeHistoryMock.mockResolvedValue({
    ok: true,
    status: 200,
    body: { ok: true, deviceId: "dev1", chatId: "6281234567890@c.us", messages: [] },
  });
});

afterEach(() => vi.restoreAllMocks());

function get(
  chatId: string,
  query: Record<string, string> = {},
  headers: Record<string, string> = {},
): Promise<Response> {
  const qs = new URLSearchParams(query).toString();
  return GET(new Request(`http://x/v1/messages/${chatId}/history${qs ? `?${qs}` : ""}`, { headers }), {
    params: Promise.resolve({ chatId }),
  });
}

describe("GET /v1/messages/:chatId/history", () => {
  it("401 saat API key invalid", async () => {
    verifyApiKeyMock.mockResolvedValue(null);
    const res = await get("6281234567890%40c.us");
    expect(res.status).toBe(401);
    expect(executeHistoryMock).not.toHaveBeenCalled();
  });

  it("200 — delegasi chatId + limit/offset + X-Request-Id", async () => {
    const res = await get(
      "6281234567890@c.us",
      { limit: "50", offset: "100" },
      { "x-request-id": "req-h", authorization: "Bearer pintasend_abc" },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBe("req-h");
    expect(executeHistoryMock).toHaveBeenCalledWith(
      {
        chatId: "6281234567890@c.us",
        limit: 50,
        offset: 100,
      },
      expect.objectContaining({ tenantId: "t1", keyId: "k1", requestId: "req-h" }),
    );
  });

  it("limit non-angka → 400", async () => {
    const res = await get("6281234567890@c.us", { limit: "abc" });
    expect(res.status).toBe(400);
    expect(executeHistoryMock).not.toHaveBeenCalled();
  });

  it("chatId kosong → 400", async () => {
    const res = await get("");
    expect(res.status).toBe(400);
  });

  it("error result → status + X-Request-Id", async () => {
    executeHistoryMock.mockResolvedValue({ ok: false, status: 502, error: "Gateway error" });
    const res = await get("6281234567890@c.us");
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Gateway error" });
  });
});
