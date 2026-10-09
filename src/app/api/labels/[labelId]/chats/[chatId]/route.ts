import { auth } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ labelId: string; chatId: string }> }
) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { labelId, chatId: rawChatId } = await params;
  const chatId = decodeURIComponent(rawChatId);

  try {
    const label = await queryOne<{ id: string }>(
      'SELECT id FROM "Label" WHERE id = $1 AND "tenantId" = $2 AND "isActive" = true',
      [labelId, tenantId]
    );
    if (!label) return Response.json({ error: "Label tidak ditemukan" }, { status: 404 });

    await query('DELETE FROM "LabelContact" WHERE "labelId" = $1 AND "chatId" = $2', [labelId, chatId]);

    return Response.json({ ok: true, removed: true });
  } catch (e) {
    console.error("DELETE /api/labels/[labelId]/chats/[chatId] error:", e);
    return Response.json({ error: "Gagal menghapus chat dari label" }, { status: 500 });
  }
}
