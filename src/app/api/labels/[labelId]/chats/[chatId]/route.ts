import { auth } from "@/lib/auth";
import { queryD1One } from "@/lib/d1";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ labelId: string; chatId: string }> }
) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { labelId, chatId: rawChatId } = await params;
  const chatId = decodeURIComponent(rawChatId);

  const label = await queryD1One<{ id: string }>(
    "SELECT id FROM Label WHERE id = ? AND tenantId = ? AND isActive = 1",
    [labelId, tenantId]
  );
  if (!label) return Response.json({ error: "Label tidak ditemukan" }, { status: 404 });

  await queryD1One("DELETE FROM LabelContact WHERE labelId = ? AND chatId = ?", [labelId, chatId]);

  return Response.json({ ok: true, removed: true });
}
