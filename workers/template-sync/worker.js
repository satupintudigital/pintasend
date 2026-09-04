// Wavio template reconciliation worker (HTTP on-demand; tanpa cron agar Neon scale-to-zero).
// Canonical template sudah diterima oleh API internal dan difan-out menjadi satu
// job per device. Worker ini hanya memakai operasi OpenWA list/create: versi
// fisik immutable dibuat sekali, diverifikasi, lalu binding aktif dipindahkan.
import { Client } from "@neondatabase/serverless";

const BATCH_LIMIT = 20;
const MAX_ATTEMPTS = 8;
const LEASE_MS = 10 * 60 * 1000;
const RETRY_MS = 30_000;
const MAX_RETRY_MS = 60 * 60 * 1000;
const OPENWA_TIMEOUT_MS = 15_000;
const WATERMARK_TOKEN = "{{watermark}}";

function physicalName(event, version) {
  const safe = String(event).trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "event";
  const v = Number.isInteger(Number(version)) && Number(version) > 0 ? Number(version) : 1;
  return `nala_${safe}_v${v}`;
}

function watermarkFooter(footer) {
  const base = String(footer ?? "").split(WATERMARK_TOKEN).join("").trimEnd();
  return `${base}${WATERMARK_TOKEN}`;
}

function normalize(value) {
  return value == null ? null : String(value).replace(/\r\n?/g, "\n").trim();
}

function sameContent(actual, expected) {
  return normalize(actual.name) === normalize(expected.name)
    && normalize(actual.header) === normalize(expected.header)
    && normalize(actual.body) === normalize(expected.body)
    && normalize(actual.footer) === normalize(expected.footer);
}

function retryDelay(attempt) {
  return Math.min(MAX_RETRY_MS, RETRY_MS * 2 ** Math.max(0, attempt - 1));
}

