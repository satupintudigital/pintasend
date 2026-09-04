// Service layer untuk Labels CRUD — Wavio-local labels + OpenWA sync.
// Labels are per-tenant, stored in Neon, with optional sync to WhatsApp labels via OpenWA.

import { queryD1One, queryD1 } from "./d1";
import { openwa, OpenwaError, publicOpenwaError } from "./openwa";
import { checkRateLimit } from "./rate-limit";
import { logEvent } from "./requestLogger";

// ── Types ───────────────────────────────────────────────────────────────────

export interface LabelContext {
  tenantId: string;
  keyId: string;
  requestId: string;
}

export interface Label {
  id: string;
  tenantId: string;
  name: string;
  color: string;
  openwaLabelId: string | null;
  openwaSyncedAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LabelContact {
  id: string;
  tenantId: string;
  labelId: string;
  chatId: string;
  createdAt: string;
}

export type LabelResult =
  | { ok: true; status: 200; body: Record<string, unknown> }
  | { ok: false; status: number; error: string; retryAfterSec?: number };

// ── Helpers ─────────────────────────────────────────────────────────────────

function generateId(): string {
  return `lbl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateContactId(): string {
  return `lc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── List Labels ─────────────────────────────────────────────────────────────

export async function executeListLabels(ctx: LabelContext): Promise<LabelResult> {
  const rl = await checkRateLimit(`v1-labels:list:key:${ctx.keyId}`, 60, 60_000);
  if (!rl.allowed) return { ok: false, status: 429, error: "Terlalu banyak permintaan.", retryAfterSec: rl.retryAfterSec };

  const labels = await queryD1<Label>(
    "SELECT * FROM Label WHERE tenantId = ? AND isActive = 1 ORDER BY name ASC",
    [ctx.tenantId]
  );

  // Get contact counts for each label
  const labelsWithCounts = await Promise.all(
    labels.map(async (label: Label) => {
      const countResult = await queryD1One<{ count: number }>(
        "SELECT COUNT(*) as count FROM LabelContact WHERE labelId = ?",
        [label.id]
      );
      return {
        id: label.id,
        name: label.name,
        color: label.color,
        contactCount: countResult?.count ?? 0,
        openwaSynced: label.openwaLabelId !== null,
        isActive: label.isActive,
        createdAt: label.createdAt,
        updatedAt: label.updatedAt,
      };
    })
  );

  logEvent("info", "list_labels_success", ctx.requestId, { tenantId: ctx.tenantId, count: labelsWithCounts.length });
  return { ok: true, status: 200, body: { ok: true, labels: labelsWithCounts } };
}

// ── Create Label ────────────────────────────────────────────────────────────

export async function executeCreateLabel(
  input: { name: string; color?: string; syncToOpenwa?: boolean; deviceId?: string },
  ctx: LabelContext
): Promise<LabelResult> {
  if (!input.name || input.name.trim().length === 0) {
    return { ok: false, status: 400, error: "Name is required" };
  }

  const rl = await checkRateLimit(`v1-labels:create:key:${ctx.keyId}`, 30, 60_000);
  if (!rl.allowed) return { ok: false, status: 429, error: "Terlalu banyak permintaan.", retryAfterSec: rl.retryAfterSec };

  // Check name uniqueness per tenant
  const existing = await queryD1One<{ id: string }>(
    "SELECT id FROM Label WHERE tenantId = ? AND name = ? AND isActive = 1",
    [ctx.tenantId, input.name.trim()]
  );
  if (existing) {
    return { ok: false, status: 409, error: "Label with this name already exists" };
  }

  const id = generateId();
  const color = input.color || "#6366f1";
  const now = new Date().toISOString();

  // Insert into D1 (local DB)
  await queryD1One(
    "INSERT INTO Label (id, tenantId, name, color, isActive, createdAt, updatedAt) VALUES (?, ?, ?, ?, 1, ?, ?)",
    [id, ctx.tenantId, input.name.trim(), color, now, now]
  );

  let openwaLabelId: string | null = null;

  // Sync to OpenWA if requested
  if (input.syncToOpenwa && input.deviceId) {
    try {
      const device = await queryD1One<{ id: string; openwaSessionId: string; status: string }>(
        "SELECT id, openwaSessionId, status FROM Device WHERE id = ? AND tenantId = ?",
        [input.deviceId, ctx.tenantId]
      );
      if (device && device.status === "ready") {
        const result = await openwa.createLabel(device.openwaSessionId, input.name.trim(), color);
        openwaLabelId = result.id || null;

        // Update label with openwaLabelId
        if (openwaLabelId) {
          await queryD1One(
            "UPDATE Label SET openwaLabelId = ?, openwaSyncedAt = ? WHERE id = ?",
            [openwaLabelId, now, id]
          );
        }
      }
    } catch (e) {
      // Log but don't fail — label is still created locally
      logEvent("warn", "label_openwa_sync_failed", ctx.requestId, {
        tenantId: ctx.tenantId,
        labelId: id,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  logEvent("info", "label_created", ctx.requestId, { tenantId: ctx.tenantId, labelId: id, name: input.name.trim() });
  return {
    ok: true,
    status: 200,
    body: { ok: true, label: { id, name: input.name.trim(), color, openwaSynced: openwaLabelId !== null } },
  };
}

// ── Update Label ────────────────────────────────────────────────────────────

export async function executeUpdateLabel(
  labelId: string,
  input: { name?: string; color?: string; deviceId?: string },
  ctx: LabelContext
): Promise<LabelResult> {
  if (!labelId) return { ok: false, status: 400, error: "labelId is required" };

  const rl = await checkRateLimit(`v1-labels:update:key:${ctx.keyId}`, 30, 60_000);
  if (!rl.allowed) return { ok: false, status: 429, error: "Terlalu banyak permintaan.", retryAfterSec: rl.retryAfterSec };

  const label = await queryD1One<Label>(
    "SELECT * FROM Label WHERE id = ? AND tenantId = ? AND isActive = 1",
    [labelId, ctx.tenantId]
  );
  if (!label) return { ok: false, status: 404, error: "Label not found" };

  // Check name uniqueness if changing name
  if (input.name && input.name.trim() !== label.name) {
    const existing = await queryD1One<{ id: string }>(
      "SELECT id FROM Label WHERE tenantId = ? AND name = ? AND id != ? AND isActive = 1",
      [ctx.tenantId, input.name.trim(), labelId]
    );
    if (existing) {
      return { ok: false, status: 409, error: "Label with this name already exists" };
    }
  }

  const now = new Date().toISOString();
  const updates: string[] = [];
  const params: unknown[] = [];

  if (input.name !== undefined) {
    updates.push("name = ?");
    params.push(input.name.trim());
  }
  if (input.color !== undefined) {
    updates.push("color = ?");
    params.push(input.color);
  }

  if (updates.length > 0) {
    updates.push("updatedAt = ?");
    params.push(now);
    params.push(labelId);
    params.push(ctx.tenantId);
    await queryD1One(`UPDATE Label SET ${updates.join(", ")} WHERE id = ? AND tenantId = ?`, params);
  }

  // Sync to OpenWA if label is synced
  if (label.openwaLabelId && input.deviceId) {
    try {
      const device = await queryD1One<{ id: string; openwaSessionId: string; status: string }>(
        "SELECT id, openwaSessionId, status FROM Device WHERE id = ? AND tenantId = ?",
        [input.deviceId, ctx.tenantId]
      );
      if (device && device.status === "ready") {
        await openwa.updateLabel(device.openwaSessionId, label.openwaLabelId, {
          name: input.name?.trim() ?? label.name,
          color: input.color ?? label.color,
        });
        await queryD1One("UPDATE Label SET openwaSyncedAt = ? WHERE id = ?", [now, labelId]);
      }
    } catch (e) {
      logEvent("warn", "label_openwa_update_failed", ctx.requestId, {
        tenantId: ctx.tenantId,
        labelId,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  logEvent("info", "label_updated", ctx.requestId, { tenantId: ctx.tenantId, labelId });
  return { ok: true, status: 200, body: { ok: true, labelId } };
}

// ── Delete Label ────────────────────────────────────────────────────────────

export async function executeDeleteLabel(
  labelId: string,
  ctx: LabelContext
): Promise<LabelResult> {
  if (!labelId) return { ok: false, status: 400, error: "labelId is required" };

  const rl = await checkRateLimit(`v1-labels:delete:key:${ctx.keyId}`, 30, 60_000);
  if (!rl.allowed) return { ok: false, status: 429, error: "Terlalu banyak permintaan.", retryAfterSec: rl.retryAfterSec };

  const label = await queryD1One<Label>(
    "SELECT * FROM Label WHERE id = ? AND tenantId = ? AND isActive = 1",
    [labelId, ctx.tenantId]
  );
  if (!label) return { ok: false, status: 404, error: "Label not found" };

  const now = new Date().toISOString();

  // Soft delete (set isActive = 0)
  await queryD1One("UPDATE Label SET isActive = 0, updatedAt = ? WHERE id = ?", [now, labelId]);

  // Delete from OpenWA if synced
  if (label.openwaLabelId) {
    try {
      // Try to find any device for this tenant to make the API call
      const device = await queryD1One<{ id: string; openwaSessionId: string; status: string }>(
        "SELECT id, openwaSessionId, status FROM Device WHERE tenantId = ? AND status = ? LIMIT 1",
        [ctx.tenantId, "ready"]
      );
      if (device) {
        await openwa.deleteLabel(device.openwaSessionId, label.openwaLabelId);
      }
    } catch (e) {
      logEvent("warn", "label_openwa_delete_failed", ctx.requestId, {
        tenantId: ctx.tenantId,
        labelId,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  logEvent("info", "label_deleted", ctx.requestId, { tenantId: ctx.tenantId, labelId });
  return { ok: true, status: 200, body: { ok: true, labelId } };
}

// ── Add Chat to Label ───────────────────────────────────────────────────────

export async function executeAddChatToLabel(
  labelId: string,
  input: { chatId: string; deviceId?: string },
  ctx: LabelContext
): Promise<LabelResult> {
  if (!labelId) return { ok: false, status: 400, error: "labelId is required" };
  if (!input.chatId) return { ok: false, status: 400, error: "chatId is required" };

  const rl = await checkRateLimit(`v1-labels:chat:add:key:${ctx.keyId}`, 60, 60_000);
  if (!rl.allowed) return { ok: false, status: 429, error: "Terlalu banyak permintaan.", retryAfterSec: rl.retryAfterSec };

  const label = await queryD1One<Label>(
    "SELECT * FROM Label WHERE id = ? AND tenantId = ? AND isActive = 1",
    [labelId, ctx.tenantId]
  );
  if (!label) return { ok: false, status: 404, error: "Label not found" };

  // Check if already added
  const existing = await queryD1One<{ id: string }>(
    "SELECT id FROM LabelContact WHERE labelId = ? AND chatId = ?",
    [labelId, input.chatId]
  );
  if (existing) return { ok: true, status: 200, body: { ok: true, added: false, reason: "already_added" } };

  const id = generateContactId();
  const now = new Date().toISOString();

  // Insert into LabelContact
  await queryD1One(
    "INSERT INTO LabelContact (id, tenantId, labelId, chatId, createdAt) VALUES (?, ?, ?, ?, ?)",
    [id, ctx.tenantId, labelId, input.chatId, now]
  );

  // Sync to OpenWA if label is synced
  if (label.openwaLabelId && input.deviceId) {
    try {
      const device = await queryD1One<{ id: string; openwaSessionId: string; status: string }>(
        "SELECT id, openwaSessionId, status FROM Device WHERE id = ? AND tenantId = ?",
        [input.deviceId, ctx.tenantId]
      );
      if (device && device.status === "ready") {
        await openwa.addChatToLabel(device.openwaSessionId, label.openwaLabelId, input.chatId);
      }
    } catch (e) {
      logEvent("warn", "label_chat_add_sync_failed", ctx.requestId, {
        tenantId: ctx.tenantId,
        labelId,
        chatId: input.chatId,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  logEvent("info", "label_chat_added", ctx.requestId, { tenantId: ctx.tenantId, labelId, chatId: input.chatId });
  return { ok: true, status: 200, body: { ok: true, added: true } };
}

// ── Remove Chat from Label ──────────────────────────────────────────────────

export async function executeRemoveChatFromLabel(
  labelId: string,
  chatId: string,
  ctx: LabelContext
): Promise<LabelResult> {
  if (!labelId) return { ok: false, status: 400, error: "labelId is required" };
  if (!chatId) return { ok: false, status: 400, error: "chatId is required" };

  const rl = await checkRateLimit(`v1-labels:chat:remove:key:${ctx.keyId}`, 60, 60_000);
  if (!rl.allowed) return { ok: false, status: 429, error: "Terlalu banyak permintaan.", retryAfterSec: rl.retryAfterSec };

  const label = await queryD1One<Label>(
    "SELECT * FROM Label WHERE id = ? AND tenantId = ? AND isActive = 1",
    [labelId, ctx.tenantId]
  );
  if (!label) return { ok: false, status: 404, error: "Label not found" };

  // Delete from LabelContact
  await queryD1One("DELETE FROM LabelContact WHERE labelId = ? AND chatId = ?", [labelId, chatId]);

  // Sync to OpenWA if label is synced
  if (label.openwaLabelId) {
    try {
      const device = await queryD1One<{ id: string; openwaSessionId: string; status: string }>(
        "SELECT id, openwaSessionId, status FROM Device WHERE tenantId = ? AND status = ? LIMIT 1",
        [ctx.tenantId, "ready"]
      );
      if (device) {
        await openwa.removeChatFromLabel(device.openwaSessionId, label.openwaLabelId, chatId);
      }
    } catch (e) {
      logEvent("warn", "label_chat_remove_sync_failed", ctx.requestId, {
        tenantId: ctx.tenantId,
        labelId,
        chatId,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  logEvent("info", "label_chat_removed", ctx.requestId, { tenantId: ctx.tenantId, labelId, chatId });
  return { ok: true, status: 200, body: { ok: true, removed: true } };
}

// ── List Chats by Label ─────────────────────────────────────────────────────

export async function executeListChatsByLabel(
  labelId: string,
  input: { limit?: number; offset?: number },
  ctx: LabelContext
): Promise<LabelResult> {
  if (!labelId) return { ok: false, status: 400, error: "labelId is required" };

  const rl = await checkRateLimit(`v1-labels:chats:list:key:${ctx.keyId}`, 60, 60_000);
  if (!rl.allowed) return { ok: false, status: 429, error: "Terlalu banyak permintaan.", retryAfterSec: rl.retryAfterSec };

  const label = await queryD1One<Label>(
    "SELECT * FROM Label WHERE id = ? AND tenantId = ? AND isActive = 1",
    [labelId, ctx.tenantId]
  );
  if (!label) return { ok: false, status: 404, error: "Label not found" };

  const limit = Math.min(Math.max(input.limit ?? 50, 1), 1000);
  const offset = Math.max(input.offset ?? 0, 0);

  const contacts = await queryD1<LabelContact>(
    "SELECT * FROM LabelContact WHERE labelId = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?",
    [labelId, limit, offset]
  );

  logEvent("info", "list_chats_by_label_success", ctx.requestId, { tenantId: ctx.tenantId, labelId, count: contacts.length });
  return {
    ok: true,
    status: 200,
    body: {
      ok: true,
      label: { id: label.id, name: label.name, color: label.color },
      chats: contacts.map((c) => ({ chatId: c.chatId, addedAt: c.createdAt })),
    },
  };
}

// ── Bulk Add Chats to Label ─────────────────────────────────────────────────

export async function executeBulkAddChatsToLabel(
  labelId: string,
  input: { chatIds: string[]; deviceId?: string },
  ctx: LabelContext
): Promise<LabelResult> {
  if (!labelId) return { ok: false, status: 400, error: "labelId is required" };
  if (!input.chatIds || input.chatIds.length === 0) {
    return { ok: false, status: 400, error: "chatIds is required and must not be empty" };
  }
  if (input.chatIds.length > 100) {
    return { ok: false, status: 400, error: "Maximum 100 chatIds per request" };
  }

  const rl = await checkRateLimit(`v1-labels:bulk:key:${ctx.keyId}`, 10, 60_000);
  if (!rl.allowed) return { ok: false, status: 429, error: "Terlalu banyak permintaan.", retryAfterSec: rl.retryAfterSec };

  const label = await queryD1One<Label>(
    "SELECT * FROM Label WHERE id = ? AND tenantId = ? AND isActive = 1",
    [labelId, ctx.tenantId]
  );
  if (!label) return { ok: false, status: 404, error: "Label not found" };

  const now = new Date().toISOString();
  let added = 0;
  let skipped = 0;

  for (const chatId of input.chatIds) {
    // Check if already added
    const existing = await queryD1One<{ id: string }>(
      "SELECT id FROM LabelContact WHERE labelId = ? AND chatId = ?",
      [labelId, chatId]
    );
    if (existing) {
      skipped++;
      continue;
    }

    const id = generateContactId();
    await queryD1One(
      "INSERT INTO LabelContact (id, tenantId, labelId, chatId, createdAt) VALUES (?, ?, ?, ?, ?)",
      [id, ctx.tenantId, labelId, chatId, now]
    );
    added++;
  }

  // Sync to OpenWA if label is synced
  if (label.openwaLabelId && input.deviceId && added > 0) {
    try {
      const device = await queryD1One<{ id: string; openwaSessionId: string; status: string }>(
        "SELECT id, openwaSessionId, status FROM Device WHERE id = ? AND tenantId = ?",
        [input.deviceId, ctx.tenantId]
      );
      if (device && device.status === "ready") {
        for (const chatId of input.chatIds) {
          try {
            await openwa.addChatToLabel(device.openwaSessionId, label.openwaLabelId, chatId);
          } catch {
            // Ignore individual failures in bulk
          }
        }
      }
    } catch (e) {
      logEvent("warn", "label_bulk_sync_failed", ctx.requestId, {
        tenantId: ctx.tenantId,
        labelId,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  logEvent("info", "label_bulk_add_success", ctx.requestId, { tenantId: ctx.tenantId, labelId, added, skipped });
  return { ok: true, status: 200, body: { ok: true, added, skipped } };
}
