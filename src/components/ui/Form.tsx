import { type ButtonHTMLAttributes, type InputHTMLAttributes } from "react";

export function Field({
  label,
  name,
  type = "text",
  autoComplete,
  className,
  id,
  ...props
}: { label: string; name: string; id?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const fieldId = id ?? name;
  return (
    <div className="space-y-1.5">
      <label htmlFor={fieldId} className="block text-sm font-medium text-fg">
        {label}
      </label>
      <input
        id={fieldId}
        name={name}
        type={type}
        autoComplete={autoComplete}
        className={`min-h-12 w-full rounded-xl border border-line bg-ink-2 px-4 py-3 text-base text-fg placeholder:text-fg-faint transition-all focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 focus:shadow-[0_0_28px_-8px_rgba(52,211,153,0.4)] ${className ?? ""}`}
        {...props}
      />
    </div>
  );
}

export function Button({
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-xl border border-accent/20 bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink shadow-[0_0_32px_-12px_rgba(16,185,129,0.9)] transition-all hover:bg-accent-bright hover:shadow-[0_0_44px_-10px_rgba(52,211,153,0.8)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${className ?? ""}`}
      {...props}
    >
      {children}
    </button>
  );
}
