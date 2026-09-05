import { auth } from "@/lib/auth";
import { createAddon, listAddons, parseAddonCreateBody } from "@/lib/platform";

// Daftar addon katalog (termasuk non-aktif) — khusus platform_admin.
export async function GET() {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "platform_admin") {
    return Response.json({ error: "Forbidden — khusus platform admin" }, { status: 403 });
  }

  try {
    const addons = await listAddons();
    return Response.json({ addons });
  } catch (e) {
    console.error("platform/addons:", e);
    return Response.json({ error: "Gagal memuat addon" }, { status: 500 });
  }
}

// Buat addon baru di katalog — khusus platform_admin.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "platform_admin") {
    return Response.json({ error: "Forbidden — khusus platform admin" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = parseAddonCreateBody(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  try {
    const created = await createAddon(parsed.addon);
    if (!created) {
      return Response.json(
        { error: `key addon '${parsed.addon.key}' sudah ada` },
        { status: 409 },
      );
    }
    return Response.json({ ok: true, addon: parsed.addon });
  } catch (e) {
    console.error("platform/addons POST:", e);
    return Response.json({ error: "Gagal membuat addon" }, { status: 500 });
  }
}
