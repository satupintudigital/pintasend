import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ensureDeviceWebhookEvents, openwaRestrictionToJson, restrictionFromJson } from "./devices";
import { query } from "./db";
import { openwa, openwaWebhookSecret } from "./openwa";

// ── Mocks ───────────────────────────────────────────────────────────────────
vi.mock("./db", () => ({ query: vi.fn(), queryOne: vi.fn() }));
vi.mock("./d1", () => ({ queryD1: vi.fn() }));
vi.mock("./uuidv7", () => ({ uuidv7: () => "uuid-1" }));
vi.mock("./deviceCache", () => ({ deleteCachedDeviceList: vi.fn() }));
vi.mock("./openwa", () => ({
  openwa: { listWebhooks: vi.fn(), updateWebhook: vi.fn(), registerWebhook: vi.fn() },
  openwaWebhookSecret: vi.fn(),
  OPENWA_WEBHOOK_EVENTS: [
    "message.received",
    "session.status",
    "message.ack",
    "message.failed",
    "message.edited",
    "message.reaction",
    "session.restriction",
    "message.sent",
    "message.revoked",
  ],
}));

const URL = "https://wavio.satupintudigital.co.id/api/webhooks/openwa";
const device = { id: "dev1", openwaSessionId: "owa-1", openwaWebhookId: "wh1" };

function wh(over: Partial<{ id: string; url: string; events: string[] }> = {}) {
  return {
    id: "wh1",
    url: URL,
    events: ["message.received", "session.status"],
    active: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(openwaWebhookSecret).mockResolvedValue("secret-123");
  vi.mocked(query).mockResolvedValue([]);
});

afterEach(() => vi.restoreAllMocks());

describe("ensureDeviceWebhookEvents", () => {
  it("events sudah lengkap → no-op (tanpa update/register)", async () => {
    vi.mocked(openwa.listWebhooks).mockResolvedValue([
      wh({
        events: [
          "message.received",
          "session.status",
          "message.ack",
          "message.failed",
          "message.edited",
          "message.reaction",
          "session.restriction",
          "message.sent",
          "message.revoked",
        ],
      }),
    ]);

    const result = await ensureDeviceWebhookEvents(device);
    expect(result).toEqual({ changed: false });
    expect(openwa.updateWebhook).not.toHaveBeenCalled();
    expect(openwa.registerWebhook).not.toHaveBeenCalled();
  });

  it("events kurang (device lama) → PUT update dengan events lengkap + url + secret", async () => {
    vi.mocked(openwa.listWebhooks).mockResolvedValue([wh()]);

    const result = await ensureDeviceWebhookEvents(device);
    expect(result).toEqual({ changed: true });
    expect(openwa.updateWebhook).toHaveBeenCalledWith("owa-1", "wh1", {
      url: URL,
      events: [
        "message.received",
        "session.status",
        "message.ack",
        "message.failed",
        "message.edited",
        "message.reaction",
        "session.restriction",
        "message.sent",
        "message.revoked",
      ],
      secret: "secret-123",
      retryCount: 3,
    });
    expect(openwa.registerWebhook).not.toHaveBeenCalled();
    // id tersimpan sudah benar → tidak ada UPDATE DB.
    expect(query).not.toHaveBeenCalled();
  });

  it("ditemukan via URL (id tersimpan basi) → update + perbaiki openwaWebhookId", async () => {
    vi.mocked(openwa.listWebhooks).mockResolvedValue([
      wh({ id: "wh-new", events: ["message.received", "session.status"] }),
    ]);

    const result = await ensureDeviceWebhookEvents({ ...device, openwaWebhookId: "wh-stale" });
    expect(result).toEqual({ changed: true });
    expect(openwa.updateWebhook).toHaveBeenCalledWith("owa-1", "wh-new", expect.any(Object));
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('"openwaWebhookId" = $1'),
      ["wh-new", "dev1"],
    );
  });

  it("tidak ada webhook Wavio → register baru & simpan id", async () => {
    vi.mocked(openwa.listWebhooks).mockResolvedValue([]);
    vi.mocked(openwa.registerWebhook).mockResolvedValue(wh({ id: "wh-created" }));

    const result = await ensureDeviceWebhookEvents(device);
    expect(result).toEqual({ changed: true });
    expect(openwa.registerWebhook).toHaveBeenCalledWith("owa-1", {
      url: URL,
      events: [
        "message.received",
        "session.status",
        "message.ack",
        "message.failed",
        "message.edited",
        "message.reaction",
        "session.restriction",
        "message.sent",
        "message.revoked",
      ],
      secret: "secret-123",
      retryCount: 3,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('"openwaWebhookId" = $1'),
      ["wh-created", "dev1"],
    );
  });

  it("listWebhooks error → changed:false + error (tanpa melempar)", async () => {
    vi.mocked(openwa.listWebhooks).mockRejectedValue(new Error("OpenWA down"));
    const result = await ensureDeviceWebhookEvents(device);
    expect(result).toMatchObject({ changed: false });
    expect(result.error).toBe("OpenWA down");
  });
});

describe("openwaRestrictionToJson / restrictionFromJson", () => {
  it("payload langsung { kind, code, expiresAt } → JSON string", () => {
    expect(openwaRestrictionToJson({ kind: "tos_block", code: "blocked", expiresAt: null })).toBe(
      '{"kind":"tos_block","code":"blocked","expiresAt":null}',
    );
  });

  it("payload terbungkus { restriction: {...} } → unwrap", () => {
    expect(
      openwaRestrictionToJson({ restriction: { kind: "reachout_timelock", code: "tl", expiresAt: "2026-08-20T00:00:00Z" } }),
    ).toBe('{"kind":"reachout_timelock","code":"tl","expiresAt":"2026-08-20T00:00:00Z"}');
  });

  it("kind kosong / null / bukan objek → null", () => {
    expect(openwaRestrictionToJson(null)).toBeNull();
    expect(openwaRestrictionToJson(undefined)).toBeNull();
    expect(openwaRestrictionToJson("x")).toBeNull();
    expect(openwaRestrictionToJson({ kind: "", code: "", expiresAt: null })).toBeNull();
  });

  it("restrictionFromJson: JSON valid → objek; kosong/korup → null", () => {
    expect(
      restrictionFromJson('{"kind":"proxy_block","code":"","expiresAt":null}'),
    ).toEqual({ kind: "proxy_block", code: "", expiresAt: null });
    expect(restrictionFromJson(null)).toBeNull();
    expect(restrictionFromJson("{korup")).toBeNull();
    expect(restrictionFromJson('{"code":"x"}')).toBeNull(); // tanpa kind
  });
});
