"use client";

import { useActionState } from "react";
import { changePassword, type FormState } from "@/lib/platformChangePassword";
import { Field, Button } from "@/components/ui/Form";

interface Props {
  initialEmail: string;
  userName: string;
}

export function PasswordForm({ initialEmail, userName }: Props) {
  const [state, submitAction, isPending] = useActionState<FormState, FormData>(
    changePassword,
    { ok: false, error: "" },
  );

  return (
    <form action={submitAction} className="space-y-6 max-w-md">
      <div className="rounded-xl border border-line bg-surface p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent/5 font-display text-base font-semibold text-accent-bright">
            {userName.charAt(0).toUpperCase()}
          </span>
          <div>
            <p className="font-semibold text-fg">{userName}</p>
            <p className="font-mono text-xs text-fg-faint">{initialEmail}</p>
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-line bg-surface p-5">
        <h2 className="font-display text-lg font-semibold text-fg">Ganti Password</h2>

        {state.ok && state.message ? (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {state.message}
          </div>
        ) : !state.ok && state.error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {state.error}
          </div>
        ) : null}

        <Field label="Password saat ini" name="currentPassword" type="password" autoComplete="current-password" />
        <Field label="Password baru" name="newPassword" type="password" autoComplete="new-password" />
        <Field label="Konfirmasi password baru" name="confirmPassword" type="password" autoComplete="new-password" />

        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? "Menyimpan…" : "Simpan Password Baru"}
        </Button>
      </div>

      <p className="text-xs text-fg-faint text-center">
        Password harus minimal 8 karakter. Gunakan kombinasi huruf dan angka untuk keamanan.
      </p>
    </form>
  );
}
