import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  executeListLabels,
  executeCreateLabel,
  executeUpdateLabel,
  executeDeleteLabel,
  executeAddChatToLabel,
  executeRemoveChatFromLabel,
  executeListChatsByLabel,
  executeBulkAddChatsToLabel,
} from "./labels";
import { query, queryOne } from "./db";
import { openwa, OpenwaError } from "./openwa";
import { checkRateLimit } from "./rate-limit";

vi.mock("./db", () => ({ queryOne: vi.fn(), query: vi.fn() }));
vi.mock("./openwa", () => {
  class MockOpenwaError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = "OpenwaError";
      this.status = status;
    }
  }
  return {
    openwa: {
      createLabel: vi.fn(),
      updateLabel: vi.fn(),
      deleteLabel: vi.fn(),
      addChatToLabel: vi.fn(),
      removeChatFromLabel: vi.fn(),
      listLabels: vi.fn(),
    },
    OpenwaError: MockOpenwaError,
    publicOpenwaError: () => "Gateway WhatsApp sedang bermasalah.",
  };
});
vi.mock("./rate-limit", () => ({ checkRateLimit: vi.fn() }));

const ctx = { tenantId: "t1", keyId: "k1", requestId: "req-label-1" };

const mockLabel = {
  id: "lbl_1",
  tenantId: "t1",
  name: "VIP Customer",
  color: "#6366f1",
  openwaLabelId: null,
  openwaSyncedAt: null,
  isActive: true,
  createdAt: "2026-09-04T00:00:00.000Z",
  updatedAt: "2026-09-04T00:00:00.000Z",
  contactCount: 5,
};

const mockDevice = {
  id: "dev1",
  openwaSessionId: "owa-1",
  status: "ready",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
});

afterEach(() => vi.restoreAllMocks());

// ── List Labels ─────────────────────────────────────────────────────────────

describe("executeListLabels", () => {
  it("lists labels with contact counts", async () => {
    vi.mocked(query).mockResolvedValue([mockLabel]);

    const r = await executeListLabels(ctx);
    expect(r).toMatchObject({ ok: true, status: 200 });
    if (r.ok) {
      const body = r.body as Record<string, unknown>;
      const labels = body.labels as Array<Record<string, unknown>>;
      expect(labels).toHaveLength(1);
      expect(labels[0]).toMatchObject({ name: "VIP Customer", contactCount: 5 });
    }
  });

  it("returns empty list when no labels", async () => {
    vi.mocked(query).mockResolvedValue([]);
    const r = await executeListLabels(ctx);
    expect(r).toMatchObject({ ok: true, status: 200 });
    if (r.ok) {
      const body = r.body as Record<string, unknown>;
      expect(body.labels).toEqual([]);
    }
  });

  it("rate limit → 429", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSec: 30 });
    const r = await executeListLabels(ctx);
    expect(r).toMatchObject({ ok: false, status: 429 });
  });
});

// ── Create Label ────────────────────────────────────────────────────────────

describe("executeCreateLabel", () => {
  it("creates label with default color", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined); // no existing
    vi.mocked(query).mockResolvedValue([]); // insert

    const r = await executeCreateLabel({ name: "New Lead" }, ctx);
    expect(r).toMatchObject({ ok: true, status: 200 });
    if (r.ok) {
      const body = r.body as Record<string, unknown>;
      const label = body.label as Record<string, unknown>;
      expect(label.name).toBe("New Lead");
      expect(label.color).toBe("#6366f1");
    }
  });

  it("rejects duplicate name per tenant", async () => {
    vi.mocked(queryOne).mockResolvedValue({ id: "existing" }); // name exists

    const r = await executeCreateLabel({ name: "VIP Customer" }, ctx);
    expect(r).toMatchObject({ ok: false, status: 409 });
  });

  it("syncs to OpenWA when requested", async () => {
    vi.mocked(queryOne).mockResolvedValueOnce(undefined); // check name
    vi.mocked(query).mockResolvedValueOnce([]); // insert
    vi.mocked(queryOne).mockResolvedValueOnce(mockDevice); // device lookup
    vi.mocked(query).mockResolvedValueOnce([]); // update openwaLabelId
    vi.mocked(openwa.createLabel).mockResolvedValue({ id: "owa_lbl_123", name: "Synced Label", color: "#6366f1" });

    const r = await executeCreateLabel(
      { name: "Synced Label", syncToOpenwa: true, deviceId: "dev1" },
      ctx
    );
    expect(r).toMatchObject({ ok: true, status: 200 });
    expect(openwa.createLabel).toHaveBeenCalledWith("owa-1", "Synced Label", "#6366f1");
  });

  it("empty name → 400", async () => {
    const r = await executeCreateLabel({ name: "" }, ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it("rate limit → 429", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSec: 30 });
    const r = await executeCreateLabel({ name: "Test" }, ctx);
    expect(r).toMatchObject({ ok: false, status: 429 });
  });
});

