import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Belum login → arahkan ke /login dengan callbackUrl.
  if (!req.auth && pathname.startsWith("/dashboard")) {
    const url = new URL("/login", req.url);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  // /api/auth TIDAK termasuk matcher: route handler [...nextauth] menangani
  // cookie csrf-nya sendiri. Membungkusnya di middleware (edge) memicu dua
  // Set-Cookie csrf berbeda → login gagal "MissingCSRF".
  matcher: ["/dashboard/:path*"],
};
