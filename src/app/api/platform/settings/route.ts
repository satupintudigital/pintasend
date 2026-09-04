import { auth } from "@/lib/auth";
import {
  encodeSettingValue,
  listPlatformSettings,
  setPlatformSetting,
  type PlatformSettingRow,
} from "@/lib/platformSettings";
import { invalidateWatermarkFootnoteCache } from "@/lib/watermark";
import { recordAuditFromSession } from "@/lib/audit";
import {
  isPlatformAdmin,
  parsePrincipal,
  unauthorized,
  forbidden,
  type SessionLike,
} from "@/lib/abac";

function requirePlatformAdmin(session: SessionLike | null): Response | null {
  const p = parsePrincipal(session);
  if (!p) return unauthorized();
  if (!isPlatformAdmin(p)) return forbidden("Forbidden — khusus platform admin");
  return null;
}

// Daftar seluruh platform setting — khusus platform_admin.
export async function GET() {
  const session = await auth();
  const denied = requirePlatformAdmin(session);
  if (denied) return denied;

  try {
    const rows = await listPlatformSettings();
    const settings: PlatformSettingRow[] = rows;
    return Response.json({ settings });
  } catch (e) {
    console.error("platform/settings GET:", e);
    return Response.json({ error: "Gagal memuat pengaturan platform" }, { status: 500 });
  }
}

// Upsert satu setting — khusus platform_admin. Whitelist key + validasi tipe
// dilakukan di encodeSettingValue (pure). Perubahan footnote watermark
// langsung meng-invalidate cache supaya pesan berikutnya memakai teks baru.
export async function PUT(req: Request) {
  const session = await auth();
  const denied = requirePlatformAdmin(session);
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as {
    key?: unknown;
    value?: unknown;
  } | null;
  const key = typeof body?.key === "string" ? body.key.trim() : "";

  const encoded = encodeSettingValue(key, body?.value);
  if (!encoded.ok) {
    return Response.json({ error: encoded.error }, { status: 400 });
  }

  try {
    const principal = parsePrincipal(session);
    await setPlatformSetting({
      key,
      value: encoded.value,
      updatedBy: principal?.email ?? principal?.id ?? null,
    });
    if (key === "watermark_footnote") invalidateWatermarkFootnoteCache();
    await recordAuditFromSession(session, {
      tenantId: null,
      action: "settings.update",
      targetType: "platform_setting",
      targetId: key,
      meta: { key },
    });
    return Response.json({ ok: true, key });
  } catch (e) {
    console.error("platform/settings PUT:", e);
    return Response.json({ error: "Gagal menyimpan pengaturan" }, { status: 500 });
  }
}
