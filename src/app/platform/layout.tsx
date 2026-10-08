import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PlatformSidebar } from "@/components/platform/PlatformSidebar";
import { SignOutButton } from "@/components/dashboard/SignOutButton";

export default async function PlatformLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (session?.user?.role !== "platform_admin") redirect("/dashboard");

  const name = session.user.name ?? session.user.email ?? "Platform Admin";
  const initial = (name ?? "?").charAt(0).toUpperCase();
  const email = session.user.email ?? "";

  return (
    <div className="min-h-[100dvh] bg-ink">
      <div className="md:flex min-h-[100dvh]">
        {/* Sidebar — desktop */}
        <aside className="sticky top-0 hidden h-[100dvh] w-64 shrink-0 flex-col border-r border-line bg-surface p-5 md:flex">
          <PlatformSidebar />
          {/* Profile card dengan badge platform-admin */}
          <div className="mt-auto border-t border-line-soft pt-5">
            <div className="rounded-xl border border-accent/15 bg-gradient-to-br from-accent/5 to-transparent p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink font-display text-lg font-semibold shadow-md">
                  {initial}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-fg">{name}</p>
                  <p className="font-mono text-[11px] text-fg-faint">{email}</p>
                </div>
              </div>
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent-bright">
                <svg className="h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Operator Platform
              </div>
              <div className="mt-4 space-y-2">
                <a
                  href="/platform/profile"
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-fg-muted transition-colors hover:bg-line/50 hover:text-fg"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 256 256">
                    <path d="M230.91,172A8,8,0,0,1,228,182.91l-96,56a8,8,0,0,1-8.06,0l-96-56A8,8,0,0,1,36,169.09l92,53.65,92-53.65A8,8,0,0,1,230.91,172ZM220,121.09l-92,53.65L36,121.09A8,8,0,0,0,28,134.91l96,56a8,8,0,0,0,8.06,0l96-56A8,8,0,1,0,220,121.09ZM24,80a8,8,0,0,1,4-6.91l96-56a8,8,0,0,1,8.06,0l96,56a8,8,0,0,1,0,13.82l-96,56a8,8,0,0,1-8.06,0l-96-56A8,8,0,0,1,24,80Zm23.88,0L128,126.74,208.12,80,128,33.26Z" />
                  </svg>
                  Profil & Keamanan
                </a>
                <div className="relative">
                  <SignOutButton />
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Top bar — mobile */}
        <div className="sticky top-0 z-20 border-b border-line bg-surface px-5 py-4 md:hidden">
          <div className="flex items-center justify-between">
            <PlatformSidebar />
            <div className="flex items-center gap-2">
              <a href="/platform/profile" className="rounded-lg p-2 text-fg-muted hover:bg-line/50 hover:text-fg">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M230.91,172A8,8,0,0,1,228,182.91l-96,56a8,8,0,0,1-8.06,0l-96-56A8,8,0,0,1,36,169.09l92,53.65,92-53.65A8,8,0,0,1,230.91,172ZM220,121.09l-92,53.65L36,121.09A8,8,0,0,0,28,134.91l96,56a8,8,0,0,0,8.06,0l96-56A8,8,0,1,0,220,121.09ZM24,80a8,8,0,0,1,4-6.91l96-56a8,8,0,0,1,8.06,0l96,56a8,8,0,0,1,0,13.82l-96,56a8,8,0,0,1-8.06,0l-96-56A8,8,0,0,1,24,80Zm23.88,0L128,126.74,208.12,80,128,33.26Z" />
                </svg>
              </a>
              <SignOutButton compact />
            </div>
          </div>
        </div>

        <main className="min-w-0 flex-1 bg-ink-2 p-6 md:p-10">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
