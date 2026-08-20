import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

// ── Mocks ───────────────────────────────────────────────────────────────────
// Mock fn untyped (pola queryD1Mock di health/route.test) — implementasi
// default di-set di beforeEach; per-test bisa di-override.
const mocks = {
  openwaWebhookSecret: vi.fn(),
  verifySignature: vi.fn(),
  hmacSha256Hex: vi.fn(),
  query: vi.fn(),
  queryD1One: vi.fn(),
  changesD1: vi.fn(),
  cloneDeviceToD1: vi.fn(),
  getDeviceBySessionId: vi.fn(),
  openwaRestrictionToJson: vi.fn(),
  getWebhookForTenant: vi.fn(),
  isSafeWebhookUrl: vi.fn(),
  deleteCachedDevice: vi.fn(),
  deleteCachedDeviceList: vi.fn(),
  insertMessageLog: vi.fn(),
  updateMessageDeliveryStatus: vi.fn(),
  isMessageDeliveryStatus: vi.fn(),
  setMessageReactions: vi.fn(),
  mergeMessageReaction: vi.fn(),
  enqueueWebhookDelivery: vi.fn(),
  deliverWebhookOnce: vi.fn(),
  markWebhookDelivery: vi.fn(),
  nextRetryDelayMs: vi.fn(),
};

vi.mock("@/lib/openwa", () => ({
  openwaWebhookSecret: (...a: unknown[]) => mocks.openwaWebhookSecret(...a),
}));
vi.mock("@/lib/hmac", () => ({
  hmacSha256Hex: (...a: unknown[]) => mocks.hmacSha256Hex(...a),
  verifySignature: (...a: unknown[]) => mocks.verifySignature(...a),
}));
vi.mock("@/lib/d1", () => ({
  queryD1One: (...a: unknown[]) => mocks.queryD1One(...a),
  changesD1: (...a: unknown[]) => mocks.changesD1(...a),
}));
vi.mock("@/lib/db", () => ({
  query: (...a: unknown[]) => mocks.query(...a),
}));
vi.mock("@/lib/devices", () => ({
  cloneDeviceToD1: (...a: unknown[]) => mocks.cloneDeviceToD1(...a),
  getDeviceBySessionId: (...a: unknown[]) => mocks.getDeviceBySessionId(...a),
  openwaRestrictionToJson: (...a: unknown[]) => mocks.openwaRestrictionToJson(...a),
}));
vi.mock("@/lib/webhookStore", () => ({
  getWebhookForTenant: (...a: unknown[]) => mocks.getWebhookForTenant(...a),
}));
vi.mock("@/lib/ssrf", () => ({
  isSafeWebhookUrl: (...a: unknown[]) => mocks.isSafeWebhookUrl(...a),
}));
vi.mock("@/lib/deviceCache", () => ({
  deleteCachedDevice: (...a: unknown[]) => mocks.deleteCachedDevice(...a),
  deleteCachedDeviceList: (...a: unknown[]) => mocks.deleteCachedDeviceList(...a),
}));
vi.mock("@/lib/messageStore", () => ({
  insertMessageLog: (...a: unknown[]) => mocks.insertMessageLog(...a),
  updateMessageDeliveryStatus: (...a: unknown[]) => mocks.updateMessageDeliveryStatus(...a),
  isMessageDeliveryStatus: (s: string) => mocks.isMessageDeliveryStatus(s),
  setMessageReactions: (...a: unknown[]) => mocks.setMessageReactions(...a),
  mergeMessageReaction: (...a: unknown[]) => mocks.mergeMessageReaction(...a),
}));
vi.mock("@/lib/webhookDelivery", () => ({
  enqueueWebhookDelivery: (...a: unknown[]) => mocks.enqueueWebhookDelivery(...a),
  deliverWebhookOnce: (...a: unknown[]) => mocks.deliverWebhookOnce(...a),
  markWebhookDelivery: (...a: unknown[]) => mocks.markWebhookDelivery(...a),
  nextRetryDelayMs: (...a: unknown[]) => mocks.nextRetryDelayMs(...a),
  DELIVERY_MAX_ATTEMPTS: 3,
}));

