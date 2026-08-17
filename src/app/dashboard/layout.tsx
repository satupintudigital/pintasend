import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SignOutButton } from "@/components/dashboard/SignOutButton";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex min-h-[100dvh] bg-ink">
      <aside className="flex w-60 shrink-0 flex-col border-r border-line-soft p-5">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight text-fg">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-ink">
            W
          </span>
          wavio
        </Link>

        <nav className="mt-8 space-y-1 text-sm">
          <Link
            href="/dashboard"
            className="block rounded-lg px-3 py-2 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            Beranda
          </Link>
          <Link
            href="/dashboard/devices"
            className="block rounded-lg px-3 py-2 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            Device
          </Link>
        </nav>

        <div className="mt-auto space-y-3 border-t border-line-soft pt-5">
          <div className="truncate text-xs text-fg-faint">{session.user.email}</div>
          <SignOutButton />
        </div>
      </aside>

      <main className="flex-1 p-6 md:p-10">{children}</main>
    </div>
  );
}