// ── Update Label ────────────────────────────────────────────────────────────

describe("executeUpdateLabel", () => {
  it("updates label name and color", async () => {
    vi.mocked(queryOne).mockResolvedValueOnce(mockLabel); // get label
    vi.mocked(queryOne).mockResolvedValueOnce(undefined); // check name uniqueness
    vi.mocked(query).mockResolvedValueOnce([]); // update

    const r = await executeUpdateLabel("lbl_1", { name: "Updated Name", color: "#10b981" }, ctx);
    expect(r).toMatchObject({ ok: true, status: 200 });
  });

  it("rejects duplicate name", async () => {
    vi.mocked(queryOne).mockResolvedValueOnce(mockLabel); // get label
    vi.mocked(queryOne).mockResolvedValueOnce({ id: "other" }); // name conflict

    const r = await executeUpdateLabel("lbl_1", { name: "Existing Name" }, ctx);
    expect(r).toMatchObject({ ok: false, status: 409 });
  });

  it("label not found → 404", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);
    const r = await executeUpdateLabel("nonexistent", { name: "Test" }, ctx);
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it("syncs to OpenWA when label is synced", async () => {
    const syncedLabel = { ...mockLabel, openwaLabelId: "owa_lbl_123" };
    vi.mocked(queryOne).mockResolvedValueOnce(syncedLabel); // get label
    vi.mocked(queryOne).mockResolvedValueOnce(undefined); // check name
    vi.mocked(query).mockResolvedValueOnce([]); // update
    vi.mocked(queryOne).mockResolvedValueOnce(mockDevice); // device
    vi.mocked(query).mockResolvedValueOnce([]); // update syncedAt

    const r = await executeUpdateLabel("lbl_1", { name: "Updated", deviceId: "dev1" }, ctx);
    expect(r).toMatchObject({ ok: true, status: 200 });
    expect(openwa.updateLabel).toHaveBeenCalledWith("owa-1", "owa_lbl_123", {
      name: "Updated",
      color: "#6366f1",
    });
  });
});

// ── Delete Label ────────────────────────────────────────────────────────────

describe("executeDeleteLabel", () => {
  it("soft deletes label", async () => {
    vi.mocked(queryOne).mockResolvedValueOnce(mockLabel); // get label
    vi.mocked(query).mockResolvedValueOnce([]); // soft delete

    const r = await executeDeleteLabel("lbl_1", ctx);
    expect(r).toMatchObject({ ok: true, status: 200 });
  });

  it("deletes from OpenWA when synced", async () => {
    const syncedLabel = { ...mockLabel, openwaLabelId: "owa_lbl_123" };
    vi.mocked(queryOne).mockResolvedValueOnce(syncedLabel); // get label
    vi.mocked(query).mockResolvedValueOnce([]); // soft delete
    vi.mocked(queryOne).mockResolvedValueOnce(mockDevice); // device lookup
    vi.mocked(openwa.deleteLabel).mockResolvedValue({ success: true });

    const r = await executeDeleteLabel("lbl_1", ctx);
    expect(r).toMatchObject({ ok: true, status: 200 });
    expect(openwa.deleteLabel).toHaveBeenCalledWith("owa-1", "owa_lbl_123");
  });

  it("label not found → 404", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);
    const r = await executeDeleteLabel("nonexistent", ctx);
    expect(r).toMatchObject({ ok: false, status: 404 });
  });
});

// ── Add Chat to Label ───────────────────────────────────────────────────────