// ── Fixtures ────────────────────────────────────────────────────────────────
const deviceRow = {
  id: "dev1",
  tenantId: "t1",
  label: "HP Kasir",
  openwaSessionId: "owa-1",
  openwaWebhookId: null,
  status: "ready",
};

const webhookRow = {
  id: "wh1",
  url: "https://client.example.com/hook",
  secret: "s3cret",
  events: ["message.received", "session.status"],
  active: true,
};

const body = JSON.stringify({
  event: "message.received",
  sessionId: "owa-1",
  timestamp: 1723900000000,
  data: { from: "62812@c.us", body: "Halo", type: "chat" },
});

const UUIDV7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.openwaWebhookSecret.mockResolvedValue("secret");
  mocks.verifySignature.mockResolvedValue(true);
  mocks.hmacSha256Hex.mockResolvedValue("sig");
  mocks.query.mockResolvedValue([]);
  mocks.queryD1One.mockResolvedValue(deviceRow);
  mocks.changesD1.mockResolvedValue(undefined);
  mocks.cloneDeviceToD1.mockResolvedValue(undefined);
  mocks.getDeviceBySessionId.mockResolvedValue(undefined);
  mocks.openwaRestrictionToJson.mockReturnValue(null);
  mocks.getWebhookForTenant.mockResolvedValue(webhookRow);
  mocks.isSafeWebhookUrl.mockReturnValue(true);
  mocks.deleteCachedDevice.mockResolvedValue(undefined);
  mocks.deleteCachedDeviceList.mockResolvedValue(undefined);
  mocks.insertMessageLog.mockResolvedValue(undefined);
  mocks.updateMessageDeliveryStatus.mockResolvedValue(true);
  mocks.isMessageDeliveryStatus.mockImplementation(
    (s: string) => s === "delivered" || s === "read" || s === "failed",
  );
  mocks.setMessageReactions.mockResolvedValue(true);
  mocks.mergeMessageReaction.mockResolvedValue(true);
  mocks.enqueueWebhookDelivery.mockResolvedValue("del-1");
  mocks.deliverWebhookOnce.mockResolvedValue({ ok: true, status: 200 });
  mocks.markWebhookDelivery.mockResolvedValue(undefined);
  mocks.nextRetryDelayMs.mockReturnValue(30_000);
});

afterEach(() => vi.restoreAllMocks());

function post(headers: Record<string, string> = {}, raw = body): Promise<Response> {
  return POST(
    new Request("http://x/api/webhooks/openwa", {
      method: "POST",
      headers: { "content-type": "application/json", "x-openwa-signature": "sha256=abc", ...headers },
      body: raw,
    }),
  );
}

// ── Tests ───────────────────────────────────────────────────────────────────
describe("POST /api/webhooks/openwa — X-Request-Id", () => {
  it("echo X-Request-Id masuk di header respons", async () => {
    const res = await post({ "x-request-id": "req-web-1" });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBe("req-web-1");
  });

  it("tanpa header → generate uuidv7 & echo di respons", async () => {
    const res = await post();
    expect(res.headers.get("x-request-id")).toMatch(UUIDV7_RE);
  });

  it("signature invalid → 401 + X-Request-Id tetap ada (tracing)", async () => {
    mocks.verifySignature.mockResolvedValueOnce(false);
    const res = await post({ "x-request-id": "req-bad-sig" });
    expect(res.status).toBe(401);
    expect(res.headers.get("x-request-id")).toBe("req-bad-sig");
    // Tidak ada lookup DB sebelum signature valid.
    expect(mocks.queryD1One).not.toHaveBeenCalled();
  });

  it("body bukan JSON → 400 + X-Request-Id", async () => {
    const res = await post({ "x-request-id": "req-bad-json" }, "not-json");
    expect(res.status).toBe(400);
    expect(res.headers.get("x-request-id")).toBe("req-bad-json");
  });
});

