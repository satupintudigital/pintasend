import { auth } from "@/lib/auth";
import { parsePrincipal, unauthorized } from "@/lib/abac";
import { listBotRules } from "@/lib/botRules";
import { BotRulePanel } from "@/components/dashboard/BotRulePanel";
import { Robot } from "@phosphor-icons/react/dist/ssr";

export const metadata = {
  title: "Auto-Reply Bot — Pintasend",
  description: "Kelola aturan auto-reply & keyword bot untuk WhatsApp tenant.",
};

export default async function BotRulesPage() {
  const session = await auth();
  const principal = parsePrincipal(session);
  if (!principal) {
    return unauthorized();
  }

  // Preload initial rules di server component
  let initialRules = [];
  try {
    initialRules = await listBotRules(principal.tenantId);
  } catch (e) {
    console.error("Gagal memuat bot rules di server:", e);
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-accent-bright font-mono text-xs uppercase tracking-[0.2em]">
          <Robot className="text-base" />
          <span>Automation</span>
        </div>
        <h1 className="mt-2 font-display text-3xl font-semibold leading-tight tracking-tight md:text-4xl text-fg">
          Auto-Reply Bot
        </h1>
        <p className="mt-2 text-sm text-fg-muted max-w-2xl">
          Otomatisasi balasan pesan WhatsApp berdasarkan keyword masuk. Bot akan mencocokkan pesan pelanggan secara real-time.
        </p>
      </div>

      <BotRulePanel />
    </div>
  );
}
