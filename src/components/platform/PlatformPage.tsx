import { ReactNode } from "react";

interface Props {
  title: string;
  children: ReactNode;
}

export function PlatformPage({ title, children }: Props) {
  return (
    <>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        <p className="mt-1 text-sm text-fg-muted">Kelola akun platform operator.</p>
      </div>
      {children}
    </>
  );
}