describe("POST /api/webhooks/openwa — alur outbox + structured logging", () => {
  it("sukses: enqueue outbox → deliver sekali → mark delivered, log info", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    const res = await post({ "x-request-id": "req-web-ok" });
    expect(res.status).toBe(200);

    expect(mocks.enqueueWebhookDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t1", webhookId: "wh1", event: "message.received", url: "https://client.example.com/hook" }),
    );
    expect(mocks.deliverWebhookOnce).toHaveBeenCalledWith(
      "https://client.example.com/hook",
      expect.any(String),
      "sha256=sig",
      "message.received",
    );
    expect(mocks.markWebhookDelivery).toHaveBeenCalledWith("del-1", expect.objectContaining({ status: "delivered" }));

    // Structured log: enqueued + delivered, requestId konsisten.
    const lines = spy.mock.calls.map((c) => JSON.parse(c[0] as string));
    const enqueued = lines.find((l) => l.event === "webhook_enqueued");
    const delivered = lines.find((l) => l.event === "webhook_delivered");
    expect(enqueued).toMatchObject({ requestId: "req-web-ok", tenantId: "t1", openwaEvent: "message.received", deliveryId: "del-1" });
    expect(delivered).toMatchObject({ requestId: "req-web-ok", openwaEvent: "message.received", status: 200 });
  });

  it("delivery gagal → outbox pending + nextAttemptAt backoff, log error, tetap 200", async () => {
    mocks.deliverWebhookOnce.mockResolvedValueOnce({ ok: false, status: 500, error: "boom" });
    mocks.nextRetryDelayMs.mockReturnValueOnce(30_000);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await post({ "x-request-id": "req-web-fail" });
    expect(res.status).toBe(200);

    expect(mocks.markWebhookDelivery).toHaveBeenCalledWith(
      "del-1",
      expect.objectContaining({ status: "pending", attempts: 1, nextAttemptAt: expect.any(Date) }),
    );
    const lines = err.mock.calls.map((c) => JSON.parse(c[0] as string));
    const failed = lines.find((l) => l.event === "webhook_delivery_failed");
    expect(failed).toMatchObject({ requestId: "req-web-fail", status: 500 });
  });

  it("session tidak dikenal → 200 skipped + log error webhook_unknown_session", async () => {
    mocks.queryD1One.mockResolvedValueOnce(undefined);
    mocks.getDeviceBySessionId.mockResolvedValueOnce(undefined);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await post({ "x-request-id": "req-unknown" });
    expect(res.status).toBe(200);
    expect(mocks.enqueueWebhookDelivery).not.toHaveBeenCalled();

    const lines = err.mock.calls.map((c) => JSON.parse(c[0] as string));
    expect(lines.some((l) => l.event === "webhook_unknown_session" && l.requestId === "req-unknown")).toBe(true);
  });

  it("tenant tanpa webhook aktif → 200 skipped + log info, tanpa enqueue", async () => {
    mocks.getWebhookForTenant.mockResolvedValueOnce(null);
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    const res = await post({ "x-request-id": "req-skip" });
    expect(res.status).toBe(200);
    expect(mocks.enqueueWebhookDelivery).not.toHaveBeenCalled();

    const lines = spy.mock.calls.map((c) => JSON.parse(c[0] as string));
    const skipped = lines.find((l) => l.event === "webhook_skipped");
    expect(skipped).toMatchObject({ requestId: "req-skip", reason: "no webhook configured" });
  });

  it("enqueue outbox gagal → 500 + log error webhook_enqueue_failed", async () => {
    mocks.enqueueWebhookDelivery.mockRejectedValueOnce(new Error("Neon down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await post({ "x-request-id": "req-enq-fail" });
    expect(res.status).toBe(500);

    const lines = err.mock.calls.map((c) => JSON.parse(c[0] as string));
    expect(lines.some((l) => l.event === "webhook_enqueue_failed" && l.requestId === "req-enq-fail")).toBe(true);
  });

  it("signature invalid → log warn webhook_signature_invalid", async () => {
    mocks.verifySignature.mockResolvedValueOnce(false);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await post({ "x-request-id": "req-sig" });

    const lines = warn.mock.calls.map((c) => JSON.parse(c[0] as string));
    const ev = lines.find((l) => l.event === "webhook_signature_invalid");
    expect(ev).toMatchObject({ requestId: "req-sig" });
  });
});

describe("POST /api/webhooks/openwa — smart filters", () => {
  it("filter tidak cocok → 200 skipped, tanpa enqueue", async () => {
    mocks.getWebhookForTenant.mockResolvedValueOnce({
      ...webhookRow,
      filters: { conditions: [{ field: "body", operator: "contains", value: "rahasia" }] },
    });
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    const res = await post({ "x-request-id": "req-filter" }); // body = "Halo"
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.skipped).toBe("filtered");
    expect(mocks.enqueueWebhookDelivery).not.toHaveBeenCalled();

    const lines = spy.mock.calls.map((c) => JSON.parse(c[0] as string));
    expect(lines.some((l) => l.event === "webhook_skipped" && l.reason === "filtered by smart filters")).toBe(true);
  });

  it("filter cocok → event tetap diteruskan", async () => {
    mocks.getWebhookForTenant.mockResolvedValueOnce({
      ...webhookRow,
      filters: { conditions: [{ field: "sender", operator: "is", value: ["62812"] }] },
    });
    const res = await post({ "x-request-id": "req-filter-ok" }); // from = 62812@c.us
    expect(res.status).toBe(200);
    expect(mocks.enqueueWebhookDelivery).toHaveBeenCalled();
  });

  it("message.edited diteruskan & dikenai filter (event konten)", async () => {
    mocks.getWebhookForTenant.mockResolvedValueOnce({
      ...webhookRow,
      events: [...webhookRow.events, "message.edited"],
      filters: { conditions: [{ field: "type", operator: "is", value: ["text"] }] },
    });
    const raw = JSON.stringify({
      event: "message.edited",
      sessionId: "owa-1",
      timestamp: 1723900000000,
      data: { from: "62812@c.us", body: "Halo (diedit)", type: "text" },
    });
    const res = await post({ "x-request-id": "req-edited" }, raw);
    expect(res.status).toBe(200);
    expect(mocks.enqueueWebhookDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ event: "message.edited" }),
    );
  });
});

