import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { POST as postLocation } from "./location/route";
import { POST as postContact } from "./contact/route";
import { POST as postPoll } from "./poll/route";

const verifyApiKeyMock = vi.fn();
const executeRichMock = vi.fn();

vi.mock("@/lib/authStore", () => ({
  verifyApiKey: (...args: unknown[]) => verifyApiKeyMock(...args),
}));
vi.mock("@/lib/sendRichMessage", () => ({
  executeSendRichMessage: (...args: unknown[]) => executeRichMock(...args),
}));

beforeEach(() => {
  verifyApiKeyMock.mockReset();
  executeRichMock.mockReset();
  verifyApiKeyMock.mockResolvedValue({ tenantId: "t1", keyId: "k1" });
  executeRichMock.mockResolvedValue({
    ok: true,
    status: 200,
    body: { ok: true, deviceId: "dev1", to: "6281234567890@c.us", messageId: "m-1", kind: "location" },
  });
});

afterEach(() => vi.restoreAllMocks());

function post(handler: (req: Request) => Promise<Response>, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return handler(
    new Request("http://x/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /v1/messages/location", () => {
  it("401 saat API key invalid", async () => {
    verifyApiKeyMock.mockResolvedValue(null);
    const res = await post(postLocation, { to: "081234567890", latitude: 1, longitude: 2 });
    expect(res.status).toBe(401);
    expect(executeRichMock).not.toHaveBeenCalled();
  });

  it("200 — delegasi dengan kind location + X-Request-Id", async () => {
    const res = await post(
      postLocation,
      { to: "081234567890", latitude: -6.2, longitude: 106.8, description: "Toko", deviceId: "dev9" },
      { "x-request-id": "req-loc", authorization: "Bearer pintasend_abc" },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBe("req-loc");
    expect(executeRichMock).toHaveBeenCalledWith(
      "location",
      {
        to: "081234567890",
        latitude: -6.2,
        longitude: 106.8,
        description: "Toko",
        deviceId: "dev9",
      },
      expect.objectContaining({ tenantId: "t1", keyId: "k1", requestId: "req-loc" }),
    );
  });

  it("400 saat body bukan JSON", async () => {
    const res = await postLocation(new Request("http://x/v1/messages/location", { method: "POST", body: "not-json" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /v1/messages/contact", () => {
  it("200 — delegasi dengan kind contact", async () => {
    executeRichMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: { ok: true, deviceId: "dev1", to: "6281234567890@c.us", messageId: "m-c", kind: "contact" },
    });
    const res = await post(postContact, { to: "6281234567890", contactName: "CS", contactNumber: "628111222333" });
    expect(res.status).toBe(200);
    expect(executeRichMock).toHaveBeenCalledWith(
      "contact",
      { to: "6281234567890", contactName: "CS", contactNumber: "628111222333" },
      expect.any(Object),
    );
  });
});

describe("POST /v1/messages/poll", () => {
  it("200 — delegasi dengan kind poll + allowMultipleAnswers", async () => {
    const res = await post(postPoll, {
      to: "081234567890",
      name: "Pilih?",
      options: ["A", "B"],
      allowMultipleAnswers: true,
    });
    expect(res.status).toBe(200);
    expect(executeRichMock).toHaveBeenCalledWith(
      "poll",
      { to: "081234567890", name: "Pilih?", options: ["A", "B"], allowMultipleAnswers: true },
      expect.any(Object),
    );
  });

  it("error result → status + X-Request-Id", async () => {
    executeRichMock.mockResolvedValue({ ok: false, status: 429, error: "Kuota habis", retryAfterSec: 30 });
    const res = await post(postPoll, { to: "081234567890", name: "Q", options: ["A", "B"] });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("30");
    expect(await res.json()).toEqual({ error: "Kuota habis" });
  });
});
