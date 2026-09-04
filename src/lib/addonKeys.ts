// ─── Addon keys — SINGLE SOURCE OF TRUTH ────────────────────────────────────
// Semua modul (route, tenantConfig, watermark, delay, campaigns, watermarkAddon)
// wajib impor key dari sini; dilarang literal string "random_delay" /
// "remove_watermark" / "campaign" tercecer di query.

/** Whitelist addon yang bisa di-grant/cabut platform admin (route addons). */
export const ADDON_KEYS = ["random_delay", "remove_watermark"] as const;
export type AddonKey = (typeof ADDON_KEYS)[number];

/** Key addon yang dikenal sistem (termasuk campaign — dibaca tenantConfig). */
export const KNOWN_ADDON_KEYS = ["random_delay", "remove_watermark", "campaign"] as const;

export const RANDOM_DELAY_ADDON_KEY = "random_delay" as const;
export const REMOVE_WATERMARK_ADDON_KEY = "remove_watermark" as const;
export const CAMPAIGN_ADDON_KEY = "campaign" as const;

export const ADDON_KEY_LABELS: Record<string, { label: string; desc: string }> = {
  random_delay: {
    label: "Random delay",
    desc: "Jeda acak 3–10 dtk antar kirim (anti-spam).",
  },
  remove_watermark: {
    label: "Remove watermark",
    desc: "Hapus footnote iklan dari pesan keluar tenant.",
  },
  campaign: {
    label: "Campaign",
    desc: "Modul blast massal WA Campaign.",
  },
};

/** Apakah string adalah addon yang bisa di-grant route platform. */
export function isGrantableAddonKey(key: string): key is AddonKey {
  return (ADDON_KEYS as readonly string[]).includes(key);
}
