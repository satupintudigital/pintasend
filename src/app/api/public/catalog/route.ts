import { getPublicCatalog } from "@/lib/catalog";

// Katalog publik (Plan + Addon + harga platform) untuk halaman Pricing,
// Register, dan Checkout. Tanpa auth — hanya data harga, aman dipublikasikan.
// Cache singkat di CDN (s-maxage) supaya tidak membanjiri Neon.
export async function GET() {
  try {
    const catalog = await getPublicCatalog();
    return Response.json(
      { catalog },
      {
        headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=120" },
      },
    );
  } catch (e) {
    console.error("public/catalog GET:", e);
    return Response.json({ error: "Gagal memuat katalog harga" }, { status: 500 });
  }
}
