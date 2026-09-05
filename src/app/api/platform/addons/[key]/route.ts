import { auth } from "@/lib/auth";
import { updateAddon, type AddonPatch } from "@/lib/platform";

// Edit addon katalog (nama/tagline/harga/aktif) — khusus platform_admin.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "platform_admin") {
    return Response.json({ error: "Forbidden — khusus platform admin" }, { status: 403 });
  }

  const { key } = await params;
  if (!/^[a-z0-9_]{2,64}$/.test(key)) {
    return Response.json({ error: "key addon tidak valid" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as {
    name?: unknown;
    tagline?: unknown;
    priceMonthly?: unknown;
    isActive?: unknown;
  } | null;

  const patch: AddonPatch = {};
  if (typeof body?.name === "string" && body.name.trim()) {
    patch.name = body.name.trim().slice(0, 80);
  }
  if (typeof body?.tagline === "string") patch.tagline = body.tagline.trim();
  if (body?.priceMonthly === null || body?.priceMonthly === undefined) {
    patch.priceMonthly = body?.priceMonthly === null ? null : undefined;
  } else if (
    typeof body?.priceMonthly === "number" &&
    Number.isFinite(body.priceMonthly) &&
    body.priceMonthly >= 0
  ) {
    patch.priceMonthly = Math.floor(body.priceMonthly);
  }
  if (typeof body?.isActive === "boolean") patch.isActive = body.isActive;

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "Tidak ada field valid untuk diubah" }, { status: 400 });
  }

  const ok = await updateAddon(key, patch);
  if (!ok) return Response.json({ error: "Addon tidak ditemukan" }, { status: 404 });
  return Response.json({ ok: true });
}