async function openwaRequest(env, sessionId, path, init = {}) {
  const base = String(env.OPENWA_BASE_URL ?? "").replace(/\/+$/, "");
  if (!base || !env.OPENWA_ADMIN_KEY) throw new Error("Konfigurasi OpenWA worker belum lengkap");
  const response = await fetch(`${base}/api/sessions/${encodeURIComponent(sessionId)}${path}`, {
    ...init,
    headers: { "X-API-Key": String(env.OPENWA_ADMIN_KEY), "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(OPENWA_TIMEOUT_MS),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`OpenWA HTTP ${response.status}`);
  return data;
}

async function reconcileJob(env, client, row) {
  const expected = {
    name: row.physicalTemplateName || physicalName(row.event, row.canonicalVersion),
    header: row.header,
    body: row.body,
    footer: watermarkFooter(row.footer),
  };
  const listed = await openwaRequest(env, row.openwaSessionId, "/templates");
  const templates = Array.isArray(listed) ? listed : Array.isArray(listed?.templates) ? listed.templates : [];
  const existing = templates.find((template) => template.name === expected.name);

  let physicalId = existing?.id ?? null;
  if (existing) {
    if (!sameContent(existing, expected)) throw new Error("Template physical immutable sudah ada dengan isi berbeda");
  } else {
    const created = await openwaRequest(env, row.openwaSessionId, "/templates", {
      method: "POST",
      body: JSON.stringify({
        name: expected.name,
        body: expected.body,
        ...(expected.header ? { header: expected.header } : {}),
        ...(expected.footer ? { footer: expected.footer } : {}),
      }),
    });
    physicalId = created?.id ?? created?.template?.id ?? null;
    if (!physicalId) {
      const afterCreate = await openwaRequest(env, row.openwaSessionId, "/templates");
      const verified = (Array.isArray(afterCreate) ? afterCreate : afterCreate?.templates ?? []).find((template) => template.name === expected.name);
      if (!verified || !sameContent(verified, expected)) throw new Error("Template OpenWA gagal diverifikasi setelah dibuat");
      physicalId = verified.id ?? null;
    }
  }

  await client.query("BEGIN");
  try {
    await client.query(
      `UPDATE "TenantWhatsAppTemplateDevice"
       SET "physicalTemplateId" = $2, status = 'synced', attempts = attempts + 1,
           "lastError" = NULL, "syncedAt" = now(), "updatedAt" = now()
       WHERE id = $1 AND "canonicalVersion" = $3 AND checksum = $4`,
      [row.bindingId, physicalId, row.canonicalVersion, row.checksum],
    );
    await client.query(
      `UPDATE "TenantWhatsAppTemplateSyncJob"
       SET status = 'synced', attempts = attempts + 1, "lastError" = NULL,
           "lockedAt" = NULL, "syncedAt" = now(), "updatedAt" = now()
       WHERE id = $1`,
      [row.jobId],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function failJob(client, row, error) {
  const attempts = Number(row.attempts ?? 0) + 1;
  const terminal = attempts >= MAX_ATTEMPTS;
  const next = new Date(Date.now() + (terminal ? 365 * 24 * 60 * 60 * 1000 : retryDelay(attempts))).toISOString();
  await client.query(
    `UPDATE "TenantWhatsAppTemplateSyncJob"
     SET status = 'failed', attempts = $2, "lastError" = $3, "lockedAt" = NULL,
         "nextAttemptAt" = $4, "updatedAt" = now() WHERE id = $1`,
    [row.jobId, attempts, String(error?.message ?? error).slice(0, 500), next],
  );
  await client.query(
    `UPDATE "TenantWhatsAppTemplateDevice" SET status = 'failed', attempts = $2,
       "lastError" = $3, "nextAttemptAt" = $4, "updatedAt" = now()
     WHERE id = $1 AND "canonicalVersion" = $5 AND checksum = $6`,
    [row.bindingId, attempts, String(error?.message ?? error).slice(0, 500), next, row.canonicalVersion, row.checksum],
  );
}

export async function runTemplateSync(env) {
  const result = { ok: true, claimed: 0, synced: 0, failed: 0, errors: [] };
  const connectionString = String(env.DATABASE_URL ?? "").trim();
  if (!connectionString) return { ...result, ok: false, errors: ["DATABASE_URL secret tidak tersedia"] };

  const client = new Client(connectionString);
  await client.connect();
  try {
    // Recover jobs abandoned by a crashed invocation. The binding is not
    // touched here because a newer publish may already have replaced it.
    await client.query(
      `UPDATE "TenantWhatsAppTemplateSyncJob"
       SET status = 'failed', "lockedAt" = NULL, "nextAttemptAt" = now(),
           "lastError" = 'Lease expired; dijadwalkan ulang', "updatedAt" = now()
       WHERE status = 'processing'
         AND "lockedAt" IS NOT NULL
         AND "lockedAt" < now() - ($1 * interval '1 millisecond')`,
      [LEASE_MS],
    );

    const { rows } = await client.query(
      `SELECT j.id AS "jobId", j.attempts, j."canonicalVersion", j.checksum,
              b.id AS "bindingId", b.physicalTemplateName, b.status AS "bindingStatus",
              t.event, t.header, t.body, t.footer, d."openwaSessionId"
       FROM "TenantWhatsAppTemplateSyncJob" j
       JOIN "TenantWhatsAppTemplateDevice" b ON b."deviceId" = j."deviceId" AND b."templateId" = j."templateId"
       JOIN "TenantWhatsAppTemplate" t ON t.id = j."templateId"
       JOIN "Device" d ON d.id = j."deviceId"
       WHERE j.status IN ('pending', 'failed')
         AND j."nextAttemptAt" <= now()
       ORDER BY j."nextAttemptAt" ASC
       LIMIT $1`,
      [BATCH_LIMIT],
    );

    for (const row of rows) {
      const claimed = await client.query(
        `UPDATE "TenantWhatsAppTemplateSyncJob" SET status = 'processing', "lockedAt" = now(), "updatedAt" = now()
         WHERE id = $1 AND status IN ('pending','failed') AND "nextAttemptAt" <= now()
         RETURNING id`,
        [row.jobId],
      );
      if (claimed.rowCount !== 1) continue;
      result.claimed++;
      try {
        await reconcileJob(env, client, row);
        result.synced++;
      } catch (error) {
        await failJob(client, row, error);
        result.failed++;
        result.errors.push(`${row.jobId}: ${String(error?.message ?? error).slice(0, 200)}`);
      }
    }
  } catch (error) {
    result.ok = false;
    result.errors.push(String(error?.message ?? error));
  } finally {
    await client.end();
  }
  return result;
}

const worker = {
  // Neon worker sengaja on-demand agar database dapat scale-to-zero.
  async fetch(request, env) {
    if (request.method !== "POST") return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
    const token = new URL(request.url).searchParams.get("token") ?? "";
    if (!env.TEMPLATE_SYNC_TOKEN || token !== env.TEMPLATE_SYNC_TOKEN) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    try { return Response.json(await runTemplateSync(env)); }
    catch { return Response.json({ ok: false, error: "Template sync worker gagal" }, { status: 500 }); }
  },
};

export default worker;
