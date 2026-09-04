import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { tenantHasCampaignAddon } from "@/lib/campaigns";
import { SignOutButton } from "@/components/dashboard/SignOutButton";
import { SidebarNav } from "@/components/dashboard/SidebarNav";
import { Logo } from "@/components/Logo";

function Brand() {
  return <Logo />;
}

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const hasCampaign = session.user.tenantId
    ? await tenantHasCampaignAddon(session.user.tenantId).catch(() => false)
    : false;

  const name = session.user.name ?? session.user.email;
  const initial = (name ?? "?").charAt(0).toUpperCase();

  return (
    <div className="min-h-[100dvh] bg-ink">
      <div className="md:flex min-h-[100dvh]">
        {/* Sidebar — desktop */}
        <aside className="sticky top-0 hidden h-[100dvh] w-64 shrink-0 flex-col border-r border-line bg-surface p-5 md:flex">
          <Brand />
          <SidebarNav
            canManageUsers={
              session.user.role === "owner" || session.user.role === "tenant_admin"
            }
            isOwner={session.user.role === "owner"}
            hasCampaign={hasCampaign}
          />
          <div className="mt-auto space-y-4 border-t border-line-soft pt-5">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent/5 font-display text-sm font-semibold text-accent-bright">
                {initial}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-fg">{name}</p>
                <p className="truncate font-mono text-[11px] text-fg-faint">{session.user.email}</p>
              </div>
            </div>
            <SignOutButton />
          </div>
        </aside>

        {/* Top bar — mobile */}
        <div className="sticky top-0 z-20 border-b border-line bg-surface px-5 py-4 md:hidden">
          <div className="flex items-center justify-between">
            <Brand />
            <SignOutButton compact />
          </div>
          <SidebarNav
            horizontal
            canManageUsers={
              session.user.role === "owner" || session.user.role === "tenant_admin"
            }
            isOwner={session.user.role === "owner"}
            hasCampaign={hasCampaign}
          />
        </div>

        <main className="min-w-0 flex-1 bg-ink-2 p-6 md:p-10">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
