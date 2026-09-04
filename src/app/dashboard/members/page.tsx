import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canManageTenantMembers, parsePrincipal } from "@/lib/abac";
import { listTenantMembers } from "@/lib/tenantMembers";
import type { Member } from "@/components/dashboard/MembersTable";
import { MembersTable } from "@/components/dashboard/MembersTable";

export default async function DashboardMembers() {
  const session = await auth();
  const p = parsePrincipal(session);
  if (!p) redirect("/login");
  if (!canManageTenantMembers(p, p.tenantId)) redirect("/dashboard");

  // SSR best-effort: saat binding D1 tidak tersedia (dev/build), halaman tetap
  // render kosong dan MembersTable me-refresh via API di sisi client.
  const { users } = await listTenantMembers(p.tenantId, { page: 1, limit: 100 }).catch(() => ({
    users: [],
    total: 0,
  }));

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">Pengaturan</p>
      <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
        Members
      </h1>
      <p className="mt-2 max-w-[56ch] text-sm text-fg-muted">
        Kelola pengguna di tenant Anda — undang member/tenant_admin, ubah peran, reset
        password, atau hapus. Owner hanya satu per tenant dan dikelola platform admin.
      </p>
      <div className="mt-8">
        <MembersTable
          initial={users as Member[]}
          currentUserId={p.id}
          currentRole={p.role}
        />
      </div>
    </div>
  );
}
