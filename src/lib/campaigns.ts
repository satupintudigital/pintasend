// Service layer modul WA Campaign — blast massal bertahap via worker HTTP on-demand.
//
// Alur produk:
//   1. create  → draft (validasi + gate addon 'campaign')
//   2. start   → resolve audiens (Contact non opt-out, filter tag) menjadi
//                baris CampaignRecipient (snapshot) → running/scheduled
//   3. worker  (workers/campaign-dispatch) mengambil batch pending → kirim
//                via OpenWA dgn jeda acak → update status per penerima
//   4. pause/resume/cancel — transisi status eksplisit (guard di bawah)
//
// Kuota: pesan campaign menghitung kuota bulanan PER PENERIMA (konsisten
// send-bulk). Dicek saat start; worker mem-validasi ulang saat dispatch.
// Dispatch TIDAK berjalan di request Workers (batas eksekusi) — pola antrean.

import { query, queryOne } from "@/lib/db";
import { checkRateLimit } from "./rate-limit";
import { logEvent } from "./requestLogger";
import { getTenantConfig } from "./tenantConfig";
import { uuidv7 } from "./uuidv7";
import { CAMPAIGN_ADDON_KEY } from "@/lib/addonKeys";

export { CAMPAIGN_ADDON_KEY };

export const CAMPAIGN_STATUSES = [
  "draft",
  "scheduled",
  "running",
  "paused",
  "completed",
  "failed",
  "cancelled",
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

const CAMPAIGN_MEDIA_TYPES = ["image", "video", "audio", "document"] as const;
export type CampaignMediaType = (typeof CAMPAIGN_MEDIA_TYPES)[number];

const MAX_NAME_LENGTH = 100;
const MAX_BODY_LENGTH = 4096;
const MIN_DELAY_SEC = 3;
const MAX_DELAY_SEC = 60;

export interface CampaignContext {
  tenantId: string;
  keyId: string;
  requestId: string;
}

export type CampaignResult =
  | { ok: true; status: 200 | 201; body: Record<string, unknown> }
  | { ok: false; status: number; error: string };

// ── Template rendering ──────────────────────────────────────────────────────

/**
 * Substitusi token {{key}} pada template body. Pure — di-unit-test.
 * Variabel bawaan dispatcher: nama, nomor, tanggal. Key tanpa nilai → token
 * dibiarkan apa adanya (terlihat jelas di chat, tidak diam-diam kosong).
 */
export function renderCampaignTemplate(body: string, vars: Record<string, string> = {}): string {
  return body.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match,
  );
}

/** Daftar token unik yang dipakai template (untuk preview form dashboard). */
export function extractTemplateVars(body: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const m of body.matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      result.push(m[1]);
    }
  }
  return result;
}

// ── Gate & validasi ─────────────────────────────────────────────────────────

/** true bila tenant berhak memakai modul campaign (TenantAddon aktif). */
export async function tenantHasCampaignAddon(tenantId: string): Promise<boolean> {
  return (await getTenantConfig(tenantId)).addons.campaign;
}

function gateResult(): CampaignResult {
  return { ok: false, status: 403, error: 'Modul Campaign belum aktif untuk tenant ini (addon "campaign")' };
}

export interface CreateCampaignInput {
  name: string;
  messageBody: string;
  deviceId?: string;
  mediaType?: string;
  mediaUrl?: string;
  filename?: string;
  audienceTag?: string | null;
  minDelaySec?: number;
  maxDelaySec?: number;
  scheduledAt?: string | null;
}

