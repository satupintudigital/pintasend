// Service layer untuk Labels CRUD — PintaSend-local labels + OpenWA sync.
// Labels are per-tenant, stored in Neon, with optional sync to WhatsApp labels via OpenWA.

import { query, queryOne } from "./db";
import { openwa } from "./openwa";
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

  const labels = await query<{
    id: string;
    tenantId: string;
    name: string;
    color: string;
    openwaLabelId: string | null;
    openwaSyncedAt: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    contactCount: number | string;
  }>(
    `SELECT l.id, l."tenantId", l.name, l.color, l."openwaLabelId", l."openwaSyncedAt",
            l."isActive", l."createdAt", l."updatedAt",
            COALESCE(COUNT(lc.id), 0)::int as "contactCount"
     FROM "Label" l
     LEFT JOIN "LabelContact" lc ON lc."labelId" = l.id
     WHERE l."tenantId" = $1 AND l."isActive" = true
     GROUP BY l.id
     ORDER BY l.name ASC`,
    [ctx.tenantId]
  );

  const labelsWithCounts = labels.map((label) => ({
    id: label.id,
    name: label.name,
    color: label.color,
    contactCount: Number(label.contactCount) || 0,
    openwaSynced: label.openwaLabelId !== null,
    isActive: label.isActive,
    createdAt: label.createdAt,
    updatedAt: label.updatedAt,
  }));

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
  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM "Label" WHERE "tenantId" = $1 AND name = $2 AND "isActive" = true',
    [ctx.tenantId, input.name.trim()]
  );
  if (existing) {
    return { ok: false, status: 409, error: "Label with this name already exists" };
  }

  const id = generateId();
  const color = input.color || "#6366f1";
  const now = new Date().toISOString();

  // Insert into Neon DB
  await query(
    'INSERT INTO "Label" (id, "tenantId", name, color, "isActive", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, true, now(), now())',
    [id, ctx.tenantId, input.name.trim(), color]
  );

  let openwaLabelId: string | null = null;

  // Sync to OpenWA if requested
  if (input.syncToOpenwa && input.deviceId) {
    try {
      const device = await queryOne<{ id: string; openwaSessionId: string; status: string }>(
        'SELECT id, "openwaSessionId", status FROM "Device" WHERE id = $1 AND "tenantId" = $2',
        [input.deviceId, ctx.tenantId]
      );
      if (device && device.status === "ready") {
        const result = await openwa.createLabel(device.openwaSessionId, input.name.trim(), color);
        openwaLabelId = result.id || null;

        // Update label with openwaLabelId
        if (openwaLabelId) {
          await query(
            'UPDATE "Label" SET "openwaLabelId" = $1, "openwaSyncedAt" = now() WHERE id = $2',
            [openwaLabelId, id]
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

  const label = await queryOne<Label>(
    'SELECT * FROM "Label" WHERE id = $1 AND "tenantId" = $2 AND "isActive" = true',
    [labelId, ctx.tenantId]
  );
  if (!label) return { ok: false, status: 404, error: "Label not found" };

  // Check name uniqueness if changing name
  if (input.name && input.name.trim() !== label.name) {
    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM "Label" WHERE "tenantId" = $1 AND name = $2 AND id != $3 AND "isActive" = true',
      [ctx.tenantId, input.name.trim(), labelId]
    );
    if (existing) {
      return { ok: false, status: 409, error: "Label with this name already exists" };
    }
  }

  const updates: string[] = [];
  const params: unknown[] = [];

  if (input.name !== undefined) {
    updates.push(`name = $${params.length + 1}`);
    params.push(input.name.trim());
  }
  if (input.color !== undefined) {
    updates.push(`color = $${params.length + 1}`);
    params.push(input.color);
  }

  if (updates.length > 0) {
    updates.push(`"updatedAt" = now()`);
    params.push(labelId);
    params.push(ctx.tenantId);
    await query(
      `UPDATE "Label" SET ${updates.join(", ")} WHERE id = $${params.length - 1} AND "tenantId" = $${params.length}`,
      params
    );
  }

  // Sync to OpenWA if label is synced
  if (label.openwaLabelId && input.deviceId) {
    try {
      const device = await queryOne<{ id: string; openwaSessionId: string; status: string }>(
        'SELECT id, "openwaSessionId", status FROM "Device" WHERE id = $1 AND "tenantId" = $2',
        [input.deviceId, ctx.tenantId]
      );
      if (device && device.status === "ready") {
        await openwa.updateLabel(device.openwaSessionId, label.openwaLabelId, {
          name: input.name?.trim() ?? label.name,
          color: input.color ?? label.color,
        });
        await query('UPDATE "Label" SET "openwaSyncedAt" = now() WHERE id = $1', [labelId]);
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

  const label = await queryOne<Label>(
    'SELECT * FROM "Label" WHERE id = $1 AND "tenantId" = $2 AND "isActive" = true',
    [labelId, ctx.tenantId]
  );
  if (!label) return { ok: false, status: 404, error: "Label not found" };

  // Soft delete (set isActive = false)
  await query('UPDATE "Label" SET "isActive" = false, "updatedAt" = now() WHERE id = $1', [labelId]);

  // Delete from OpenWA if synced
  if (label.openwaLabelId) {
    try {
      const device = await queryOne<{ id: string; openwaSessionId: string; status: string }>(
        'SELECT id, "openwaSessionId", status FROM "Device" WHERE "tenantId" = $1 AND status = $2 LIMIT 1',
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

  const label = await queryOne<Label>(
    'SELECT * FROM "Label" WHERE id = $1 AND "tenantId" = $2 AND "isActive" = true',
    [labelId, ctx.tenantId]
  );
  if (!label) return { ok: false, status: 404, error: "Label not found" };

  const id = generateContactId();

  // Insert into LabelContact with ON CONFLICT
  const rows = await query<{ chatId: string }>(
    'INSERT INTO "LabelContact" (id, "tenantId", "labelId", "chatId", "createdAt") VALUES ($1, $2, $3, $4, now()) ON CONFLICT ("labelId", "chatId") DO NOTHING RETURNING "chatId"',
    [id, ctx.tenantId, labelId, input.chatId]
  );
  const added = rows.length > 0;
  if (!added) return { ok: true, status: 200, body: { ok: true, added: false, reason: "already_added" } };
  // Sync to OpenWA if label is synced
  if (label.openwaLabelId && input.deviceId) {
    try {
      const device = await queryOne<{ id: string; openwaSessionId: string; status: string }>(
        'SELECT id, "openwaSessionId", status FROM "Device" WHERE id = $1 AND "tenantId" = $2',
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

  const label = await queryOne<Label>(
    'SELECT * FROM "Label" WHERE id = $1 AND "tenantId" = $2 AND "isActive" = true',
    [labelId, ctx.tenantId]
  );
  if (!label) return { ok: false, status: 404, error: "Label not found" };

  // Delete from LabelContact
  await query('DELETE FROM "LabelContact" WHERE "labelId" = $1 AND "chatId" = $2', [labelId, chatId]);

  // Sync to OpenWA if label is synced
  if (label.openwaLabelId) {
    try {
      const device = await queryOne<{ id: string; openwaSessionId: string; status: string }>(
        'SELECT id, "openwaSessionId", status FROM "Device" WHERE "tenantId" = $1 AND status = $2 LIMIT 1',
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

  const label = await queryOne<Label>(
    'SELECT * FROM "Label" WHERE id = $1 AND "tenantId" = $2 AND "isActive" = true',
    [labelId, ctx.tenantId]
  );
  if (!label) return { ok: false, status: 404, error: "Label not found" };

  const limit = Math.min(Math.max(input.limit ?? 50, 1), 1000);
  const offset = Math.max(input.offset ?? 0, 0);

  const contacts = await query<LabelContact>(
    'SELECT * FROM "LabelContact" WHERE "labelId" = $1 ORDER BY "createdAt" DESC LIMIT $2 OFFSET $3',
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

  const label = await queryOne<Label>(
    'SELECT * FROM "Label" WHERE id = $1 AND "tenantId" = $2 AND "isActive" = true',
    [labelId, ctx.tenantId]
  );
  if (!label) return { ok: false, status: 404, error: "Label not found" };

  const addedChatIds: string[] = [];
  for (const chatId of input.chatIds) {
    const id = generateContactId();
    const rows = await query<{ chatId: string }>(
      'INSERT INTO "LabelContact" (id, "tenantId", "labelId", "chatId", "createdAt") VALUES ($1, $2, $3, $4, now()) ON CONFLICT ("labelId", "chatId") DO NOTHING RETURNING "chatId"',
      [id, ctx.tenantId, labelId, chatId]
    );
    if (rows.length > 0) {
      addedChatIds.push(chatId);
    }
  }

  const added = addedChatIds.length;
  const skipped = input.chatIds.length - added;

  // Sync to OpenWA only newly added chats if label is synced
  if (label.openwaLabelId && input.deviceId && added > 0) {
    try {
      const device = await queryOne<{ id: string; openwaSessionId: string; status: string }>(
        'SELECT id, "openwaSessionId", status FROM "Device" WHERE id = $1 AND "tenantId" = $2',
        [input.deviceId, ctx.tenantId]
      );
      if (device && device.status === "ready") {
        for (const chatId of addedChatIds) {
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