describe("POST /api/webhooks/openwa — message.reaction (reaksi pesan)", () => {
  it("snapshot reactions → setMessageReactions dengan map lengkap", async () => {
    const raw = JSON.stringify({
      event: "message.reaction",
      sessionId: "owa-1",
      timestamp: 1723900000000,
      data: {
        messageId: "m-react-1",
        senderId: "62813@c.us",
        reaction: "❤️",
        reactions: { "62812@c.us": "👍", "62813@c.us": "❤️" },
      },
    });
    await post({ "x-request-id": "req-react" }, raw);
    expect(mocks.setMessageReactions).toHaveBeenCalledWith("t1", "m-react-1", {
      "62812@c.us": "👍",
      "62813@c.us": "❤️",
    });
    expect(mocks.mergeMessageReaction).not.toHaveBeenCalled();
  });

  it("tanpa snapshot → mergeMessageReaction satu sender", async () => {
    const raw = JSON.stringify({
      event: "message.reaction",
      sessionId: "owa-1",
      timestamp: 1723900000000,
      data: { messageId: "m-react-2", senderId: "62813@c.us", reaction: "👍" },
    });
    await post({ "x-request-id": "req-react2" }, raw);
    expect(mocks.mergeMessageReaction).toHaveBeenCalledWith("t1", "m-react-2", "62813@c.us", "👍");
    expect(mocks.setMessageReactions).not.toHaveBeenCalled();
  });

  it("tanpa messageId → tidak memanggil update reaksi", async () => {
    const raw = JSON.stringify({
      event: "message.reaction",
      sessionId: "owa-1",
      timestamp: 1723900000000,
      data: { senderId: "62813@c.us", reaction: "👍" },
    });
    await post({ "x-request-id": "req-react3" }, raw);
    expect(mocks.setMessageReactions).not.toHaveBeenCalled();
    expect(mocks.mergeMessageReaction).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/openwa — session.restriction (pembatasan akun)", () => {
  it("menulis restriction ke Neon + D1 & invalidasi cache", async () => {
    mocks.openwaRestrictionToJson.mockReturnValueOnce('{"kind":"tos_block","code":"blocked","expiresAt":null}');
    const raw = JSON.stringify({
      event: "session.restriction",
      sessionId: "owa-1",
      timestamp: 1723900000000,
      data: { kind: "tos_block", code: "blocked", expiresAt: null },
    });
    const res = await post({ "x-request-id": "req-restrict" }, raw);
    expect(res.status).toBe(200);
    expect(mocks.openwaRestrictionToJson).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "tos_block" }),
    );
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining('restriction = $1'),
      ['{"kind":"tos_block","code":"blocked","expiresAt":null}', "dev1"],
    );
    expect(mocks.changesD1).toHaveBeenCalledWith(
      expect.stringContaining("restriction = ?"),
      ['{"kind":"tos_block","code":"blocked","expiresAt":null}', expect.any(String), "dev1"],
    );
    expect(mocks.deleteCachedDevice).toHaveBeenCalledWith("dev1");
    expect(mocks.deleteCachedDeviceList).toHaveBeenCalledWith("t1");
  });

  it("restriction dicabut (json null) → tetap menulis & tetap 200", async () => {
    mocks.openwaRestrictionToJson.mockReturnValueOnce(null);
    const raw = JSON.stringify({
      event: "session.restriction",
      sessionId: "owa-1",
      timestamp: 1723900000000,
      data: null,
    });
    const res = await post({ "x-request-id": "req-unrestrict" }, raw);
    expect(res.status).toBe(200);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("restriction = $1"), [null, "dev1"]);
  });

  it("gagal tulis Neon → best-effort (tetap 200, tanpa melempar)", async () => {
    mocks.openwaRestrictionToJson.mockReturnValueOnce('{"kind":"proxy_block","code":"","expiresAt":null}');
    mocks.query.mockRejectedValueOnce(new Error("Neon down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const raw = JSON.stringify({
      event: "session.restriction",
      sessionId: "owa-1",
      timestamp: 1723900000000,
      data: { kind: "proxy_block", code: "", expiresAt: null },
    });
    const res = await post({ "x-request-id": "req-restrict-fail" }, raw);
    expect(res.status).toBe(200);
    const lines = err.mock.calls.map((c) => JSON.parse(c[0] as string));
    expect(lines.some((l) => l.event === "webhook_restriction_update_failed")).toBe(true);
  });
});

