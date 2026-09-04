import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

const verifyApiKeyMock = vi.fn();
const executeReactMock = vi.fn();

vi.mock("@/lib/authStore", () => ({
  verifyApiKey: (...args: unknown[]) => verifyApiKeyMock(...args),
}));
vi.mock("@/lib/reactToMessage", () => ({
  executeReactToMessage: (...args: unknown[]) => executeReactMock(...args),
}));

beforeEach(() => {
  verifyApiKeyMock.mockReset();
  executeReactMock.mockReset();
  verifyApiKeyMock.mockResolvedValue({ tenantId: "t1", keyId: "k1" });
  executeReactMock.mockResolvedValue({
    ok: true,
    status: 200,
    body: { ok: true, deviceId: "dev1", chatId: "6281234567890@c.us", messageId: "msg-1", emoji: "👍" },
  });
});

afterEach(() => vi.restoreAllMocks());

function post(body: Record<string, unknown>, headers: Record<string, string> = {}): Promise<Response> {
  return POST(
    new Request("http://x/v1/messages/react", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /v1/messages/react", () => {
  it("401 saat API key invalid", async () => {
    verifyApiKeyMock.mockResolvedValue(null);
    const res = await post({ chatId: "6281234567890@c.us", messageId: "msg-1", emoji: "👍" });
    expect(res.status).toBe(401);
    expect(executeReactMock).not.toHaveBeenCalled();
  });

  it("200 — delegasi chatId + messageId + emoji + X-Request-Id", async () => {
    const res = await post(
      { chatId: "6281234567890@c.us", messageId: "msg-1", emoji: "👍", deviceId: "dev9" },
      { "x-request-id": "req-r", authorization: "Bearer wavio_abc" },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBe("req-r");
    expect(executeReactMock).toHaveBeenCalledWith(
      { chatId: "6281234567890@c.us", messageId: "msg-1", emoji: "👍", deviceId: "dev9" },
      expect.objectContaining({ tenantId: "t1", keyId: "k1", requestId: "req-r" }),
    );
  });

  it("body bukan JSON → 400", async () => {
    const res = await POST(new Request("http://x/v1/messages/react", { method: "POST", body: "not-json" }));
    expect(res.status).toBe(400);
    expect(executeReactMock).not.toHaveBeenCalled();
  });

  it("error result → status + X-Request-Id", async () => {
    executeReactMock.mockResolvedValue({ ok: false, status: 502, error: "Gateway error" });
    const res = await post({ chatId: "6281234567890@c.us", messageId: "msg-1", emoji: "👍" });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Gateway error" });
  });
});
