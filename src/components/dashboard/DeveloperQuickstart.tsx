"use client";

import { useState } from "react";
import { Check, Copy, Terminal } from "@phosphor-icons/react";

export function DeveloperQuickstart() {
  const [tab, setTab] = useState<"curl" | "node" | "python">("curl");
  const [copied, setCopied] = useState(false);

  const snippets = {
    curl: `curl -X POST https://pintasend.satupintudigital.co.id/v1/messages \\
  -H "Authorization: Bearer YOUR_PINTSEND_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "6281234567890",
    "message": "Halo! Pesanan Anda sedang diproses."
  }'`,
    node: `const res = await fetch("https://pintasend.satupintudigital.co.id/v1/messages", {
  method: "POST",
  headers: {
    "Authorization": "Bearer YOUR_PINTSEND_KEY",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    to: "6281234567890",
    message: "Halo! Pesanan Anda sedang diproses.",
  }),
});
const data = await res.json();
console.log(data);`,
    python: `import requests

res = requests.post(
    "https://pintasend.satupintudigital.co.id/v1/messages",
    headers={
        "Authorization": "Bearer YOUR_PINTSEND_KEY",
        "Content-Type": "application/json"
    },
    json={
        "to": "6281234567890",
        "message": "Halo! Pesanan Anda sedang diproses."
    }
)
print(res.json())`,
  };

  function copyCode() {
    navigator.clipboard.writeText(snippets[tab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent/20 bg-accent/10 text-accent-bright">
            <Terminal size={18} />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-fg">Developer Quickstart</h2>
            <p className="text-xs text-fg-muted">Integrasikan pengiriman pesan via API v1.</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-xl border border-line bg-ink-2 p-1">
          {(["curl", "node", "python"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                tab === t ? "bg-surface text-fg shadow-sm" : "text-fg-faint hover:text-fg"
              }`}
            >
              {t === "curl" ? "cURL" : t === "node" ? "Node.js" : "Python"}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mt-4 overflow-hidden rounded-xl border border-line-soft bg-ink p-4">
        <button
          onClick={copyCode}
          className="absolute right-3 top-3 flex items-center gap-1.5 rounded-lg border border-line bg-surface/80 px-2 py-1 text-xs text-fg-muted backdrop-blur hover:bg-surface hover:text-fg"
        >
          {copied ? (
            <>
              <Check size={14} className="text-accent-bright" /> Disalin
            </>
          ) : (
            <>
              <Copy size={14} /> Salin
            </>
          )}
        </button>
        <pre className="overflow-x-auto font-mono text-xs text-fg-muted leading-relaxed">
          <code>{snippets[tab]}</code>
        </pre>
      </div>
    </div>
  );
}