describe("POST /api/webhooks/openwa — message.ack / message.failed (status kirim)", () => {
  function ackBody(event: string, status: string, messageId = "m-abc123") {
    const ack = status === "failed" ? -1 : status === "read" ? 3 : 2;
    return JSON.stringify({
      event,
      sessionId: "owa-1",
      timestamp: 1723900000000,
      data: { id: messageId, messageId, status, ack },
    });
  }

  it("message.ack delivered → majukan status riwayat, tetap 200", async () => {
    const res = await post({ "x-request-id": "req-ack" }, ackBody("message.ack", "delivered"));
    expect(res.status).toBe(200);
    expect(mocks.updateMessageDeliveryStatus).toHaveBeenCalledWith("t1", "m-abc123", "delivered");
  });

  it("message.failed → majukan status failed", async () => {
    await post({ "x-request-id": "req-failed" }, ackBody("message.failed", "failed"));
    expect(mocks.updateMessageDeliveryStatus).toHaveBeenCalledWith("t1", "m-abc123", "failed");
  });

  it("status sent/pending dari ack tidak memanggil update (no-op)", async () => {
    await post({ "x-request-id": "req-sent" }, ackBody("message.ack", "sent"));
    expect(mocks.updateMessageDeliveryStatus).not.toHaveBeenCalled();
  });

  it("tanpa messageId → tidak memanggil update", async () => {
    const body = JSON.stringify({
      event: "message.ack",
      sessionId: "owa-1",
      timestamp: 1723900000000,
      data: { status: "read", ack: 3 },
    });
    await post({ "x-request-id": "req-noid" }, body);
    expect(mocks.updateMessageDeliveryStatus).not.toHaveBeenCalled();
  });
});
