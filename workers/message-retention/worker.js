// Message retention worker (pola workers/webhook-delivery: standalone, deploy terpisah).
//
// Tujuan: mengeksekusi kebijakan retensi pesan Wavio — menghapus otomatis
// MessageLog & WebhookDelivery yang lebih tua dari batas retensi per tenant.
// Ini menutup gap R-07 (klaim "retensi 30 hari" tanpa purge otomatis terverifikasi)
// dan mewujudkan klausul DPA §5.7: "retensi maksimal 30 hari, KECUALI Tenant
// meminta penyimpanan lebih lama" (via RetentionRequest approved → Tenant.messageRetentionDays).
//
// Alur per tick:
//   1. Baca SEMUA tenant + "messageRetentionDays" (nilai efektif; default 30).
//   2. Untuk tiap tenant, hapus batch MessageLog dengan "createdAt" < now() - retention.
//   3. Hapus batch WebhookDelivery status 'delivered'/'failed' yang lebih tua dari
//      retention. Baris 'pending' TIDAK dihapus (masih dalam proses retry delivery).
//   4. Per-baris/per-batch try/catch — satu tenant error tidak menghentikan lainnya.
//
// Trigger:
//   - HTTP POST manual: ?token=<RETENTION_TOKEN> (on-demand / testing).
//   - Tidak ada cron supaya Neon dapat scale-to-zero.
//
// Secret: DATABASE_URL (Neon), RETENTION_TOKEN (proteksi trigger manual).
//
// Catatan minimalisasi: baris yang masih dibutuhkan operasional (pending delivery)
// dikecualikan; log keamanan (akses/rate-limit) TIDAK disentuh worker ini — diatur
// terpisah (lihat Justifikasi-Retensi-Log-Keamanan.md).
import { Client } from "@neondatabase/serverless";

const DEFAULT_RETENTION_DAYS = 30;
const BATCH_LIMIT = 500; // batas per DELETE agar tidak mengunci tabel terlalu lama

const worker = {
  // Retention sengaja on-demand agar Neon dapat scale-to-zero.
  async fetch(request, env) {
    try {
      if (request.method !== "POST") {
        return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
      }
      const url = new URL(request.url);
      const token = url.searchParams.get("token") ?? "";
      if (!env.RETENTION_TOKEN || token !== env.RETENTION_TOKEN) {
        return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
      const result = await runRetention(env);
      return Response.json(result);
    } catch (e) {
      console.error("message-retention: unexpected", e);
      return Response.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
    }
  },
};

export default worker;

async function runRetention(env) {
  const started = Date.now();
  const stats = {
    ok: true,
    durationMs: 0,
    finishedAt: null,
    tenants: 0,
    messageLogDeleted: 0,
    webhookDeliveryDeleted: 0,
    errors: [],
  };

  const connectionString = String(env.DATABASE_URL ?? "").trim();
  if (!connectionString) {
    stats.ok = false;
    stats.errors.push("DATABASE_URL secret tidak tersedia");
    return stats;
  }

  const client = new Client(connectionString);
  await client.connect();
  try {
    const { rows } = await client.query(
      'SELECT id, "messageRetentionDays" FROM "Tenant" ORDER BY id',
    );
    stats.tenants = rows.length;

    for (const tenant of rows) {
      const retentionDays =
        Number(tenant.messageRetentionDays) > 0
          ? Number(tenant.messageRetentionDays)
          : DEFAULT_RETENTION_DAYS;

      try {
        const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
        stats.messageLogDeleted += await deleteBatch(
          client,
          `DELETE FROM "MessageLog" WHERE id IN (
             SELECT id FROM "MessageLog"
             WHERE "tenantId" = $1 AND "createdAt" < $2
             ORDER BY "createdAt" ASC LIMIT ${BATCH_LIMIT}
           )`,
          [tenant.id, cutoff],
        );
        stats.webhookDeliveryDeleted += await deleteBatch(
          client,
          `DELETE FROM "WebhookDelivery" WHERE id IN (
             SELECT id FROM "WebhookDelivery"
             WHERE "tenantId" = $1 AND status IN ('delivered','failed') AND "createdAt" < $2
             ORDER BY "createdAt" ASC LIMIT ${BATCH_LIMIT}
           )`,
          [tenant.id, cutoff],
        );
      } catch (e) {
        stats.ok = false;
        stats.errors.push(`tenant ${tenant.id}: ${e?.message ?? String(e)}`);
      }
    }
  } finally {
    await client.end();
  }

  stats.durationMs = Date.now() - started;
  stats.finishedAt = new Date().toISOString();
  return stats;
}

// Ulangi DELETE batch sampai tidak ada baris lagi yang terpengaruh (0 rows).
async function deleteBatch(client, sql, args) {
  let deleted = 0;
  for (let i = 0; i < 1000; i++) {
    const result = await client.query(sql, args);
    const count = Number(result.rowCount ?? 0);
    if (count === 0) break;
    deleted += count;
  }
  return deleted;
}
