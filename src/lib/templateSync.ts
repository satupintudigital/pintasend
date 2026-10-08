import { query, queryOne } from "./db";

export interface PhysicalTemplateContent {
  event?: string;
  name: string;
  header: string | null;
  body: string;
  footer: string | null;
}

export interface TemplateSyncBatch {
  tenantId: string;
  templateId: string;
  event?: string;
  version: number;
  checksum: string;
}

export interface IncomingTemplateSync {
  nalaniagaStoreId: string;
  event: string;
  version: number;
  checksum: string;
  template: {
    name: string;
    header?: string | null;
    body: string;
    footer?: string | null;
  };
}

type TemplateSyncDb = {
  device: {
    findMany(args: unknown): Promise<Array<{ id: string; tenantId: string }>>;
  };
  tenantWhatsAppTemplate?: {
    findMany(args: unknown): Promise<Array<{ id: string; event: string; version: number; checksum: string }>>;
  };
  tenantWhatsAppTemplateDevice: {
    upsert(args: unknown): Promise<unknown>;
  };
  tenantWhatsAppTemplateSyncJob: {
    upsert(args: unknown): Promise<unknown>;
  };
};

type TemplateIngestDb = TemplateSyncDb & {
  tenant: {
    findUnique(args: unknown): Promise<{ id: string; nalaniagaStoreId: string | null } | null>;
  };
  tenantWhatsAppTemplate: {
    findUnique(args: unknown): Promise<{ id: string; version: number; checksum: string } | null>;
    upsert(args: unknown): Promise<{ id: string; version: number; checksum: string }>;
  };
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nested(recordValue: Record<string, unknown>, key: string): Record<string, unknown> {
  return record(recordValue[key]);
}

export function createTemplateSyncDb(): TemplateIngestDb {
  return {
    tenant: {
      async findUnique(args) {
        const where = nested(record(args), "where");
        const nalaniagaStoreId = String(where.nalaniagaStoreId ?? "");
        if (!nalaniagaStoreId) return null;
        return (await queryOne<{ id: string; nalaniagaStoreId: string | null }>(
          'SELECT id, "nalaniagaStoreId" FROM "Tenant" WHERE "nalaniagaStoreId" = $1',
          [nalaniagaStoreId],
        )) ?? null;
      },
    },
    tenantWhatsAppTemplate: {
      async findMany(args) {
        const where = nested(record(args), "where");
        return query<{ id: string; event: string; version: number; checksum: string }>(
          'SELECT id, event, version, checksum FROM "TenantWhatsAppTemplate" WHERE "tenantId" = $1 AND "isActive" = true ORDER BY event ASC',
          [String(where.tenantId ?? "")],
        );
      },
      async findUnique(args) {
        const compound = nested(nested(record(args), "where"), "tenantId_event");
        return (await queryOne<{ id: string; version: number; checksum: string }>(
          'SELECT id, version, checksum FROM "TenantWhatsAppTemplate" WHERE "tenantId" = $1 AND event = $2',
          [String(compound.tenantId ?? ""), String(compound.event ?? "")],
        )) ?? null;
      },
      async upsert(args) {
        const input = record(args);
        const create = nested(input, "create");
        const update = nested(input, "update");
        const source = Object.keys(create).length ? create : update;
        const result = await queryOne<{ id: string; version: number; checksum: string }>(
          'INSERT INTO "TenantWhatsAppTemplate" (id, "tenantId", "nalaniagaStoreId", event, "canonicalName", header, body, footer, version, checksum, "isActive", "createdAt", "updatedAt")\n' +
            "VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, true, now(), now())\n" +
            'ON CONFLICT ("tenantId", event) DO UPDATE SET "nalaniagaStoreId" = EXCLUDED."nalaniagaStoreId", "canonicalName" = EXCLUDED."canonicalName", header = EXCLUDED.header, body = EXCLUDED.body, footer = EXCLUDED.footer, version = EXCLUDED.version, checksum = EXCLUDED.checksum, "isActive" = true, "updatedAt" = now()\n' +
            'RETURNING id, version, checksum',
          [source.tenantId, source.nalaniagaStoreId, source.event, source.canonicalName, source.header ?? null, source.body, source.footer ?? null, source.version, source.checksum],
        );
        if (!result) throw new Error("Template catalog tidak dapat disimpan");
        return result;
      },
    },
    device: {
      async findMany(args) {
        const where = nested(record(args), "where");
        return query<{ id: string; tenantId: string }>(
          'SELECT id, "tenantId" FROM "Device" WHERE "tenantId" = $1 ORDER BY "createdAt" ASC',
          [String(where.tenantId ?? "")],
        );
      },
    },
    tenantWhatsAppTemplateDevice: {
      async upsert(args) {
        const input = record(args);
        const create = nested(input, "create");
        const update = nested(input, "update");
        const source = Object.keys(create).length ? create : update;
        await query(
          'INSERT INTO "TenantWhatsAppTemplateDevice" (id, "tenantId", "deviceId", "templateId", "physicalTemplateName", "canonicalVersion", checksum, status, "attempts", "nextAttemptAt", "createdAt", "updatedAt")\n' +
            "VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 0, $8, now(), now())\n" +
            'ON CONFLICT ("deviceId", "templateId") DO UPDATE SET "physicalTemplateName" = EXCLUDED."physicalTemplateName", "canonicalVersion" = EXCLUDED."canonicalVersion", checksum = EXCLUDED.checksum, status = EXCLUDED.status, "lastError" = NULL, "nextAttemptAt" = EXCLUDED."nextAttemptAt", "syncedAt" = NULL, "updatedAt" = now()',
          [source.tenantId, source.deviceId, source.templateId, source.physicalTemplateName, source.canonicalVersion, source.checksum, source.status, source.nextAttemptAt],
        );
        return source;
      },
    },
    tenantWhatsAppTemplateSyncJob: {
      async upsert(args) {
        const input = record(args);
        const create = nested(input, "create");
        const update = nested(input, "update");
        const source = Object.keys(create).length ? create : update;
        await query(
          'INSERT INTO "TenantWhatsAppTemplateSyncJob" (id, "tenantId", "templateId", "deviceId", "canonicalVersion", checksum, status, "attempts", "nextAttemptAt", "createdAt", "updatedAt")\n' +
            "VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 0, $7, now(), now())\n" +
            'ON CONFLICT ("deviceId", "templateId", "canonicalVersion", checksum) DO UPDATE SET status = EXCLUDED.status, "lastError" = NULL, "nextAttemptAt" = EXCLUDED."nextAttemptAt", "updatedAt" = now()',
          [source.tenantId, source.templateId, source.deviceId, source.canonicalVersion, source.checksum, source.status, source.nextAttemptAt],
        );
        return source;
      },
    },
  };
}

const WATERMARK_TOKEN = "{{watermark}}";

export function buildPhysicalTemplateName(event: string, version: number): string {
  const safeEvent = event
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "") || "event";
  const safeVersion = Number.isInteger(version) && version > 0 ? version : 1;
  return `nala_${safeEvent}_v${safeVersion}`;
}

