"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/" })}
      className="text-sm text-fg-muted transition-colors hover:text-fg"
    >
      Keluar
    </button>
  );
}
