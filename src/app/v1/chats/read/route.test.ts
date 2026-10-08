import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

const verifyApiKeyMock = vi.fn();
const executeMarkChatReadMock = vi.fn();

vi.mock("@/lib/authStore", () => ({
  verifyApiKey: (...args: unknown[]) => verifyApiKeyMock(...args),
}));
vi.mock("@/lib/markChatRead", () => ({
  executeMarkChatRead: (...args: unknown[]) => executeMarkChatReadMock(...args),
}));

beforeEach(() => {
  verifyApiKeyMock.mockReset();
  executeMarkChatReadMock.mockReset();
  verifyApiKeyMock.mockResolvedValue({ tenantId: "t1", keyId: "k1" });
  executeMarkChatReadMock.mockResolvedValue({
    ok: true,
    status: 200,
    body: { ok: true, deviceId: "dev1", chatId: "6281234567890@c.us", read: true },
  });
});

afterEach(() => vi.restoreAllMocks());

function post(body: Record<string, unknown>, headers: Record<string, string> = {}): Promise<Response> {
  return POST(
    new Request("http://x/v1/chats/read", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /v1/chats/read", () => {
  it("delegasi chatId + messageIds + deviceId + X-Request-Id echo", async () => {
    const res = await post(
      { chatId: "081234567890", messageIds: ["true_1_ABC"], deviceId: "dev9" },
      { "x-request-id": "req-r-1", authorization: "Bearer pintasend_abc" },
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBe("req-r-1");
    expect(executeMarkChatReadMock).toHaveBeenCalledWith(
      { chatId: "081234567890", messageIds: ["true_1_ABC"], deviceId: "dev9" },
      expect.objectContaining({ tenantId: "t1", keyId: "k1", requestId: "req-r-1" }),
    );
  });

  it("API key invalid → 401", async () => {
    verifyApiKeyMock.mockResolvedValue(null);
    const res = await post({ chatId: "6281234567890" });
    expect(res.status).toBe(401);
    expect(executeMarkChatReadMock).not.toHaveBeenCalled();
  });

  it("body bukan JSON → 400", async () => {
    const res = await POST(
      new Request("http://x/v1/chats/read", { method: "POST", body: "not-json" }),
    );
    expect(res.status).toBe(400);
    expect(executeMarkChatReadMock).not.toHaveBeenCalled();
  });

  it("error result (409) → status + X-Request-Id", async () => {
    executeMarkChatReadMock.mockResolvedValue({ ok: false, status: 409, error: "Device tidak siap" });
    const res = await post({ chatId: "6281234567890" });
    expect(res.status).toBe(409);
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });
});
