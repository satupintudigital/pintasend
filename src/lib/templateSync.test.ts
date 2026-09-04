import { describe, expect, it } from "vitest";
import {
  buildPhysicalTemplateName,
  ensureWatermarkPlaceholder,
  shouldAcceptTemplateVersion,
  templateContentChecksum,
  fanOutTemplateSyncJobs,
  canonicalTemplateChecksum,
  ingestTemplateSync,
} from "./templateSync";

describe("physical WhatsApp template sync", () => {
  it("membuat nama physical immutable yang aman dari event dan version", () => {
    expect(buildPhysicalTemplateName("ORDER_SHIPPED", 12)).toBe("nala_order_shipped_v12");
    expect(buildPhysicalTemplateName("store blocked", 2)).toBe("nala_store_blocked_v2");
  });

  it("menambahkan placeholder watermark tepat satu kali", () => {
    expect(ensureWatermarkPlaceholder("Terima kasih.")).toBe("Terima kasih.{{watermark}}");
    expect(ensureWatermarkPlaceholder("Terima kasih.{{watermark}}")).toBe("Terima kasih.{{watermark}}");
    expect(ensureWatermarkPlaceholder("A{{watermark}} B {{watermark}}")).toBe("A B{{watermark}}");
  });

  it("menolak versi lebih rendah dan menerima versi baru atau retry yang sama", () => {
    expect(shouldAcceptTemplateVersion(4, 3)).toBe(false);
    expect(shouldAcceptTemplateVersion(4, 4)).toBe(true);
    expect(shouldAcceptTemplateVersion(4, 5)).toBe(true);
  });

  it("fan-out membuat binding dan job terpisah untuk semua device tenant", async () => {
    const bindings: unknown[] = [];
    const jobs: unknown[] = [];
    const db = {
      device: {
        findMany: async () => [
          { id: "dev-a", tenantId: "tenant-1" },
          { id: "dev-b", tenantId: "tenant-1" },
        ],
      },
      tenantWhatsAppTemplateDevice: {
        upsert: async (args: unknown) => {
          bindings.push(args);
          return args;
        },
      },
      tenantWhatsAppTemplateSyncJob: {
        upsert: async (args: unknown) => {
          jobs.push(args);
          return args;
        },
      },
    };

    const result = await fanOutTemplateSyncJobs(db, {
      tenantId: "tenant-1",
      templateId: "tpl-1",
      version: 4,
      checksum: "checksum-4",
    });

    expect(result).toEqual({ devices: 2, jobs: 2 });
    expect(bindings).toHaveLength(2);
    expect(jobs).toHaveLength(2);
    expect(JSON.stringify(jobs)).not.toContain("tenant-2");
  });

  it("ingest memetakan store NalaNiaga, upsert catalog, dan fan-out device", async () => {
    const catalog: Record<string, unknown> = {};
    const checksum = await canonicalTemplateChecksum("NEW_ORDER", { name: "pesanan_baru", header: "Pesanan", body: "Halo {{recipientName}}", footer: "Terima kasih" });
    const db = {
      tenant: {
        findUnique: async () => ({ id: "tenant-1", nalaniagaStoreId: "store-1" }),
      },
      tenantWhatsAppTemplate: {
        findMany: async () => [],
        findUnique: async () => null,
        upsert: async (args: unknown) => {
          catalog.value = args;
          return {
            id: "tpl-1",
            tenantId: "tenant-1",
            event: "NEW_ORDER",
            canonicalName: "pesanan_baru",
            version: 4,
            checksum: "checksum-4",
          };
        },
      },
      device: {
        findMany: async () => [{ id: "dev-a", tenantId: "tenant-1" }],
      },
      tenantWhatsAppTemplateDevice: { upsert: async () => ({}) },
      tenantWhatsAppTemplateSyncJob: { upsert: async () => ({}) },
    };

    const result = await ingestTemplateSync(db, {
      nalaniagaStoreId: "store-1",
      event: "NEW_ORDER",
      version: 4,
      checksum,
      template: {
        name: "pesanan_baru",
        header: "Pesanan",
        body: "Halo {{recipientName}}",
        footer: "Terima kasih",
      },
    });

    expect(result).toEqual({ ok: true, tenantId: "tenant-1", devices: 1, jobs: 1 });
    expect(JSON.stringify(catalog.value)).toContain("pesanan_baru");
  });

  it("checksum berubah hanya ketika physical content berubah", async () => {
    expect(await templateContentChecksum({ name: "x", header: null, body: "A", footer: "B" }))
      .toBe(await templateContentChecksum({ name: "x", header: null, body: "A", footer: "B" }));
    expect(await templateContentChecksum({ name: "x", header: null, body: "A", footer: "C" }))
      .not.toBe(await templateContentChecksum({ name: "x", header: null, body: "A", footer: "B" }));
  });
});