export function ensureWatermarkPlaceholder(footer: string | null | undefined): string {
  const withoutWatermark = (footer ?? "").split(WATERMARK_TOKEN).join("").trimEnd();
  return `${withoutWatermark}${WATERMARK_TOKEN}`;
}

export function shouldAcceptTemplateVersion(activeVersion: number, incomingVersion: number): boolean {
  return Number.isInteger(incomingVersion) && incomingVersion >= activeVersion;
}

export async function templateContentChecksum(content: PhysicalTemplateContent): Promise<string> {
  const normalized = JSON.stringify({
    ...(content.event ? { event: content.event.trim() } : {}),
    name: content.name.trim(),
    header: content.header?.replace(/\r\n?/g, "\n").trim() ?? null,
    body: content.body.replace(/\r\n?/g, "\n").trim(),
    footer: content.footer?.replace(/\r\n?/g, "\n").trim() ?? null,
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function canonicalTemplateChecksum(
  event: string,
  content: PhysicalTemplateContent,
): Promise<string> {
  return templateContentChecksum({ ...content, event });
}

export async function fanOutTemplateSyncJobs(
  db: TemplateSyncDb,
  batch: TemplateSyncBatch,
): Promise<{ devices: number; jobs: number }> {
  const devices = await db.device.findMany({
    where: { tenantId: batch.tenantId },
    select: { id: true, tenantId: true },
  });
  const event = batch.event?.trim() || "template";
  const physicalTemplateName = buildPhysicalTemplateName(event, batch.version);
  const nextAttemptAt = new Date();

  for (const device of devices) {
    await db.tenantWhatsAppTemplateDevice.upsert({
      where: { deviceId_templateId: { deviceId: device.id, templateId: batch.templateId } },
      create: {
        tenantId: batch.tenantId,
        deviceId: device.id,
        templateId: batch.templateId,
        physicalTemplateName,
        canonicalVersion: batch.version,
        checksum: batch.checksum,
        status: "pending",
        nextAttemptAt,
      },
      update: {
        physicalTemplateName,
        canonicalVersion: batch.version,
        checksum: batch.checksum,
        status: "pending",
        lastError: null,
        nextAttemptAt,
        syncedAt: null,
      },
    });
    await db.tenantWhatsAppTemplateSyncJob.upsert({
      where: {
        deviceId_templateId_canonicalVersion_checksum: {
          deviceId: device.id,
          templateId: batch.templateId,
          canonicalVersion: batch.version,
          checksum: batch.checksum,
        },
      },
      create: {
        tenantId: batch.tenantId,
        deviceId: device.id,
        templateId: batch.templateId,
        canonicalVersion: batch.version,
        checksum: batch.checksum,
        status: "pending",
        nextAttemptAt,
      },
      update: {
        status: "pending",
        lastError: null,
        nextAttemptAt,
      },
    });
  }

  return { devices: devices.length, jobs: devices.length };
}

/** Queue every active canonical template for one newly-created device. */
export async function enqueueActiveTemplateSyncForDevice(
  db: TemplateSyncDb,
  input: { tenantId: string; deviceId: string },
): Promise<{ templates: number; jobs: number }> {
  const templates = await db.tenantWhatsAppTemplate?.findMany?.({
    where: { tenantId: input.tenantId, isActive: true },
    orderBy: { event: "asc" },
  }) ?? [];
  let jobs = 0;
  for (const template of templates) {
    const result = await fanOutTemplateSyncJobs(
      { ...db, device: { findMany: async () => [{ id: input.deviceId, tenantId: input.tenantId }] } },
      {
        tenantId: input.tenantId,
        templateId: template.id,
        event: template.event,
        version: template.version,
        checksum: template.checksum,
      },
    );
    jobs += result.jobs;
  }
  return { templates: templates.length, jobs };
}

export type TemplateSyncIngestResult =
  | { ok: true; tenantId: string; devices: number; jobs: number; idempotent?: boolean }
  | { ok: false; status: 404 | 409; error: string };

export async function ingestTemplateSync(
  db: TemplateIngestDb,
  input: IncomingTemplateSync,
): Promise<TemplateSyncIngestResult> {
  const storeId = input.nalaniagaStoreId.trim();
  const event = input.event.trim();
  const templateName = input.template.name.trim();
  if (!storeId || !event || !templateName || !input.template.body.trim() || !Number.isInteger(input.version) || input.version < 1) {
    return { ok: false, status: 409, error: "Payload template sync tidak valid" };
  }

  const tenant = await db.tenant.findUnique({ where: { nalaniagaStoreId: storeId } });
  if (!tenant) return { ok: false, status: 404, error: "Tenant NalaNiaga tidak ditemukan" };

  const expectedChecksum = await templateContentChecksum({
    event,
    name: templateName,
    header: input.template.header ?? null,
    body: input.template.body,
    footer: input.template.footer ?? null,
  });
  if (input.checksum !== expectedChecksum) {
    return { ok: false, status: 409, error: "Checksum template tidak cocok" };
  }

  const existing = await db.tenantWhatsAppTemplate.findUnique({
    where: { tenantId_event: { tenantId: tenant.id, event } },
  });
  if (existing && input.version < existing.version) {
    return { ok: true, tenantId: tenant.id, devices: 0, jobs: 0, idempotent: true };
  }
  if (existing && input.version === existing.version) {
    if (existing.checksum !== input.checksum) {
      return { ok: false, status: 409, error: "Konflik versi template" };
    }
    return { ok: true, tenantId: tenant.id, devices: 0, jobs: 0, idempotent: true };
  }

  const template = await db.tenantWhatsAppTemplate.upsert({
    where: { tenantId_event: { tenantId: tenant.id, event } },
    create: {
      tenantId: tenant.id,
      nalaniagaStoreId: storeId,
      event,
      canonicalName: templateName,
      header: input.template.header ?? null,
      body: input.template.body.trim(),
      footer: input.template.footer ?? null,
      version: input.version,
      checksum: input.checksum,
      isActive: true,
    },
    update: {
      nalaniagaStoreId: storeId,
      canonicalName: templateName,
      header: input.template.header ?? null,
      body: input.template.body.trim(),
      footer: input.template.footer ?? null,
      version: input.version,
      checksum: input.checksum,
      isActive: true,
    },
  });

  const fanOut = await fanOutTemplateSyncJobs(db, {
    tenantId: tenant.id,
    templateId: template.id,
    event,
    version: input.version,
    checksum: input.checksum,
  });
  return { ok: true, tenantId: tenant.id, ...fanOut };
}
