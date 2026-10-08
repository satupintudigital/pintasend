import { auth } from "@/lib/auth";
import { listAllPlatformDevices } from "@/lib/platform";
import { DeviceInspectorTable } from "@/components/platform/DeviceInspectorTable";
import { isPlatformAdmin, parsePrincipal, unauthorized, forbidden, type SessionLike } from "@/lib/abac";
import { redirect } from "next/navigation";

function requirePlatformAdminServer(session: SessionLike | null) {
  const p = parsePrincipal(session);
  if (!p || !isPlatformAdmin(p)) {
    redirect("/dashboard");
  }
}

export default async function PlatformDevicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string; limit?: string }>;
}) {
  const session = await auth();
  requirePlatformAdminServer(session);

  const sp = await searchParams;
  const q = sp.q ?? "";
  const status = sp.status ?? "";
  const page = Number(sp.page ?? "1");
  const limit = Number(sp.limit ?? "20");

  const result = await listAllPlatformDevices({
    q,
    status,
    page: Number.isFinite(page) ? page : 1,
    limit: Number.isFinite(limit) ? limit : 20,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-fg">Manajemen Device Lintas Tenant</h1>
        <p className="text-sm text-fg-muted">
          Pantau status seluruh device WhatsApp dari semua tenant, lakukan force logout atau restart session.
        </p>
      </div>

      <DeviceInspectorTable
        initialDevices={result.devices}
        total={result.total}
        currentPage={result.page}
        limit={result.limit}
        currentQ={q}
        currentStatus={status}
      />
    </div>
  );
}
