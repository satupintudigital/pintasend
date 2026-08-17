"use client";

import { SignOut } from "@phosphor-icons/react";
import { signOut } from "next-auth/react";

export function SignOutButton({ compact = false }: { compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/" })}
      className={`inline-flex items-center justify-center gap-2 rounded-full border border-line bg-surface-2 text-sm text-fg-muted transition-colors hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 active:scale-[0.98] ${
        compact ? "h-11 px-4" : "h-11 w-full px-4"
      }`}
    >
      <SignOut size={15} />
      Keluar
    </button>
  );
}
