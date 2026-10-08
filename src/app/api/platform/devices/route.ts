import { auth } from "@/lib/auth";
import { listAllPlatformDevices } from "@/lib/platform";
import { isPlatformAdmin, parsePrincipal, unauthorized, forbidden, type SessionLike } from "@/lib/abac";

function requirePlatformAdmin(session: SessionLike | null): Response | null {
  const p = parsePrincipal(session);
  if (!p) return unauthorized();
  if (!isPlatformAdmin(p)) return forbidden("Forbidden — khusus platform admin");
  return null;
}

export async function GET(req: Request) {
  const session = await auth();
  const denied = requirePlatformAdmin(session);
  if (denied) return denied;

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const page = Number(url.searchParams.get("page") ?? "1");
  const limit = Number(url.searchParams.get("limit") ?? "20");

  if (!Number.isFinite(page) || page < 1) {
    return Response.json({ error: "page harus angka >= 1" }, { status: 400 });
  }
  if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
    return Response.json({ error: "limit harus 1..100" }, { status: 400 });
  }

  try {
    const result = await listAllPlatformDevices({
      q,
      status,
      page: Math.floor(page),
      limit: Math.floor(limit),
    });
    return Response.json(result);
  } catch (e) {
    console.error("platform/devices GET:", e);
    return Response.json({ error: "Gagal memuat daftar device" }, { status: 500 });
  }
}