describe("executeAddChatToLabel", () => {
  it("adds chat to label", async () => {
    vi.mocked(queryOne).mockResolvedValueOnce(mockLabel); // get label
    vi.mocked(query).mockResolvedValueOnce([{ chatId: "628123456789@c.us" }]); // insert with returning

    const r = await executeAddChatToLabel("lbl_1", { chatId: "628123456789@c.us" }, ctx);
    expect(r).toMatchObject({ ok: true, status: 200 });
    if (r.ok) {
      expect(r.body).toMatchObject({ ok: true, added: true });
    }
  });

  it("idempotent — already added returns added: false", async () => {
    vi.mocked(queryOne).mockResolvedValueOnce(mockLabel);
    vi.mocked(query).mockResolvedValueOnce([]); // on conflict do nothing returns []

    const r = await executeAddChatToLabel("lbl_1", { chatId: "628123456789@c.us" }, ctx);
    expect(r).toMatchObject({ ok: true, status: 200 });
    if (r.ok) {
      expect(r.body).toMatchObject({ ok: true, added: false, reason: "already_added" });
    }
  });

  it("syncs to OpenWA when label is synced", async () => {
    const syncedLabel = { ...mockLabel, openwaLabelId: "owa_lbl_123" };
    vi.mocked(queryOne).mockResolvedValueOnce(syncedLabel); // get label
    vi.mocked(query).mockResolvedValueOnce([{ chatId: "628123456789@c.us" }]); // insert with returning
    vi.mocked(queryOne).mockResolvedValueOnce(mockDevice); // device
    vi.mocked(openwa.addChatToLabel).mockResolvedValue({ success: true });

    const r = await executeAddChatToLabel(
      "lbl_1",
      { chatId: "628123456789@c.us", deviceId: "dev1" },
      ctx
    );
    expect(r).toMatchObject({ ok: true, status: 200 });
    expect(openwa.addChatToLabel).toHaveBeenCalledWith("owa-1", "owa_lbl_123", "628123456789@c.us");
  });

  it("label not found → 404", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);
    const r = await executeAddChatToLabel("nonexistent", { chatId: "628123456789@c.us" }, ctx);
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it("missing chatId → 400", async () => {
    const r = await executeAddChatToLabel("lbl_1", { chatId: "" }, ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });
});

// ── Remove Chat from Label ──────────────────────────────────────────────────

describe("executeRemoveChatFromLabel", () => {
  it("removes chat from label", async () => {
    vi.mocked(queryOne).mockResolvedValueOnce(mockLabel); // get label
    vi.mocked(query).mockResolvedValueOnce([]); // delete

    const r = await executeRemoveChatFromLabel("lbl_1", "628123456789@c.us", ctx);
    expect(r).toMatchObject({ ok: true, status: 200 });
    if (r.ok) {
      expect(r.body).toMatchObject({ ok: true, removed: true });
    }
  });

  it("syncs removal to OpenWA when label is synced", async () => {
    const syncedLabel = { ...mockLabel, openwaLabelId: "owa_lbl_123" };
    vi.mocked(queryOne).mockResolvedValueOnce(syncedLabel); // get label
    vi.mocked(query).mockResolvedValueOnce([]); // delete
    vi.mocked(queryOne).mockResolvedValueOnce(mockDevice); // device lookup
    vi.mocked(openwa.removeChatFromLabel).mockResolvedValue({ success: true });

    const r = await executeRemoveChatFromLabel("lbl_1", "628123456789@c.us", ctx);
    expect(r).toMatchObject({ ok: true, status: 200 });
    expect(openwa.removeChatFromLabel).toHaveBeenCalledWith("owa-1", "owa_lbl_123", "628123456789@c.us");
  });

  it("label not found → 404", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);
    const r = await executeRemoveChatFromLabel("nonexistent", "628123456789@c.us", ctx);
    expect(r).toMatchObject({ ok: false, status: 404 });
  });
});

// ── List Chats by Label ─────────────────────────────────────────────────────

describe("executeListChatsByLabel", () => {
  it("returns paginated chat list", async () => {
    vi.mocked(queryOne).mockResolvedValueOnce(mockLabel); // get label
    vi.mocked(query).mockResolvedValue([
      { id: "lc_1", tenantId: "t1", labelId: "lbl_1", chatId: "6281@c.us", createdAt: "2026-09-04T00:00:00Z" },
    ]);

    const r = await executeListChatsByLabel("lbl_1", { limit: 10, offset: 0 }, ctx);
    expect(r).toMatchObject({ ok: true, status: 200 });
    if (r.ok) {
      const body = r.body as Record<string, unknown>;
      const chats = body.chats as Array<Record<string, unknown>>;
      expect(chats).toHaveLength(1);
      expect(chats[0]).toMatchObject({ chatId: "6281@c.us" });
    }
  });

  it("label not found → 404", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);
    const r = await executeListChatsByLabel("nonexistent", {}, ctx);
    expect(r).toMatchObject({ ok: false, status: 404 });
  });
});

// ── Bulk Add Chats ──────────────────────────────────────────────────────────

describe("executeBulkAddChatsToLabel", () => {
  it("bulk adds chats, skips duplicates", async () => {
    vi.mocked(queryOne).mockResolvedValueOnce(mockLabel); // get label
    vi.mocked(query).mockResolvedValueOnce([{ chatId: "6281@c.us" }]); // chat 1 added
    vi.mocked(query).mockResolvedValueOnce([]); // chat 2 duplicate

    const r = await executeBulkAddChatsToLabel(
      "lbl_1",
      { chatIds: ["6281@c.us", "6282@c.us"] },
      ctx
    );
    expect(r).toMatchObject({ ok: true, status: 200 });
    if (r.ok) {
      expect(r.body).toMatchObject({ ok: true, added: 1, skipped: 1 });
    }
  });

  it("rejects >100 chatIds", async () => {
    const tooMany = Array.from({ length: 101 }, (_, i) => `628${i}@c.us`);
    const r = await executeBulkAddChatsToLabel("lbl_1", { chatIds: tooMany }, ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it("empty chatIds → 400", async () => {
    const r = await executeBulkAddChatsToLabel("lbl_1", { chatIds: [] }, ctx);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it("label not found → 404", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);
    const r = await executeBulkAddChatsToLabel("nonexistent", { chatIds: ["6281@c.us"] }, ctx);
    expect(r).toMatchObject({ ok: false, status: 404 });
  });
});
