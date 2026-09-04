import { auth } from "@/lib/auth";
import {
  deleteWebhookForTenant,
  generateWebhookSecret,
  getWebhookForTenant,
  upsertWebhook,
  WEBHOOK_EVENT_LIST,
} from "@/lib/webhookStore";
import { collectFilterErrors, type WebhookFilters } from "@/lib/webhookFilters";
import { isSafeWebhookUrl } from "@/lib/ssrf";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";
import { cancelPendingDeliveriesForTenant } from "@/lib/webhookDelivery";
import { recordAuditFromSession } from "@/lib/audit";
import {
  canManageTenantMembers,
  parsePrincipal,
  unauthorized,
  forbidden,
  type SessionLike,
} from "@/lib/abac";

function requireMemberManager(session: SessionLike | null): Response | null {
  const p = parsePrincipal(session);
  if (!p) return unauthorized();
  if (!canManageTenantMembers(p, p.tenantId)) {
    return forbidden("Forbidden — hanya owner atau tenant_admin");
  }
  return null;
}

// Konfigurasi webhook tenant — owner-only (API juga menegakkan 403).
// - GET    → konfigurasi saat ini (secret di-mask, baca D1 = 0 Neon)
// - PUT    → simpan/update (url, events, secret opsional → pertahankan/baru)
// - DELETE → hapus konfigurasi (event berhenti diteruskan)

function maskSecret(secret: string): string {
  if (secret.length <= 8) return "•".repeat(secret.length);
  return `${secret.slice(0, 4)}…${secret.slice(-4)}`;
}

export async function GET() {
  const session = await auth();
  const denied = requireMemberManager(session);
  if (denied) return denied;
  const tenantId = parsePrincipal(session)?.tenantId ?? "";

  try {
    const wh = await getWebhookForTenant(tenantId);
    if (!wh) return Response.json({ webhook: null });
    return Response.json({
      webhook: {
        id: wh.id,
        tenantId: wh.tenantId,
        url: wh.url,
        events: wh.events,
        filters: wh.filters,
        active: wh.active,
        secretMasked: maskSecret(wh.secret),
        hasSecret: wh.secret.length > 0,
        createdAt: wh.createdAt,
        updatedAt: wh.updatedAt,
      },
    });
  } catch (e) {
    console.error("admin/webhooks GET:", e);
    return Response.json({ error: "Gagal memuat konfigurasi webhook" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const session = await auth();
  const denied = requireMemberManager(session);
  if (denied) return denied;
  const tenantId = parsePrincipal(session)?.tenantId ?? "";

  const rl = await checkRateLimit(`webhook-put:${tenantId}:${clientIp(req)}`, 10, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec);

  const body = (await req.json().catch(() => null)) as {
    url?: unknown;
    events?: unknown;
    filters?: unknown;
    secret?: unknown;
    active?: unknown;
  } | null;
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url) return Response.json({ error: "URL wajib diisi" }, { status: 400 });
  if (url.length > 500) {
    return Response.json({ error: "URL maksimal 500 karakter" }, { status: 400 });
  }
  // Guard SSRF best-effort: tolak IP private/internal + kredensial di URL.
  if (!isSafeWebhookUrl(url)) {
    return Response.json(
      { error: "URL tidak diizinkan (alamat internal/pribadi atau format tidak valid)" },
      { status: 400 },
    );
  }

  // Validasi event: hanya yang dikenal & didukung OpenWA.
  let events = WEBHOOK_EVENT_LIST;
  if (Array.isArray(body?.events)) {
    const arr = body.events.filter((e): e is string => typeof e === "string");
    if (arr.length === 0) {
      return Response.json({ error: "Pilih minimal satu event" }, { status: 400 });
    }
    const unknown = arr.filter((e) => !WEBHOOK_EVENT_LIST.includes(e));
    if (unknown.length > 0) {
      return Response.json(
        { error: `Event tidak dikenal: ${unknown.join(", ")}` },
        { status: 400 },
      );
    }
    events = [...new Set(arr)];
  }

  // Validasi smart filters (opsional). Empty/null = semua event lolos.
  let filters: WebhookFilters | null = null;
  if (body?.filters !== undefined && body.filters !== null) {
    const errors = collectFilterErrors(body.filters);
    if (errors.length > 0) {
      return Response.json({ error: errors[0] }, { status: 400 });
    }
    const conditions = (body.filters as { conditions?: unknown[] }).conditions ?? [];
    filters = conditions.length > 0 ? (body.filters as WebhookFilters) : null;
  }

  const active = typeof body?.active === "boolean" ? body.active : true;
  const existing = await getWebhookForTenant(tenantId).catch(() => null);
  // Kontrak secret (PENTING — lihat WebhookPanel):
  //   - non-empty string          → pakai nilai itu
  //   - "__REGENERATE__"          → buat secret acak baru (eksplisit)
  //   - "" / tidak dikirim        → PERTAHANKAN secret lama (generate hanya
  //                                 saat belum ada konfigurasi sama sekali)
  // Jangan pernah memperlakukan "" sebagai regenerasi — panel mengirim ""
  // setiap save biasa dan itu akan memutus verifikasi client.
  const REGENERATE = "__REGENERATE__";
  let secret: string;
  if (typeof body?.secret === "string" && body.secret.trim() && body.secret !== REGENERATE) {
    secret = body.secret.trim();
  } else if (body?.secret === REGENERATE) {
    secret = generateWebhookSecret();
  } else {
    secret = existing?.secret ?? generateWebhookSecret();
  }

  try {
    const { id } = await upsertWebhook({ tenantId, url, secret, events, filters, active });
    await recordAuditFromSession(session, {
      tenantId,
      action: "webhook.upsert",
      targetType: "webhook",
      targetId: id,
      meta: { url, events: events.length, active },
    });
    return Response.json({ ok: true, id });
  } catch (e) {
    console.error("admin/webhooks PUT:", e);
    return Response.json({ error: "Gagal menyimpan konfigurasi webhook" }, { status: 500 });
  }
}

export async function DELETE() {
  const session = await auth();
  const denied = requireMemberManager(session);
  if (denied) return denied;
  const tenantId = parsePrincipal(session)?.tenantId ?? "";

  try {
    const removed = await deleteWebhookForTenant(tenantId);
    // Batalkan delivery yang masih pending (outbox) — jangan kirim event ke
    // URL yang sudah dihapus tenant.
    if (removed) {
      await cancelPendingDeliveriesForTenant(tenantId).catch((e) =>
        console.error("admin/webhooks DELETE: cancel pending outbox gagal:", e),
      );
    }
    if (removed) {
      await recordAuditFromSession(session, {
        tenantId,
        action: "webhook.delete",
        targetType: "webhook",
        targetId: tenantId,
      });
    }
    return Response.json({ ok: removed });
  } catch (e) {
    console.error("admin/webhooks DELETE:", e);
    return Response.json({ error: "Gagal menghapus konfigurasi webhook" }, { status: 500 });
  }
}
