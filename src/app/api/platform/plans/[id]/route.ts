import { auth } from "@/lib/auth";
import { updatePlan } from "@/lib/platform";

// Edit kuota plan — khusus platform_admin.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "platform_admin") {
    return Response.json({ error: "Forbidden — khusus platform admin" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as {
    name?: unknown;
    tagline?: unknown;
    priceDisplay?: unknown;
    kind?: unknown;
    priceMonthly?: unknown;
    maxDevices?: unknown;
    maxUsers?: unknown;
    maxMessagesPerMonth?: unknown;
    includesDelay?: unknown;
    isActive?: unknown;
    isPublic?: unknown;
    sortOrder?: unknown;
  } | null;

  const patch: Parameters<typeof updatePlan>[1] = {};
  if (typeof body?.name === "string" && body.name.trim()) {
    patch.name = body.name.trim().slice(0, 80);
  }
  if (typeof body?.tagline === "string") patch.tagline = body.tagline.trim();
  if (typeof body?.priceDisplay === "string") patch.priceDisplay = body.priceDisplay.trim();
  if (body?.kind === "subscription" || body?.kind === "prepaid") patch.kind = body.kind;
  if (body?.priceMonthly === null) {
    patch.priceMonthly = null;
  } else if (typeof body?.priceMonthly === "number" && body.priceMonthly >= 0) {
    patch.priceMonthly = Math.floor(body.priceMonthly);
  }
  if (typeof body?.maxDevices === "number" && body.maxDevices >= 0) {
    patch.maxDevices = Math.floor(body.maxDevices);
  }
  if (typeof body?.maxUsers === "number" && body.maxUsers >= 0) {
    patch.maxUsers = Math.floor(body.maxUsers);
  }
  if (body?.maxMessagesPerMonth === null) {
    patch.maxMessagesPerMonth = null;
  } else if (
    typeof body?.maxMessagesPerMonth === "number" &&
    body.maxMessagesPerMonth >= 0
  ) {
    patch.maxMessagesPerMonth = Math.floor(body.maxMessagesPerMonth);
  }
  if (typeof body?.includesDelay === "boolean") patch.includesDelay = body.includesDelay;
  if (typeof body?.isActive === "boolean") patch.isActive = body.isActive;
  if (typeof body?.isPublic === "boolean") patch.isPublic = body.isPublic;
  if (typeof body?.sortOrder === "number" && body.sortOrder >= 0) {
    patch.sortOrder = Math.floor(body.sortOrder);
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "Tidak ada field valid untuk diubah" }, { status: 400 });
  }

  const ok = await updatePlan(id, patch);
  if (!ok) return Response.json({ error: "Plan tidak ditemukan" }, { status: 404 });
  return Response.json({ ok: true });
}
