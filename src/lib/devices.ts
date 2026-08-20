import { query, queryOne } from "@/lib/db";
import { queryD1 } from "@/lib/d1";
import { uuidv7 } from "@/lib/uuidv7";
import { openwa, openwaWebhookSecret, OPENWA_WEBHOOK_EVENTS } from "@/lib/openwa";
import { deleteCachedDeviceList } from "@/lib/deviceCache";

export interface DeviceRow {
  id: string;
  tenantId: string;
  label: string;
  openwaSessionId: string;
  openwaWebhookId: string | null;
  phone: string | null;
  restriction: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const DEVICE_COLUMNS = `id, "tenantId", label, "openwaSessionId", "openwaWebhookId", phone, restriction, status, "createdAt", "updatedAt"`;

export async function listDevicesForTenant(tenantId: string): Promise<DeviceRow[]> {
  return query<DeviceRow>(
    `SELECT ${DEVICE_COLUMNS} FROM "Device" WHERE "tenantId" = $1 ORDER BY "createdAt" DESC`,
    [tenantId],
  );
}

export async function getDeviceForTenant(
  deviceId: string,
  tenantId: string,
): Promise<DeviceRow | undefined> {
  return queryOne<DeviceRow>(
    `SELECT ${DEVICE_COLUMNS} FROM "Device" WHERE id = $1 AND "tenantId" = $2`,
    [deviceId, tenantId],
  );
}

// URL ingest webhook Wavio — didaftarkan ke OpenWA per session.
function openwaWebhookUrl(): string {
  const base = process.env.WAVIO_PUBLIC_BASE_URL ?? "https://wavio.satupintudigital.co.id";
  return `${base}/api/webhooks/openwa`;
}

/**
 * Buat device: create session OpenWA → daftar webhook (message.received,
 * session.status) → INSERT Device (Neon) → clone D1 → invalidasi cache.
 * Gagal di tengah → bersihkan session/webhook OpenWA (hindari orphan).
 * Dipakai route /api/devices (dashboard) & /api/connect/device (wizard SSO).
 */
export async function createDeviceAndStart(
  label: string,
  tenantId: string,
): Promise<{ id: string; openwaSessionId: string; status: string }> {
  const deviceId = uuidv7();
  const sessionName = `wavio-${deviceId.replace(/-/g, "").slice(0, 12)}`;

  const owa = await openwa.createSession(sessionName);
  let openwaWebhookId: string | null = null;
  try {
    const wh = await openwa.registerWebhook(owa.id, {
      url: openwaWebhookUrl(),
      // Seluruh event yang Wavio inginkan dari OpenWA — termasuk message.ack
      // & message.failed untuk pelacakan status kirim (sent → delivered → read).
      events: [...OPENWA_WEBHOOK_EVENTS],
      secret: await openwaWebhookSecret(owa.id),
      retryCount: 3,
    });
    openwaWebhookId = wh.id;
  } catch (whErr) {
    await openwa.deleteSession(owa.id).catch(() => {});
    throw whErr;
  }

  const now = new Date().toISOString();
  try {
    await query(
      'INSERT INTO "Device" (id, "tenantId", label, "openwaSessionId", "openwaWebhookId", status, "createdAt", "updatedAt") ' +
        "VALUES ($1, $2, $3, $4, $5, $6, $7, $7)",
      [deviceId, tenantId, label, owa.id, openwaWebhookId, owa.status, now],
    );
  } catch (dbErr) {
    if (openwaWebhookId) await openwa.deleteWebhook(owa.id, openwaWebhookId).catch(() => {});
    await openwa.deleteSession(owa.id).catch(() => {});
    throw dbErr;
  }
  await cloneDeviceToD1({
    id: deviceId,
    tenantId,
    label,
    openwaSessionId: owa.id,
    openwaWebhookId,
    phone: null,
    restriction: null,
    status: owa.status,
    createdAt: now,
    updatedAt: now,
  }).catch((e) => console.error("devices: clone D1 gagal:", e));
  await deleteCachedDeviceList(tenantId);
  return { id: deviceId, openwaSessionId: owa.id, status: owa.status };
}

/** Lookup device by OpenWA session id (Neon) — fallback ingest saat D1 miss. */
export async function getDeviceBySessionId(
  sessionId: string,
): Promise<DeviceRow | undefined> {
  return queryOne<DeviceRow>(
    `SELECT ${DEVICE_COLUMNS} FROM "Device" WHERE "openwaSessionId" = $1`,
    [sessionId],
  );
}

// ── Rekonsiliasi webhook OpenWA (device lama → ack delivery aktif) ───────────
// Device yang dibuat SEBELUM event message.ack/message.failed/message.edited
// ditambahkan didaftarkan ke OpenWA hanya dengan { message.received,
// session.status }, sehingga OpenWA belum mengirim ack → pelacakan status kirim
// (sent → delivered → read) tidak jalan. Fungsi ini memastikan webhook Wavio
// memuat SELURUH OPENWA_WEBHOOK_EVENTS. Idempoten & best-effort (error ditangkap
// internal → tidak pernah melempar ke pemanggil polling/start):
//   - list webhook session → cari milik Wavio (by openwaWebhookId, fallback URL).
//   - events sudah superset & URL cocok → no-op.
//   - events kurang / URL berubah → PUT update (url + events + secret + retry).
//   - tidak ditemukan → POST register baru & simpan openwaWebhookId.

export interface WebhookReconcileResult {
  changed: boolean;
  error?: string;
}

export async function ensureDeviceWebhookEvents(
  device: Pick<DeviceRow, "id" | "openwaSessionId" | "openwaWebhookId">,
): Promise<WebhookReconcileResult> {
  const desired = [...OPENWA_WEBHOOK_EVENTS];
  const url = openwaWebhookUrl();
  try {
    const secret = await openwaWebhookSecret(device.openwaSessionId);
    const existing = await openwa.listWebhooks(device.openwaSessionId);

    // Cari webhook milik Wavio: id tersimpan dulu, fallback cocokkan URL.
    let wh = existing.find((w) => w.id === device.openwaWebhookId);
    if (!wh) wh = existing.find((w) => w.url === url);

    if (wh) {
      const current = Array.isArray(wh.events) ? wh.events : [];
      const missing = desired.filter((e) => !current.includes(e));
      const urlDrift = wh.url !== url;
      if (missing.length === 0 && !urlDrift) return { changed: false };

      await openwa.updateWebhook(device.openwaSessionId, wh.id, {
        url,
        events: desired,
        secret,
        retryCount: 3,
      });
      // Bila id tersimpan basi (cocok via URL) → perbaiki pointer DB.
      if (wh.id !== device.openwaWebhookId) {
        await query('UPDATE "Device" SET "openwaWebhookId" = $1, "updatedAt" = now() WHERE id = $2', [
          wh.id,
          device.id,
        ]);
      }
      return { changed: true };
    }

    // Tidak ada webhook Wavio → register baru & simpan id.
    const created = await openwa.registerWebhook(device.openwaSessionId, {
      url,
      events: desired,
      secret,
      retryCount: 3,
    });
    await query('UPDATE "Device" SET "openwaWebhookId" = $1, "updatedAt" = now() WHERE id = $2', [
      created.id,
      device.id,
    ]);
    return { changed: true };
  } catch (e) {
    return { changed: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Replika D1 (write-through, sama pola authStore) ──────────────────────────
// D1 dipakai jalur baca cepat: ingest webhook (openwaSessionId → device) dan
// dashboard. Gagal clone → log; konsistensi dikembalikan oleh d1-resync job.

export async function cloneDeviceToD1(d: DeviceRow): Promise<void> {
  await queryD1(
    "INSERT OR REPLACE INTO Device (id, tenantId, label, openwaSessionId, openwaWebhookId, phone, restriction, status, createdAt, updatedAt) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      d.id,
      d.tenantId,
      d.label,
      d.openwaSessionId,
      d.openwaWebhookId,
      d.phone,
      d.restriction,
      d.status,
      d.createdAt,
      d.updatedAt,
    ],
  );
}

// ── Pembatasan akun (session.restriction) ────────────────────────────────────
// OpenWA mengirim `session.restriction` (dan menyertakan `restriction` di respons
// GET /api/sessions/:id) dengan bentuk { kind, code, expiresAt } — kind:
// reachout_timelock | tos_block | proxy_block. Disimpan sebagai JSON string
// (null = tidak ada). Helper menormalisasi berbagai bentuk payload.

export interface DeviceRestriction {
  kind: string;
  code: string;
  expiresAt: string | null;
}

/** Normalisasi payload OpenWA → JSON string (null = tidak ada restriction). */
export function openwaRestrictionToJson(raw: unknown): string | null {
  let obj = raw;
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    const inner = (obj as Record<string, unknown>).restriction;
    if (inner && typeof inner === "object" && !Array.isArray(inner)) obj = inner;
  }
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    const o = obj as Record<string, unknown>;
    const kind = typeof o.kind === "string" ? o.kind : "";
    if (kind) {
      return JSON.stringify({
        kind,
        code: typeof o.code === "string" ? o.code : "",
        expiresAt: typeof o.expiresAt === "string" ? o.expiresAt : null,
      });
    }
  }
  return null;
}

/** Parse JSON string restriction → objek (null = tidak ada / korup). */
export function restrictionFromJson(raw: string | null): DeviceRestriction | null {
  if (!raw) return null;
  try {
    const obj: unknown = JSON.parse(raw);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      const o = obj as Record<string, unknown>;
      if (typeof o.kind === "string") {
        return {
          kind: o.kind,
          code: typeof o.code === "string" ? o.code : "",
          expiresAt: typeof o.expiresAt === "string" ? o.expiresAt : null,
        };
      }
    }
  } catch {
    /* korup → null */
  }
  return null;
}

export async function deleteDeviceFromD1(id: string): Promise<void> {
  await queryD1("DELETE FROM Device WHERE id = ?", [id]);
}
