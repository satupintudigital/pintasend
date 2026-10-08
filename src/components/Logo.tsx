import Image from "next/image";
import Link from "next/link";

/**
 * Wordmark resmi PintaSend — icon + teks dari development/logo-pintasend-ai-clean.png
 * (master light-theme; warna brand tetap biru/navy, tidak direkolor per surface).
 *
 * Aset di-tight-crop ke content bbox master + margin 4% (1247×400), jadi isi
 * logo mengisi ~93% tinggi kanvas — bukan ~65% seperti file berspadding lama.
 * Height attr wajib ikut rasio baru, kalau tidak Next Image menambah ruang kosong.
 *
 * `Logo` membungkus dengan link ke "/", `LogoMark` hanya gambarnya
 * (untuk ditempel dalam link sendiri, mis. header Docs yang punya badge).
 * Tinggi dikontrol lewat `className` (default "h-10 md:h-11"); lebar mengikuti aspek.
 */
export function LogoMark({
  className = "h-10 md:h-11",
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/pintasend.png"
      alt="PintaSend"
      width={1247}
      height={400}
      priority={priority}
      className={`w-auto transition-opacity duration-300 group-hover:opacity-75 ${className}`}
    />
  );
}

export function Logo({
  className = "h-10 md:h-11",
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
