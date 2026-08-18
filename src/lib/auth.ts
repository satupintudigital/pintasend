import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { queryD1One } from "@/lib/d1";

declare module "next-auth" {
  interface User {
    role?: string;
    tenantId?: string;
  }
  interface Session {
    user: {
      id: string;
      role: string;
      tenantId: string;
    } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Diperlukan saat di belakang reverse proxy / Workers: Auth.js v5 menolak
  // host selain localhost-dev tanpa flag ini (error UntrustedHost).
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const user = await queryD1One<{
          id: string;
          tenantId: string;
          email: string;
          name: string;
          passwordHash: string;
          role: string;
          suspendedAt: string | null;
        }>(
          "SELECT u.id, u.tenantId, u.email, u.name, u.passwordHash, u.role, t.suspendedAt " +
            "FROM User u LEFT JOIN Tenant t ON u.tenantId = t.id WHERE u.email = ?",
          [email],
        );
        if (!user) return null;
        // Tenant nonaktif (suspended) → tolak login. Pesan generik ("Email atau
        // password salah") sengaja dipakai agar status akun tidak bocor.
        if (user.suspendedAt) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role ?? "owner";
        token.tenantId = user.tenantId;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.tenantId = token.tenantId as string;
      }
      return session;
    },
  },
});
