import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SignOutButton } from "@/components/dashboard/SignOutButton";
import { SidebarNav } from "@/components/dashboard/SidebarNav";

function Brand() {
  return (
    <Link href="/" className="group flex items-center gap-2.5 font-display font-semibold tracking-tight text-fg">
      <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-accent text-sm font-bold text-accent-ink transition-shadow group-hover:shadow-[0_0_24px_-4px_rgba(52,211,153,0.7)]">
        W
      </span>
      wavio
    </Link>
  );
}

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const name = session.user.name ?? session.user.email;
  const initial = (name ?? "?").charAt(0).toUpperCase();

  return (
    <div className="min-h-[100dvh] bg-ink">
      <div className="md:flex">
        {/* Sidebar — desktop */}
        <aside className="sticky top-0 hidden h-[100dvh] w-60 shrink-0 flex-col border-r border-line-soft p-5 md:flex">
          <Brand />
          <SidebarNav />
          <div className="mt-auto space-y-4 border-t border-line-soft pt-5">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-accent/25 bg-accent/10 font-display text-sm font-semibold text-accent-bright">
                {initial}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-fg">{name}</p>
                <p className="truncate font-mono text-[11px] text-fg-faint">{session.user.email}</p>
              </div>
            </div>
            <SignOutButton />
          </div>
        </aside>

        {/* Top bar — mobile */}
        <div className="border-b border-line-soft px-5 py-4 md:hidden">
          <div className="flex items-center justify-between">
            <Brand />
            <SignOutButton compact />
          </div>
          <SidebarNav horizontal />
        </div>

        <main className="min-w-0 flex-1 p-6 md:p-10">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
