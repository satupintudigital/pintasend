import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

const verifyApiKeyMock = vi.fn();
const executeMock = vi.fn();

vi.mock("@/lib/authStore", () => ({
  verifyApiKey: (...a: unknown[]) => verifyApiKeyMock(...a),
}));
vi.mock("@/lib/imagestro", () => ({
  executeRadiologyReadyNotification: (...a: unknown[]) => executeMock(...a),
}));

const body = {
  to: "6281234567890",
  study_uid: "1.2.3.4",
  link: "https://portal.contoh.id/s/1.2.3.4",
  patient_name: "Budi",
  modality: "CT",
};

function post(init: { headers?: Record<string, string>; body?: string } = {}) {
  return POST(
    new Request("http://x/v1/integrations/imagestro/radiology-ready", {
      method: "POST",
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
      body: init.body ?? JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  verifyApiKeyMock.mockReset();
  executeMock.mockReset();
  verifyApiKeyMock.mockResolvedValue({ tenantId: "t1", keyId: "k1" });
  executeMock.mockResolvedValue({
    ok: true,
    status: 200,
    body: { ok: true, messageId: "m1", to: "6281234567890@c.us" },
  });
});
afterEach(() => vi.restoreAllMocks());

describe("POST /v1/integrations/imagestro/radiology-ready", () => {
  it("tanpa API key valid → 401 dan service tidak dipanggil", async () => {
    verifyApiKeyMock.mockResolvedValue(null);
    const res = await post();
    expect(res.status).toBe(401);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("sukses → 200 + body service + x-request-id", async () => {
    const res = await post({
      headers: { authorization: "Bearer wavio_abc", "x-request-id": "req-1" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBe("req-1");
    expect(await res.json()).toEqual({
      ok: true,
      messageId: "m1",
      to: "6281234567890@c.us",
    });
    const [passedBody, ctx] = executeMock.mock.calls[0];
    expect(passedBody).toMatchObject({ study_uid: "1.2.3.4" });
    expect(ctx).toMatchObject({ tenantId: "t1", keyId: "k1", requestId: "req-1" });
  });

  it("body JSON invalid → 400", async () => {
    const res = await post({
      headers: { authorization: "Bearer wavio_abc" },
      body: "{bukan json",
    });
    expect(res.status).toBe(400);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("service error (402 saldo) → status diteruskan", async () => {
    executeMock.mockResolvedValue({
      ok: false,
      status: 402,
      error: "Saldo tidak cukup",
    });
    const res = await post({ headers: { authorization: "Bearer wavio_abc" } });
    expect(res.status).toBe(402);
    expect((await res.json()).error).toBe("Saldo tidak cukup");
  });
});
