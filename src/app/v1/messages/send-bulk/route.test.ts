import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

const verifyApiKeyMock = vi.fn();
const executeBulkMock = vi.fn();

vi.mock("@/lib/authStore", () => ({
  verifyApiKey: (...args: unknown[]) => verifyApiKeyMock(...args),
}));
vi.mock("@/lib/sendBulk", () => ({
  executeSendBulk: (...args: unknown[]) => executeBulkMock(...args),
}));

beforeEach(() => {
  verifyApiKeyMock.mockReset();
  executeBulkMock.mockReset();
  verifyApiKeyMock.mockResolvedValue({ tenantId: "t1", keyId: "k1" });
  executeBulkMock.mockResolvedValue({
    ok: true,
    status: 200,
    body: { ok: true, deviceId: "dev1", batchId: "batch-1", status: "processing", totalMessages: 2 },
  });
});

afterEach(() => vi.restoreAllMocks());

function post(body: Record<string, unknown>, headers: Record<string, string> = {}): Promise<Response> {
  return POST(
    new Request("http://x/v1/messages/send-bulk", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

const validBody = {
  deviceId: "dev1",
  messages: [{ to: "081234567890", type: "text", content: { text: "Halo" } }],
};

describe("POST /v1/messages/send-bulk", () => {
  it("401 saat API key invalid", async () => {
    verifyApiKeyMock.mockResolvedValue(null);
    const res = await post(validBody);
    expect(res.status).toBe(401);
    expect(executeBulkMock).not.toHaveBeenCalled();
  });

  it("200 — delegasi messages + opsi + deviceId + X-Request-Id", async () => {
    const res = await post(
      {
        deviceId: "dev9",
        messages: [{ to: "6281234567890", type: "text", content: { text: "Halo" } }],
        delayBetweenMessages: 3000,
        stopOnError: true,
      },
      { "x-request-id": "req-b", authorization: "Bearer wavio_abc" },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBe("req-b");
    expect(executeBulkMock).toHaveBeenCalledWith(
      {
        deviceId: "dev9",
        messages: [{ to: "6281234567890", type: "text", content: { text: "Halo" } }],
        delayBetweenMessages: 3000,
        stopOnError: true,
      },
      expect.objectContaining({ tenantId: "t1", keyId: "k1", requestId: "req-b" }),
    );
  });

  it("body bukan JSON → 400", async () => {
    const res = await POST(new Request("http://x/v1/messages/send-bulk", { method: "POST", body: "not-json" }));
    expect(res.status).toBe(400);
    expect(executeBulkMock).not.toHaveBeenCalled();
  });

  it("error result → status + Retry-After", async () => {
    executeBulkMock.mockResolvedValue({ ok: false, status: 429, error: "Kuota tidak cukup", retryAfterSec: 45 });
    const res = await post(validBody);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("45");
    expect(await res.json()).toEqual({ error: "Kuota tidak cukup" });
  });
});
