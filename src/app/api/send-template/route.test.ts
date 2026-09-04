import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "./route";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/sendTemplate", () => ({ executeSendTemplate: vi.fn() }));

import { auth } from "@/lib/auth";
import { executeSendTemplate } from "@/lib/sendTemplate";

const mockedAuth = vi.mocked(auth);
const mockedExecute = vi.mocked(executeSendTemplate);

const SESSION = { user: { id: "u1", tenantId: "t1", role: "owner" } } as never;

beforeEach(() => {
  mockedAuth.mockReset();
  mockedExecute.mockReset();
  mockedAuth.mockResolvedValue(SESSION);
  mockedExecute.mockResolvedValue({
    ok: true,
    status: 200,
    body: { ok: true, deviceId: "dev1", to: "6281234567890@c.us", messageId: "m-tpl", templateName: "pesanan_baru" },
  });
});

function post(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return POST(
    new Request("http://x/api/send-template", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("POST /api/send-template (dashboard)", () => {
  it("401 saat tidak terautentikasi", async () => {
    mockedAuth.mockResolvedValueOnce(null as never);
    const res = await post({ deviceId: "dev1", to: "081234567890", templateName: "pesanan_baru" });
    expect(res.status).toBe(401);
    expect(mockedExecute).not.toHaveBeenCalled();
  });

  it("400 saat body bukan JSON", async () => {
    const res = await post("{ini bukan json");
    expect(res.status).toBe(400);
  });

  it("400 saat field wajib kosong", async () => {
    const res = await post({ deviceId: "dev1", to: "", templateName: "" });
    expect(res.status).toBe(400);
    expect(mockedExecute).not.toHaveBeenCalled();
  });

  it("200 — delegasi ke executeSendTemplate dengan keyId dashboard:{userId}", async () => {
    const res = await post(
      { deviceId: "dev1", to: "081234567890", templateName: "pesanan_baru", vars: { orderNumber: "123" } },
      { "x-request-id": "req-1" },
    );
    expect(res.status).toBe(200);
    expect(mockedExecute).toHaveBeenCalledWith(
      {
        deviceId: "dev1",
        to: "081234567890",
        templateName: "pesanan_baru",
        vars: { orderNumber: "123" },
      },
      expect.objectContaining({ tenantId: "t1", keyId: "dashboard:u1", requestId: "req-1" }),
    );
    expect(res.headers.get("x-request-id")).toBe("req-1");
  });

  it("error result (502) → status + X-Request-Id", async () => {
    mockedExecute.mockResolvedValueOnce({ ok: false, status: 502, error: "Gateway error" });
    const res = await post({ deviceId: "dev1", to: "6281234567890", templateName: "x" });
    expect(res.status).toBe(502);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(await res.json()).toEqual({ error: "Gateway error" });
  });
});