/** Buat campaign baru (status draft). Tidak menyentuh audiens/kuota. */
export async function createCampaign(
  input: CreateCampaignInput,
  ctx: CampaignContext,
): Promise<CampaignResult> {
  if (!(await tenantHasCampaignAddon(ctx.tenantId))) return gateResult();

  const name = input.name?.trim() ?? "";
  if (!name) return { ok: false, status: 400, error: '"name" wajib diisi' };
  if (name.length > MAX_NAME_LENGTH) {
    return { ok: false, status: 400, error: `"name" maksimal ${MAX_NAME_LENGTH} karakter` };
  }
  const body = input.messageBody ?? "";
  if (!body.trim()) return { ok: false, status: 400, error: '"messageBody" wajib diisi' };
  if (body.length > MAX_BODY_LENGTH) {
    return { ok: false, status: 400, error: `"messageBody" maksimal ${MAX_BODY_LENGTH} karakter` };
  }

  let mediaType: CampaignMediaType | null = null;
  let mediaUrl: string | null = null;
  let filename: string | null = null;
  if (input.mediaType !== undefined || input.mediaUrl !== undefined) {
    if (!CAMPAIGN_MEDIA_TYPES.includes(input.mediaType as CampaignMediaType)) {
      return { ok: false, status: 400, error: '"mediaType" harus image|video|audio|document' };
    }
    mediaType = input.mediaType as CampaignMediaType;
    mediaUrl = (input.mediaUrl ?? "").trim();
    if (!/^https?:\/\//i.test(mediaUrl)) {
      return { ok: false, status: 400, error: '"mediaUrl" wajib URL http(s) yang dapat diakses publik' };
    }
    filename = input.filename?.trim().slice(0, 200) || null;
  }

  const minDelaySec = clampDelay(input.minDelaySec, 5);
  const maxDelaySec = clampDelay(input.maxDelaySec, 15);
  if (maxDelaySec < minDelaySec) {
    return { ok: false, status: 400, error: '"maxDelaySec" harus ≥ "minDelaySec"' };
  }
  let scheduledAt: Date | null = null;
  if (input.scheduledAt) {
    scheduledAt = new Date(input.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      return { ok: false, status: 400, error: '"scheduledAt" harus ISO timestamp valid' };
    }
  }

  // Device opsional saat draft; divalidasi ulang saat start (harus ready).
  let deviceId: string | null = null;
  if (input.deviceId?.trim()) {
    const device = await queryOne<{ id: string }>(
      'SELECT id FROM "Device" WHERE id = $2 AND "tenantId" = $1',
      [ctx.tenantId, input.deviceId.trim()],
    );
    if (!device) return { ok: false, status: 404, error: "Device tidak ditemukan untuk tenant ini" };
    deviceId = device.id;
  }

  const id = uuidv7();
  await query(
    `INSERT INTO "Campaign" (id, "tenantId", "deviceId", name, status, "messageBody",
       "mediaType", "mediaUrl", "filename", "audienceTag", "minDelaySec", "maxDelaySec", "scheduledAt")
     VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $8, $9, $10, $11, $12)`,
    [id, ctx.tenantId, deviceId, name, body, mediaType, mediaUrl, filename,
     input.audienceTag?.trim() || null, minDelaySec, maxDelaySec, scheduledAt],
  );

  logEvent("info", "campaign_created", ctx.requestId, {
    tenantId: ctx.tenantId,
    campaignId: id,
    scheduled: scheduledAt !== null,
  });
  return {
    ok: true,
    status: 201,
    body: { ok: true, campaignId: id, status: "draft", variables: extractTemplateVars(body) },
  };
}

function clampDelay(value: unknown, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.min(MAX_DELAY_SEC, Math.max(MIN_DELAY_SEC, Math.round(value)));
}

interface CampaignRow {
  id: string;
  tenantId: string;
  deviceId: string | null;
  deviceLabel: string | null;
  name: string;
  status: CampaignStatus;
  totalRecipients: number;
}

async function loadCampaign(id: string, tenantId: string): Promise<CampaignRow | undefined> {
  return queryOne<CampaignRow>(
    'SELECT id, "tenantId", "deviceId", "deviceLabel", name, status, "totalRecipients" FROM "Campaign" WHERE id = $1 AND "tenantId" = $2',
    [id, tenantId],
  );
}

async function setCampaignStatus(id: string, patch: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(patch);
  const sets = keys.map((k, i) => `"${k}" = $${i + 2}`);
  await query(`UPDATE "Campaign" SET ${sets.join(", ")}, "updatedAt" = now() WHERE id = $1`, [id, ...keys.map((k) => patch[k])]);
}

/**
 * Resolve audiens → baris CampaignRecipient (snapshot). Hanya sekali:
 * campaign dengan recipients terisi tidak di-resolve ulang (start ulang
 * setelah pause melanjutkan antrean yang ada).
 */
