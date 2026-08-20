import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

const verifyApiKeyMock = vi.fn();
const executeSendTemplateMock = vi.fn();

vi.mock("@/lib/authStore", () => ({
  verifyApiKey: (...args: unknown[]) => verifyApiKeyMock(...args),
}));
vi.mock("@/lib/sendTemplate", () => ({
  executeSendTemplate: (...args: unknown[]) => executeSendTemplateMock(...args),
}));

beforeEach(() => {
  verifyApiKeyMock.mockReset();
  executeSendTemplateMock.mockReset();
  verifyApiKeyMock.mockResolvedValue({ tenantId: "t1", keyId: "k1" });
  executeSendTemplateMock.mockResolvedValue({
    ok: true,
    status: 200,
    body: { ok: true, deviceId: "dev1", to: "6281234567890@c.us", messageId: "m-tpl", templateName: "pesanan_baru" },
  });
});

afterEach(() => vi.restoreAllMocks());

function post(body: Record<string, unknown>, headers: Record<string, string> = {}): Promise<Response> {
  return POST(
    new Request("http://x/v1/messages/send-template", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /v1/messages/send-template", () => {
  it("delegasi to + templateName + vars + deviceId + X-Request-Id echo", async () => {
    const res = await post(
      { to: "081234567890", templateName: "pesanan_baru", vars: { orderId: "1234" }, deviceId: "dev9" },
      { "x-request-id": "req-t-1", authorization: "Bearer wavio_abc" },
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBe("req-t-1");
    expect(executeSendTemplateMock).toHaveBeenCalledWith(
      { to: "081234567890", templateName: "pesanan_baru", vars: { orderId: "1234" }, deviceId: "dev9" },
      expect.objectContaining({ tenantId: "t1", keyId: "k1", requestId: "req-t-1" }),
    );
  });

  it("API key invalid → 401", async () => {
    verifyApiKeyMock.mockResolvedValue(null);
    const res = await post({ to: "6281234567890", templateName: "x" });
    expect(res.status).toBe(401);
    expect(executeSendTemplateMock).not.toHaveBeenCalled();
  });

  it("body bukan JSON → 400", async () => {
    const res = await POST(new Request("http://x/v1/messages/send-template", { method: "POST", body: "not-json" }));
    expect(res.status).toBe(400);
    expect(executeSendTemplateMock).not.toHaveBeenCalled();
  });

  it("error result (502) → status + X-Request-Id", async () => {
    executeSendTemplateMock.mockResolvedValue({ ok: false, status: 502, error: "Gateway error" });
    const res = await post({ to: "6281234567890", templateName: "x" });
    expect(res.status).toBe(502);
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });
});
