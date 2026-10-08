import { auth } from "@/lib/auth";
import { parsePrincipal, unauthorized } from "@/lib/abac";
import { updateBotRule, deleteBotRule } from "@/lib/botRules";

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const principal = parsePrincipal(session);
  if (!principal) return unauthorized();

  const { id } = await context.params;
  if (!id) {
    return Response.json({ error: "ID tidak valid" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return Response.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const patch: {
    name?: string;
    keyword?: string;
    matchType?: "exact" | "contains" | "starts_with";
    response?: string;
    isActive?: boolean;
  } = {};

  if (typeof body.name === "string") patch.name = body.name.trim();
  if (typeof body.keyword === "string") patch.keyword = body.keyword.trim();
  if (
    body.matchType === "exact" ||
    body.matchType === "contains" ||
    body.matchType === "starts_with"
  ) {
    patch.matchType = body.matchType;
  }
  if (typeof body.response === "string") patch.response = body.response;
  if (typeof body.isActive === "boolean") patch.isActive = body.isActive;

  try {
    const updated = await updateBotRule(principal.tenantId, id, patch);
    if (!updated) {
      return Response.json({ error: "Bot rule tidak ditemukan" }, { status: 404 });
    }
    return Response.json({ rule: updated });
  } catch (e) {
    console.error("PUT /api/bot/rules/[id] error:", e);
    return Response.json({ error: "Gagal memperbarui bot rule" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const principal = parsePrincipal(session);
  if (!principal) return unauthorized();

  const { id } = await context.params;
  if (!id) {
    return Response.json({ error: "ID tidak valid" }, { status: 400 });
  }

  try {
    const deleted = await deleteBotRule(principal.tenantId, id);
    if (!deleted) {
      return Response.json({ error: "Bot rule tidak ditemukan" }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/bot/rules/[id] error:", e);
    return Response.json({ error: "Gagal menghapus bot rule" }, { status: 500 });
  }
}
