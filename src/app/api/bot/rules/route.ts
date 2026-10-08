import { auth } from "@/lib/auth";
import { parsePrincipal, unauthorized } from "@/lib/abac";
import { listBotRules, createBotRule } from "@/lib/botRules";

export async function GET(req: Request) {
  const session = await auth();
  const principal = parsePrincipal(session);
  if (!principal) return unauthorized();

  try {
    const rules = await listBotRules(principal.tenantId);
    return Response.json({ rules });
  } catch (e) {
    console.error("GET /api/bot/rules error:", e);
    return Response.json({ error: "Gagal memuat bot rules" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  const principal = parsePrincipal(session);
  if (!principal) return unauthorized();

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return Response.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const keyword = typeof body.keyword === "string" ? body.keyword.trim() : "";
  const response = typeof body.response === "string" ? body.response : "";
  const matchType = typeof body.matchType === "string" ? body.matchType : "exact";
  const isActive = typeof body.isActive === "boolean" ? body.isActive : true;

  if (!name || !keyword || !response) {
    return Response.json({ error: "name, keyword, dan response wajib diisi" }, { status: 400 });
  }

  if (matchType !== "exact" && matchType !== "contains" && matchType !== "starts_with") {
    return Response.json({ error: "matchType tidak valid" }, { status: 400 });
  }

  try {
    const rule = await createBotRule(principal.tenantId, {
      name,
      keyword,
      matchType,
      response,
      isActive,
    });
    return Response.json({ rule }, { status: 201 });
  } catch (e) {
    console.error("POST /api/bot/rules error:", e);
    return Response.json({ error: "Gagal membuat bot rule" }, { status: 500 });
  }
}
