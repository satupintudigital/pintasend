import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PlatformSidebar } from "@/components/platform/PlatformSidebar";

export default async function PlatformLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (session?.user?.role !== "platform_admin") redirect("/dashboard");

  return (
    <div className="min-h-[100dvh] bg-ink">
      <div className="md:flex min-h-[100dvh]">
        <aside className="sticky top-0 hidden h-[100dvh] w-64 shrink-0 flex-col border-r border-line bg-surface p-5 md:flex">
          <PlatformSidebar />
          <div className="mt-auto border-t border-line-soft pt-4 text-xs text-fg-faint">
            <p className="font-mono">Platform operator</p>
          </div>
        </aside>
        <main className="min-w-0 flex-1 bg-ink-2 p-6 md:p-10">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
