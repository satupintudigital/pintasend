"use client";

import { useState } from "react";
import { Check, Copy } from "@phosphor-icons/react";
import { Reveal } from "@/components/Reveal";
import { Tokens, type Token } from "@/components/landing/Code";

const endpoints = [
  { method: "POST", path: "/v1/messages", desc: "Kirim pesan teks atau media" },
  { method: "GET", path: "/v1/groups", desc: "Daftar grup pada device" },
  { method: "GET", path: "/v1/contacts", desc: "Daftar kontak audiens" },
  { method: "POST", path: "/v1/campaigns", desc: "Buat campaign broadcast" },
];

const methodClass = (method: string) =>
  method === "POST"
    ? "bg-accent/10 text-accent-bright"
    : "bg-surface-2 text-fg-muted";

type Sample = {
  id: string;
  label: string;
  raw: string;
  tokens: Token[];
};

const samples: Sample[] = [
  {
    id: "kirim",
    label: "Kirim pesan",
    raw: `curl -X POST https://pintasend.satupintudigital.co.id/v1/messages \\
  -H "Authorization: Bearer $PINTSEND_KEY" \\
  -d '{"to":"6281234567890","text":"Pesanan #1234 sudah dikirim"}'`,
    tokens: [
      ["k", "curl"],
      ["plain", " "],
      ["f", "-X POST"],
      ["plain", " "],
      ["s", "https://pintasend.satupintudigital.co.id/v1/messages"],
      ["plain", " \\\n  "],
      ["f", "-H"],
      ["plain", " "],
      ["s", '"Authorization: Bearer $PINTSEND_KEY"'],
      ["plain", " \\\n  "],
      ["f", "-d"],
      ["plain", " "],
      ["s", '{"to":"6281234567890",'],
      ["plain", "\n       "],
      ["s", '"text":"Pesanan #1234 sudah dikirim"'],
      ["plain", "}"],
    ],
  },
  {
    id: "webhook",
    label: "Webhook masuk",
    raw: `{
  "event": "message.received",
  "device": "62812xxxxxxx",
  "from": "6281234567890",
  "text": "Apakah stok masih ada?",
  "at": "2026-08-17T09:41:00Z"
}`,
    tokens: [
      ["p", "{"],
      ["plain", "\n  "],
      ["k", '"event"'],
      ["p", ": "],
      ["s", '"message.received"'],
      ["p", ","],
      ["plain", "\n  "],
      ["k", '"device"'],
      ["p", ": "],
      ["s", '"62812xxxxxxx"'],
      ["p", ","],
      ["plain", "\n  "],
      ["k", '"from"'],
      ["p", ": "],
      ["s", '"6281234567890"'],
      ["p", ","],
      ["plain", "\n  "],
      ["k", '"text"'],
      ["p", ": "],
      ["s", '"Apakah stok masih ada?"'],
      ["p", ","],
      ["plain", "\n  "],
      ["k", '"at"'],
      ["p", ": "],
      ["s", '"2026-08-17T09:41:00Z"'],
      ["plain", "\n"],
      ["p", "}"],
    ],
  },
  {
    id: "devices",
    label: "Daftar device",
    raw: `GET /v1/devices

{
  "devices": [
    { "id": "dev_01j6…", "name": "Toko Utama", "status": "connected" },
    { "id": "dev_01j7…", "name": "Promo", "status": "waiting_qr" }
  ]
}`,
    tokens: [
      ["k", "GET"],
      ["plain", " "],
      ["s", "/v1/devices"],
      ["plain", "\n\n"],
      ["p", "{"],
      ["plain", "\n  "],
      ["k", '"devices"'],
      ["p", ": ["],
      ["plain", "\n    "],
      ["p", "{ "],
      ["k", '"id"'],
      ["p", ": "],
      ["s", '"dev_01j6…"'],
      ["p", ", "],
      ["k", '"name"'],
      ["p", ": "],
      ["s", '"Toko Utama"'],
      ["p", ", "],
      ["k", '"status"'],
      ["p", ": "],
      ["s", '"connected"'],
      ["p", " }"],
      ["p", ","],
      ["plain", "\n    "],
      ["p", "{ "],
      ["k", '"id"'],
      ["p", ": "],
      ["s", '"dev_01j7…"'],
      ["p", ", "],
      ["k", '"name"'],
      ["p", ": "],
      ["s", '"Promo"'],
      ["p", ", "],
      ["k", '"status"'],
      ["p", ": "],
      ["s", '"waiting_qr"'],
      ["p", " }"],
      ["plain", "\n  "],
      ["p", "]"],
      ["plain", "\n"],
      ["p", "}"],
    ],
  },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard tidak tersedia — abaikan */
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label="Salin contoh kode"
      className={`flex min-h-10 items-center gap-1.5 rounded-lg border px-3 py-2 font-mono text-[11px] transition-colors ${
        copied
          ? "border-accent/40 bg-accent/10 text-accent-bright"
          : "border-line-soft text-fg-faint hover:border-line hover:text-fg"
      }`}
    >
      {copied ? <Check size={12} weight="bold" /> : <Copy size={12} />}
      {copied ? "Tersalin" : "Salin"}
    </button>
  );
}

export function ApiSection() {
  const [activeId, setActiveId] = useState(samples[0].id);
  const active = samples.find((s) => s.id === activeId) ?? samples[0];

  return (
    <section id="api" className="mx-auto max-w-7xl px-5 py-24 md:py-32">
      <div className="grid gap-14 md:grid-cols-2 md:items-center">
        <Reveal>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">API</p>
          <h2 className="mt-3 max-w-[22ch] text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
            Satu API yang rapi untuk semua integrasi.
          </h2>
          <p className="mt-4 max-w-[52ch] leading-relaxed text-fg-muted">
            Autentikasi pakai API key, isolasi per device, dan dokumentasi yang jelas.
            Integrasikan dengan toko online, CRM, atau sistem internal apa pun.
          </p>
          <ul className="mt-8 space-y-1">
            {endpoints.map((e) => (
              <li
                key={e.method + e.path}
                className="flex items-center gap-3 border-b border-line-soft py-3 last:border-b-0"
              >
                <span
                  className={`w-14 shrink-0 rounded-lg px-2 py-1 text-center font-mono text-[11px] font-semibold ${methodClass(e.method)}`}
                >
                  {e.method}
                </span>
                <code className="font-mono text-sm text-fg">{e.path}</code>
                <span className="ml-auto hidden text-sm text-fg-faint sm:block">{e.desc}</span>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={100}>
          <div className="overflow-hidden rounded-2xl border border-line bg-ink-2 shadow-[0_40px_100px_-50px_rgba(16,185,129,0.3)]">
            {/* Tab bar */}
            <div className="flex items-center justify-between gap-2 border-b border-line-soft bg-surface/70 px-3 py-2.5">
              <div className="flex items-center gap-1" role="tablist" aria-label="Contoh kode API">
                {samples.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={activeId === s.id}
                    onClick={() => setActiveId(s.id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      activeId === s.id
                        ? "bg-surface-2 text-fg"
                        : "text-fg-faint hover:text-fg"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <CopyButton text={active.raw} />
            </div>

            <pre tabIndex={0} className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed">
              <code key={active.id} className="bk-code-in block">
                <Tokens tokens={active.tokens} />
              </code>
            </pre>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
