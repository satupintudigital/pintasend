import { ReactNode } from "react";
import { ArrowRight } from "@phosphor-icons/react/ssr";

interface Props {
  title: string;
  description?: string;
  action?: {
    label: string;
    href: string;
  };
  children: ReactNode;
}

export function PlatformPage({ title, description, action, children }: Props) {
  return (
    <>
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">Platform</p>
            <h1 className="mt-1.5 font-display text-2xl sm:text-3xl font-bold tracking-tight text-fg">{title}</h1>
            {description && (
              <p className="mt-1.5 text-sm text-fg-muted">{description}</p>
            )}
          </div>
          {action && (
            <a
              href={action.href}
              className="shrink-0 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink shadow-lg shadow-accent/20 transition-all hover:bg-accent-bright hover:shadow-xl hover:shadow-accent/30 hover:-translate-y-0.5"
            >
              {action.label}
              <ArrowRight size={14} className="ml-1.5 inline" />
            </a>
          )}
        </div>
      </div>
      {children}
    </>
  );
}
