// ─── Katalog publik (halaman harga & checkout) ──────────────────────────────
// Sumber data: tabel Plan + Addon + PlatformSetting. Dipakai di endpoint
// /api/public/catalog (tanpa auth), halaman Pricing, Register, dan Checkout.
// Harga dihitung server-side dari katalog — jangan pernah percaya client.

import { query } from "@/lib/db";
import { getPlatformSetting } from "@/lib/platformSettings";

export interface PublicPlan {
  id: string;
  name: string;
  tagline: string;
  kind: string; // "subscription" | "prepaid"
  priceMonthly: number | null;
  pricePerMessage: number | null; // hanya untuk kind=prepaid
  maxMessagesPerMonth: number | null;
  features: string[];
}

export interface PublicAddon {
  key: string;
  name: string;
  tagline: string;
  priceMonthly: number | null;
}

export interface PublicCatalogSettings {
  activationFeeRp: number;
  creditPerMessageRp: number;
  creditMinTopupRp: number;
  orderExpiryMinutes: number;
}

export interface PublicCatalog {
  plans: PublicPlan[];
  addons: PublicAddon[];
  settings: PublicCatalogSettings;
}

/** Fitur statis per kartu plan (teks landing; dikelompokkan per nama plan). */
export function getPlanFeatures(planName: string): string[] {
  const name = planName.trim().toLowerCase();
  if (name === "espresso") {
    return [
      "Bayar sesuai pemakaian",
      "1 perangkat WhatsApp",
      "3 user",
      "Tanpa biaya bulanan",
    ];
  }
  if (name === "latte") {
    return [
      "500 pesan/bulan",
      "3 perangkat WhatsApp",
      "5 user",
      "Biaya aktivasi sekali",
    ];
  }
  if (name === "mocha") {
    return [
      "Unlimited pesan",
      "10 perangkat WhatsApp",
      "20 user",
      "Random delay gratis",
      "Biaya aktivasi sekali",
    ];
  }
  return [];
}

export async function getPublicCatalog(): Promise<PublicCatalog> {
  const planRows = await query<{
    id: string;
    name: string;
    tagline: string;
    kind: string;
    priceMonthly: number | null;
    maxMessagesPerMonth: number | null;
  }>(
    'SELECT id, name, tagline, kind, "priceMonthly", "maxMessagesPerMonth" FROM "Plan" ' +
      'WHERE "isActive" = true AND "isPublic" = true ORDER BY "sortOrder" ASC, name ASC',
  );
  const addonRows = await query<{
    key: string;
    name: string;
    tagline: string;
    priceMonthly: number | null;
  }>(
    'SELECT key, name, tagline, "priceMonthly" FROM "Addon" WHERE "isActive" = true ORDER BY name ASC',
  );
  const num = async (k: string, d: number) => {
    const v = await getPlatformSetting(k);
    return typeof v === "number" ? v : d;
  };
  const settings: PublicCatalogSettings = {
    activationFeeRp: await num("activation_fee_rp", 350000),
    creditPerMessageRp: await num("credit_price_per_message", 400),
    creditMinTopupRp: await num("credit_min_topup_rp", 20000),
    orderExpiryMinutes: await num("order_expiry_minutes", 1440),
  };
  return {
    plans: planRows.map((p) => ({
      ...p,
      pricePerMessage: p.kind === "prepaid" ? settings.creditPerMessageRp : null,
      features: getPlanFeatures(p.name),
    })),
    addons: addonRows,
    settings,
  };
}