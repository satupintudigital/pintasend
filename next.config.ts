import type { NextConfig } from "next";

const securityHeaders = [
  // Cegah clickjacking.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  // MIME sniffing.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // HSTS — semua traffic harus HTTPS (termasuk subdomain).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Privasi referrer.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Batasi permission browser yang tidak dipakai.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
