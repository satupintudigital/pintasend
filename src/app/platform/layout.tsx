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
          {/* Profile card — operator platform */}
          <div className="mt-auto border-t border-line-soft pt-5">
            <div className="group rounded-xl border border-accent/10 bg-gradient-to-br from-accent/5 via-white/5 to-transparent p-5 backdrop-blur-sm shadow-lg shadow-ink/5 transition-shadow hover:shadow-xl hover:shadow-accent/10">
              <div className="flex items-center gap-3.5">
                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink font-display text-xl font-semibold shadow-lg shadow-accent/20">
                  {initial}
                  <div className="absolute inset-0 rounded-full ring-2 ring-accent/20 ring-inset" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-fg">{name}</p>
                  <p className="truncate font-mono text-[11px] text-fg-faint">{email}</p>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/15 bg-accent/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-accent-bright">
                  <svg className="h-3 w-3 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Operator Platform
                </span>
              </div>

              <div className="mt-4 space-y-1.5">
                <a
                  href="/platform/profile"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-fg-muted transition-all hover:bg-line/50 hover:text-fg hover:shadow-sm"
                >
                  <svg className="h-5 w-5 shrink-0 text-fg-faint transition-colors group-hover:text-accent-bright" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 256 256" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M230.91,172A8,8,0,0,1,228,182.91l-96,56a8,8,0,0,1-8.06,0l-96-56A8,8,0,0,1,36,169.09l92,53.65,92-53.65A8,8,0,0,1,230.91,172ZM220,121.09l-92,53.65L36,121.09A8,8,0,0,0,28,134.91l96,56a8,8,0,0,0,8.06,0l96-56A8,8,0,1,0,220,121.09ZM24,80a8,8,0,0,1,4-6.91l96-56a8,8,0,0,1,8.06,0l96,56a8,8,0,0,1,0,13.82l-96,56a8,8,0,0,1-8.06,0l-96-56A8,8,0,0,1,24,80Zm23.88,0L128,126.74,208.12,80,128,33.26Z" />
                  </svg>
                  Profil & Keamanan
                </a>
                <div className="mt-1">
                  <SignOutButton />
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Top bar — mobile */}
        <div className="sticky top-0 z-20 border-b border-line bg-surface md:hidden">
          <div className="flex items-center justify-between">
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-line/50 hover:text-fg"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 256 256" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 60a2 2 0 012-2h24a2 2 0 012 2v112a2 2 0 01-2 2H6a2 2 0 01-2-2V60z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M24 47.5a3.5 3.5 0 017 0v26a3.5 3.5 0 007 0V47.5a3.5 3.5 0 017 0v84.5a3.5 3.5 0 007 0V47.5a3.5 3.5 0 017 0v26a3.5 3.5 0 007 0V47.5a3.5 3.5 0 017 0v26a2 2 0 01-2 2H6a2 2 0 01-2-2V69.5a3.5 3.5 0 00-7 0V112a2 2 0 01-2 2" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <a
                href="/platform/profile"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-line/50 hover:text-fg"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 256 256" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M230.91,172A8,8,0,0,1,228,182.91l-96,56a8,8,0,0,1-8.06,0l-96-56A8,8,0,0,1,36,169.09l92,53.65,92-53.65A8,8,0,0,1,230.91,172Z" />
                </svg>
                Profil
              </a>
              <div className="h-6 w-px bg-line" />
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
