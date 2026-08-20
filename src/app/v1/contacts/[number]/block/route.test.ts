import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { POST, DELETE } from "./route";

const verifyApiKeyMock = vi.fn();
const executeBlockContactMock = vi.fn();

vi.mock("@/lib/authStore", () => ({
  verifyApiKey: (...args: unknown[]) => verifyApiKeyMock(...args),
}));
vi.mock("@/lib/blockContact", () => ({
  executeBlockContact: (...args: unknown[]) => executeBlockContactMock(...args),
}));

const okResult = {
  ok: true,
  status: 200,
  body: { ok: true, deviceId: "dev1", contactId: "6281234567890@c.us", blocked: true },
};

beforeEach(() => {
  verifyApiKeyMock.mockReset();
  executeBlockContactMock.mockReset();
  verifyApiKeyMock.mockResolvedValue({ tenantId: "t1", keyId: "k1" });
  executeBlockContactMock.mockResolvedValue(okResult);
});

afterEach(() => vi.restoreAllMocks());

function call(
  fn: typeof POST,
  method: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fn(
    new Request("http://x/v1/contacts/6281234567890/block", { method, headers }),
    { params: Promise.resolve({ number: "6281234567890" }) },
  );
}

describe("POST /v1/contacts/:number/block", () => {
  it("delegasi action=block + deviceId + X-Request-Id echo", async () => {
    const res = await call(POST, "POST", { "x-request-id": "req-b-1", authorization: "Bearer wavio_abc" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(okResult.body);
    expect(res.headers.get("x-request-id")).toBe("req-b-1");
    expect(executeBlockContactMock).toHaveBeenCalledWith(
      { number: "6281234567890", action: "block", deviceId: undefined },
      expect.objectContaining({ tenantId: "t1", keyId: "k1", requestId: "req-b-1" }),
    );
  });

  it("API key invalid → 401", async () => {
    verifyApiKeyMock.mockResolvedValue(null);
    const res = await call(POST, "POST");
    expect(res.status).toBe(401);
    expect(executeBlockContactMock).not.toHaveBeenCalled();
  });

  it("error result (409) → status + X-Request-Id", async () => {
    executeBlockContactMock.mockResolvedValue({ ok: false, status: 409, error: "Device tidak siap" });
    const res = await call(POST, "POST");
    expect(res.status).toBe(409);
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });
});

describe("DELETE /v1/contacts/:number/block", () => {
  it("delegasi action=unblock", async () => {
    executeBlockContactMock.mockResolvedValue({
      ...okResult,
      body: { ok: true, deviceId: "dev1", contactId: "6281234567890@c.us", blocked: false },
    });
    const res = await call(DELETE, "DELETE");

    expect(res.status).toBe(200);
    expect(executeBlockContactMock).toHaveBeenCalledWith(
      { number: "6281234567890", action: "unblock", deviceId: undefined },
      expect.any(Object),
    );
  });
});
