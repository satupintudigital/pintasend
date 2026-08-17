"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Info, Warning } from "@phosphor-icons/react";

/* ── Tokenizer sintaks ringan ───────────────────────────────────────────────
   Token berupa [tipe, teks]. Tipe: c komentar · k key/command · f keyword ·
   s string · n angka/variable · p tanda baca · plain teks biasa.
   Dipakai bersama kelas .tok-* yang sudah ada di globals.css. */

const tokClass: Record<string, string> = {
  c: "tok-c",
  k: "tok-k",
  f: "tok-f",
  s: "tok-s",
  n: "tok-n",
  p: "tok-p",
};

type Tok = { cls?: string; text: string };

const KEYWORDS = new Set([
  "const", "let", "var", "function", "async", "await", "return",
  "import", "from", "if", "else", "new", "typeof",
]);

const COMMANDS = new Set([
  "curl", "GET", "POST", "DELETE", "PATCH", "HTTP", "Authorization", "Bearer",
]);

function tokenize(code: string): Tok[] {
  const out: Tok[] = [];
  const n = code.length;
  let i = 0;
  const push = (cls: string | undefined, text: string) => {
    if (text) out.push({ cls, text });
  };

  while (i < n) {
    const rest = code.slice(i);

    // String kutip ganda — atau kunci JSON bila diikuti ":"
    if (code[i] === '"') {
      const m = /^"([^"\\]|\\.)*"/.exec(rest);
      if (m) {
        const isKey = /^\s*:/.test(rest.slice(m[0].length));
        push(isKey ? "k" : "s", m[0]);
        i += m[0].length;
        continue;
      }
    }

    // Template literal (backtick)
    if (code[i] === "`") {
      const m = /^`([^`\\]|\\.)*`/.exec(rest);
      if (m) {
        push("s", m[0]);
        i += m[0].length;
        continue;
      }
    }

    // Komentar baris: "//" (kecuali skema URL "https://") atau "#" di awal kata
    const isLineComment =
      code[i] === "/" &&
      code[i + 1] === "/" &&
      (i === 0 || (code[i - 1] !== ":" && !(code[i - 1] === "/" && code[i - 2] === ":")));
    const isHashComment = code[i] === "#" && (i === 0 || /\s/.test(code[i - 1]));
    if (isLineComment || isHashComment) {
      const end = code.indexOf("\n", i);
      const slice = code.slice(i, end === -1 ? n : end);
      push("c", slice);
      i += slice.length;
      continue;
    }

    // Variabel PHP ($ch, $res …)
    if (code[i] === "$" && /[A-Za-z_]/.test(code[i + 1] ?? "")) {
      const m = /^\$[A-Za-z_]\w*/.exec(rest);
      if (m) {
        push("n", m[0]);
        i += m[0].length;
        continue;
      }
    }

    // Angka
    if (/\d/.test(code[i])) {
      const m = /^-?\d+(?:\.\d+)?/.exec(rest);
      if (m) {
        push("n", m[0]);
        i += m[0].length;
        continue;
      }
    }

    // Kata
    if (/[A-Za-z_]/.test(code[i])) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
      if (m) {
        const w = m[0];
        if (w === "true" || w === "false" || w === "null" || w === "undefined") push("n", w);
        else if (COMMANDS.has(w)) push("k", w);
        else if (KEYWORDS.has(w)) push("f", w);
        else push(undefined, w);
        i += m[0].length;
        continue;
      }
    }

    // Tanda baca
    if ("{}[](),:;".includes(code[i])) {
      push("p", code[i]);
      i += 1;
      continue;
    }

    // Teks biasa (bukan karakter spesial)
    const plain = /^[^{}[\](),:;"`$#/0-9A-Za-z_]+/.exec(rest);
    if (plain) {
      push(undefined, plain[0]);
      i += plain[0].length;
      continue;
    }

    push(undefined, code[i]);
    i += 1;
  }
  return out;
}

/* ── Blok kode dengan tombol salin + highlight sintaks ── */
export function CodeBlock({ code, lang = "bash" }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const tokens = useMemo(() => tokenize(code), [code]);

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
    <div className="group overflow-hidden rounded-xl border border-line bg-ink-2 shadow-[0_24px_60px_-36px_rgba(0,0,0,0.8)] transition-colors hover:border-line">
      <div className="flex items-center gap-3 border-b border-line-soft bg-surface/60 px-4 py-2.5">
        <span aria-hidden className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-line" />
          <span className="h-2.5 w-2.5 rounded-full bg-line" />
          <span className="h-2.5 w-2.5 rounded-full bg-line" />
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-faint">{lang}</span>
        <button
          onClick={onCopy}
          aria-label="Salin kode"
          className={`ml-auto flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px] transition-all active:scale-95 ${
            copied
              ? "border-accent/40 bg-accent/10 text-accent-bright"
              : "border-line-soft text-fg-faint hover:border-line hover:text-fg"
          }`}
        >
          {copied ? <Check size={11} weight="bold" /> : <Copy size={11} />}
          {copied ? "Tersalin" : "Salin"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
        <code>
          {tokens.map((t, i) => {
            const cls = t.cls ? tokClass[t.cls] : undefined;
            return cls ? (
              <span key={i} className={cls}>
                {t.text}
              </span>
            ) : (
              <span key={i}>{t.text}</span>
            );
          })}
        </code>
      </pre>
    </div>
  );
}

/* ── Heading section dengan tautan anchor (#) ── */
export function Anchor({
  id,
  children,
  className = "",
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2 id={id} className={`group font-display text-xl font-semibold tracking-tight ${className}`}>
      <a href={`#${id}`} className="inline-flex items-baseline gap-2">
        {children}
        <span
          aria-hidden
          className="font-mono text-sm font-normal text-accent-bright opacity-0 transition-opacity group-hover:opacity-100"
        >
          #
        </span>
      </a>
    </h2>
  );
}

/* ── Badge method HTTP ── */
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

/* ── Callout info / warning ── */
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

/* ── Tabel endpoint ── */
export function EndpointTable({ endpoints }: { endpoints: EndpointDoc[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      {endpoints.map((e, i) => (
        <div
          key={e.method + e.path}
          className={`flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-surface/60 ${
            i > 0 ? "border-t border-line-soft" : ""
          }`}
        >
          <MethodBadge method={e.method} />
          <code className="font-mono text-sm text-fg">{e.path}</code>
          <span className="ml-auto text-sm text-fg-faint">{e.desc}</span>
        </div>
      ))}
    </div>
  );
}
