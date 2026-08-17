"use client";

import { useState } from "react";
import { Check, Copy, Info, Warning } from "@phosphor-icons/react";

// Blok kode dengan tombol salin.
export function CodeBlock({
  code,
  lang = "bash",
}: {
  code: string;
  lang?: string;
}) {
  const [copied, setCopied] = useState(false);
  async function onCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard tidak tersedia */
    }
  }
  return (
    <div className="group relative overflow-hidden rounded-xl border border-line bg-ink-2">
      <div className="flex items-center justify-between border-b border-line-soft bg-surface/60 px-4 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-faint">{lang}</span>
        <button
          onClick={onCopy}
          aria-label="Salin kode"
          className="flex items-center gap-1.5 rounded-md border border-line-soft px-2.5 py-1 font-mono text-[11px] text-fg-faint transition-colors hover:border-line hover:text-fg"
        >
          {copied ? <Check size={11} weight="bold" /> : <Copy size={11} />}
          {copied ? "Tersalin" : "Salin"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function MethodBadge({ method }: { method: "GET" | "POST" | "DELETE" | "PATCH" }) {
  const cls =
    method === "POST"
      ? "bg-accent/10 text-accent-bright"
      : method === "DELETE"
        ? "bg-red-500/10 text-red-400"
        : "bg-surface-2 text-fg-muted";
  return (
    <span className={`w-14 shrink-0 rounded-lg px-2 py-1 text-center font-mono text-[11px] font-semibold ${cls}`}>
      {method}
    </span>
  );
}

export function Callout({
  type,
  title,
  children,
}: {
  type: "info" | "warning";
  title: string;
  children: React.ReactNode;
}) {
  const cls =
    type === "warning"
      ? "border-amber-500/20 bg-amber-500/5 text-amber-300"
      : "border-accent/20 bg-accent/5 text-fg-muted";
  const Icon = type === "warning" ? Warning : Info;
  return (
    <div className={`flex gap-3 rounded-xl border px-4 py-3.5 text-sm leading-relaxed ${cls}`}>
      <Icon size={17} className="mt-0.5 shrink-0" weight="fill" />
      <div>
        <p className="font-medium text-fg">{title}</p>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  );
}

export interface EndpointDoc {
  method: "GET" | "POST" | "DELETE" | "PATCH";
  path: string;
  desc: string;
}

export function EndpointTable({ endpoints }: { endpoints: EndpointDoc[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      {endpoints.map((e, i) => (
        <div
          key={e.method + e.path}
          className={`flex flex-wrap items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-line-soft" : ""}`}
        >
          <MethodBadge method={e.method} />
          <code className="font-mono text-sm text-fg">{e.path}</code>
          <span className="ml-auto text-sm text-fg-faint">{e.desc}</span>
        </div>
      ))}
    </div>
  );
}
