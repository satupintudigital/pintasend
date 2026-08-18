import Image from "next/image";
import Link from "next/link";

/**
 * Wordmark resmi Wavio — icon + teks dari development/logo-wavio.png
 * (varian light-on-dark: teks direkolor ke --color-fg agar terbaca di tema gelap).
 *
 * `Logo` membungkus dengan link ke "/", `LogoMark` hanya gambarnya
 * (untuk ditempel dalam link sendiri, mis. header Docs yang punya badge).
 * Tinggi dikontrol lewat `className` (mis. "h-8"); lebar mengikuti aspek.
 */
export function LogoMark({
  className = "h-8",
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/logo-wavio.png"
      alt="Wavio"
      width={720}
      height={274}
      priority={priority}
      className={`w-auto transition-opacity duration-300 group-hover:opacity-75 ${className}`}
    />
  );
}

export function Logo({
  className = "h-8",
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Link href="/" className="group inline-flex shrink-0 items-center">
      <LogoMark className={className} priority={priority} />
    </Link>
  );
}
