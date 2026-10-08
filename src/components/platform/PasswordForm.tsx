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
    <form action={submitAction} className="space-y-6 max-w-lg">
      <div className="rounded-xl border border-accent/10 bg-gradient-to-br from-accent/5 via-white/5 to-transparent p-6 backdrop-blur-sm shadow-lg shadow-ink/5">
        <div className="flex items-center gap-3.5">
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink font-display text-xl font-semibold shadow-lg shadow-accent/20">
            {userName.charAt(0).toUpperCase()}
            <div className="absolute inset-0 rounded-full ring-2 ring-accent/20 ring-inset" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-fg">{userName}</p>
            <p className="font-mono text-xs text-fg-faint">{initialEmail}</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface p-6 shadow-sm shadow-ink/5">
        <div className="flex items-center gap-2.5 mb-5">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 256 256" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M167.25,52.5a12,12,0,1,1-1.41-1.41A15.06,15.06,0,0,0,144,40a15.06,15.06,0,0,0-8.83,2.63,12,12,0,0,1,0,16.83A15.06,15.06,0,0,0,128,61.41a15.06,15.06,0,0,0-2.63,8.83,12,12,0,0,1-16.83,0A15.06,15.06,0,0,0,92.59,56a12,12,0,0,1,0-16.83A15.06,15.06,0,0,0,76,40a15.06,15.06,0,0,0-8.83,2.63,12,12,0,0,1-1.41,1.41,19.05,19.05,0,0,0-12.73,25.47,18.15,18.15,0,0,0,2.59,6.9,19.05,19.05,0,0,0,6.9,2.59,18.15,18.15,0,0,0,25.47-12.73,19.05,19.05,0,0,0,6.9-2.59A15.06,15.06,0,0,0,167.25,52.5Z" />
          </svg>
          <h2 className="font-display text-lg font-semibold text-fg">Ganti Password</h2>
        </div>

        {state.ok && state.message ? (
          <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50/80 px-4 py-3 text-sm text-green-700">
            <svg className="mt-0.5 shrink-0 h-5 w-5 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 256 256" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span>{state.message}</span>
          </div>
        ) : !state.ok && state.error ? (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-600">
            <svg className="mt-0.5 shrink-0 h-5 w-5 text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 256 256" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.6,14.67a1,1,0,0,0,-.22-.34l-4.33-2.6a1,1,0,0,0-.42,0L1.36,16.67a1,1,0,0,0,0,.42l4.33,2.6A1,1,0,0,0,5.17,18H9.83a1,1,0,0,0,.42-0l2-2a1,1,0,0,0,0-.42l-2-2a1,1,0,0,0-.42,0L6.59,14a1,1,0,0,0,.22.33A18.05,18.05,0,0,0,16,26a18,18,0,0,0,6.36,2.43,18.05,18.05,0,0,0,6.36-2.43,1,1,0,0,0,0-.42l-2,2a1,1,0,0,0,.42,0l2.59-2.59A1,1,0,0,0,13.6,14.67Z" />
            </svg>
            <span>{state.error}</span>
          </div>
        ) : null}

        <div className="space-y-4">
          <Field label="Password saat ini" name="currentPassword" type="password" autoComplete="current-password" />
          <Field label="Password baru" name="newPassword" type="password" autoComplete="new-password" />
          <Field label="Konfirmasi password baru" name="confirmPassword" type="password" autoComplete="new-password" />
        </div>

        <Button type="submit" disabled={isPending} className="mt-5 w-full">
          <span className="flex items-center justify-center gap-2">
            {isPending ? (
              <>
                <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 256 256">
                  <circle className="opacity-25" cx="128" cy="128" r="120" stroke="currentColor" strokeWidth={8} />
                  <path className="opacity-75" fill="currentColor" d="M128 2a126 126 0 010 252 126 126 0 010-252z" />
                </svg>
                Menyimpan…
              </>
            ) : (
              "Simpan Password Baru"
            )}
          </span>
        </Button>
      </div>

      <p className="text-xs text-fg-faint text-center leading-relaxed">
        Password harus minimal <strong>8 karakter</strong> dan mengandung kombinasi huruf besar, huruf kecil, atau angka.
      </p>
    </form>
  );
}