async function resolveAudience(campaign: CampaignRow, audienceTag: string | null): Promise<number> {
  const existing = await queryOne<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM "CampaignRecipient" WHERE "campaignId" = $1',
    [campaign.id],
  );
  if ((existing?.count ?? 0) > 0) return existing!.count;

  const args: unknown[] = [campaign.tenantId];
  let whereSql = 'WHERE "tenantId" = $1 AND "optedOut" = false';
  if (audienceTag) {
    args.push(`%"${audienceTag.replace(/["\\]/g, "")}"%`);
    whereSql += ` AND tags ILIKE $${args.length}`;
  }
  const contacts = await query<{ id: string; chatId: string; name: string | null }>(
    `SELECT id, "chatId", "name" FROM "Contact" ${whereSql} ORDER BY "createdAt" ASC`,
    args,
  );

  const CHUNK = 500;
  for (let i = 0; i < contacts.length; i += CHUNK) {
    const chunk = contacts.slice(i, i + CHUNK);
    const values: unknown[] = [];
    const tuples = chunk.map((c) => {
      const base = values.length;
      values.push(uuidv7(), campaign.id, c.id, c.chatId, c.name);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, 'pending', now())`;
    });
    await query(
      `INSERT INTO "CampaignRecipient" (id, "campaignId", "contactId", "chatId", "name", status, "createdAt")
       VALUES ${tuples.join(", ")}`,
      values,
    );
  }
  await query('UPDATE "Campaign" SET "totalRecipients" = $2, "updatedAt" = now() WHERE id = $1', [campaign.id, contacts.length]);
  return contacts.length;
}

/** Mulai campaign: draft/paused → running (atau scheduled bila jadwal masa depan). */
export async function startCampaign(id: string, ctx: CampaignContext): Promise<CampaignResult> {
  if (!(await tenantHasCampaignAddon(ctx.tenantId))) return gateResult();
  const rl = await checkRateLimit(`v1-campaigns:key:${ctx.keyId}`, 30, 60_000);
  if (!rl.allowed) {
    return { ok: false, status: 429, error: "Terlalu banyak permintaan. Coba lagi nanti." };
  }

  const campaign = await loadCampaign(id, ctx.tenantId);
  if (!campaign) return { ok: false, status: 404, error: "Campaign tidak ditemukan" };
  if (campaign.status !== "draft" && campaign.status !== "paused") {
    return { ok: false, status: 409, error: `Campaign status "${campaign.status}" tidak dapat dimulai` };
  }

  const row = await queryOne<{
    scheduledAt: string | null;
    audienceTag: string | null;
    minDelaySec: number;
    maxDelaySec: number;
    messageBody: string;
    mediaType: string | null;
    mediaUrl: string | null;
    filename: string | null;
  }>(
    'SELECT "scheduledAt", "audienceTag", "minDelaySec", "maxDelaySec", "messageBody", "mediaType", "mediaUrl", "filename" FROM "Campaign" WHERE id = $1',
    [id],
  );

  // Device wajib ready saat mulai (draft boleh tanpa device → pilih otomatis).
  const device = campaign.deviceId
    ? await queryOne<{ id: string; label: string; openwaSessionId: string }>(
        'SELECT id, label, "openwaSessionId" FROM "Device" WHERE id = $2 AND "tenantId" = $1 AND status = \'ready\'',
        [ctx.tenantId, campaign.deviceId],
      )
    : await queryOne<{ id: string; label: string; openwaSessionId: string }>(
        'SELECT id, label, "openwaSessionId" FROM "Device" WHERE "tenantId" = $1 AND status = \'ready\' ORDER BY "updatedAt" DESC LIMIT 1',
        [ctx.tenantId],
      );
  if (!device) {
    return { ok: false, status: 409, error: "Belum ada device yang tersambung (status ready)" };
  }

  // Kuota per penerima — blokir sebelum resolve audiens besar-besaran.
  const cfg = await getTenantConfig(ctx.tenantId);
  const maxMsg = cfg.plan.maxMessagesPerMonth;
  const audienceCount = await resolveAudience(campaign, row?.audienceTag ?? null);
  if (audienceCount === 0) {
    return { ok: false, status: 409, error: "Audiens kosong — belum ada kontak (non opt-out) yang cocok" };
  }
  if (maxMsg !== null && cfg.messageCount >= maxMsg && campaign.status === "draft") {
    // Start pertama saja diblokir penuh; resume setelah pause biarkan worker
    // yang menilai (penerima tersisa biasanya sedikit).
    return {
      ok: false,
      status: 429,
      error: `Kuota pesan bulan ini tercapai (${cfg.messageCount}/${maxMsg}). Upgrade plan untuk memulai campaign.`,
    };
  }

  const scheduledAt = row?.scheduledAt ? new Date(row.scheduledAt) : null;
  const isScheduled = scheduledAt !== null && scheduledAt.getTime() > Date.now();
  await setCampaignStatus(id, {
    status: isScheduled ? "scheduled" : "running",
    deviceId: device.id,
    deviceLabel: device.label,
    ...(isScheduled ? {} : { startedAt: new Date().toISOString() }),
  });

  logEvent("info", "campaign_started", ctx.requestId, {
    tenantId: ctx.tenantId,
    campaignId: id,
    audience: audienceCount,
    mode: isScheduled ? "scheduled" : "immediate",
  });
  return {
    ok: true,
    status: 200,
    body: {
      ok: true,
      campaignId: id,
      status: isScheduled ? "scheduled" : "running",
      totalRecipients: audienceCount,
      scheduledAt: scheduledAt?.toISOString() ?? null,
    },
  };
}

export async function pauseCampaign(id: string, ctx: CampaignContext): Promise<CampaignResult> {
  if (!(await tenantHasCampaignAddon(ctx.tenantId))) return gateResult();
  const campaign = await loadCampaign(id, ctx.tenantId);
  if (!campaign) return { ok: false, status: 404, error: "Campaign tidak ditemukan" };
  if (campaign.status !== "running" && campaign.status !== "scheduled") {
    return { ok: false, status: 409, error: `Campaign status "${campaign.status}" tidak dapat dijeda` };
  }
  await setCampaignStatus(id, { status: "paused" });
  logEvent("info", "campaign_paused", ctx.requestId, { tenantId: ctx.tenantId, campaignId: id });
  return { ok: true, status: 200, body: { ok: true, campaignId: id, status: "paused" } };
}

export async function resumeCampaign(id: string, ctx: CampaignContext): Promise<CampaignResult> {
  return startCampaign(id, ctx);
}

export async function cancelCampaign(id: string, ctx: CampaignContext): Promise<CampaignResult> {
  if (!(await tenantHasCampaignAddon(ctx.tenantId))) return gateResult();
  const campaign = await loadCampaign(id, ctx.tenantId);
  if (!campaign) return { ok: false, status: 404, error: "Campaign tidak ditemukan" };
  if (["completed", "failed", "cancelled"].includes(campaign.status)) {
    return { ok: false, status: 409, error: `Campaign sudah berakhir (${campaign.status})` };
  }
  // Penerima belum terkirim → skipped agar statistik jujur.
  await query(
    `UPDATE "CampaignRecipient" SET status = 'skipped', error = 'campaign dibatalkan'
     WHERE "campaignId" = $1 AND status = 'pending'`,
    [id],
  );
  await query(
    `UPDATE "Campaign" SET status = 'cancelled', "completedAt" = now(),
       "skippedCount" = (SELECT COUNT(*) FROM "CampaignRecipient" WHERE "campaignId" = $1 AND status = 'skipped'),
       "sentCount" = (SELECT COUNT(*) FROM "CampaignRecipient" WHERE "campaignId" = $1 AND status = 'sent'),
       "failedCount" = (SELECT COUNT(*) FROM "CampaignRecipient" WHERE "campaignId" = $1 AND status = 'failed'),
       "updatedAt" = now()
     WHERE id = $1`,
    [id],
  );
  logEvent("info", "campaign_cancelled", ctx.requestId, { tenantId: ctx.tenantId, campaignId: id });
  return { ok: true, status: 200, body: { ok: true, campaignId: id, status: "cancelled" } };
}

// ── Baca ────────────────────────────────────────────────────────────────────

export interface CampaignSummaryRow {
  id: string;
  name: string;
  status: CampaignStatus;
  deviceLabel: string | null;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  scheduledAt: string | null;
  createdAt: string;
}

export async function listCampaigns(tenantId: string, limit = 20): Promise<CampaignSummaryRow[]> {
  return query<CampaignSummaryRow>(
    `SELECT id, name, status, "deviceLabel", "totalRecipients", "sentCount", "failedCount",
            "skippedCount", "scheduledAt", "createdAt"
     FROM "Campaign" WHERE "tenantId" = $1 ORDER BY "createdAt" DESC LIMIT $2`,
    [tenantId, Math.min(50, Math.max(1, limit))],
  );
}

export interface RecipientRow {
  id: string;
  chatId: string;
  name: string | null;
  status: string;
  error: string | null;
  messageId: string | null;
  sentAt: string | null;
}

export interface CampaignDetail extends CampaignSummaryRow {
  messageBody: string;
  mediaType: string | null;
  mediaUrl: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failReason: string | null;
  recipients: RecipientRow[];
}

export async function getCampaignDetail(id: string, tenantId: string): Promise<CampaignDetail | null> {
  const campaign = await queryOne<Omit<CampaignDetail, "recipients">>(
    `SELECT id, name, status, "deviceLabel", "totalRecipients", "sentCount", "failedCount",
            "skippedCount", "scheduledAt", "createdAt", "messageBody", "mediaType", "mediaUrl",
            "startedAt", "completedAt", "failReason"
     FROM "Campaign" WHERE id = $1 AND "tenantId" = $2`,
    [id, tenantId],
  );
  if (!campaign) return null;
  const recipients = await query<RecipientRow>(
    `SELECT id, "chatId", "name", status, error, "messageId", "sentAt"
     FROM "CampaignRecipient" WHERE "campaignId" = $1 ORDER BY "createdAt" ASC LIMIT 1000`,
    [id],
  );
  return { ...campaign, recipients };
}
