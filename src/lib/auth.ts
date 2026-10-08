import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { queryD1One } from "@/lib/d1";
import { cookies } from "next/headers";

declare module "next-auth" {
  interface User {
    role?: string;
    tenantId?: string;
    impersonatedTenantId?: string | null;
    originalAdminRole?: string | null;
  }
  interface Session {
    user: {
      id: string;
      role: string;
      tenantId: string;
      impersonatedTenantId?: string | null;
      originalAdminRole?: string | null;
    } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
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
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role ?? "owner";
        token.tenantId = user.tenantId;
      }
      // Check cookies for impersonation if request context allows
      try {
        const cookieStore = await cookies();
        const impCookie = cookieStore.get("impersonatedTenantId")?.value;
        const origRole = (token.originalAdminRole as string) || (token.role === "platform_admin" ? "platform_admin" : null);

        if (origRole === "platform_admin" || token.role === "platform_admin") {
          if (impCookie) {
            token.impersonatedTenantId = impCookie;
            token.originalAdminRole = "platform_admin";
            token.tenantId = impCookie;
            token.role = "owner"; // impersonated tenant owner view
          } else {
            // Restore original platform_admin role when cookie is deleted or empty
            token.impersonatedTenantId = null;
            if (token.originalAdminRole === "platform_admin") {
              token.role = "platform_admin";
            }
            token.originalAdminRole = null;
          }
        }
      } catch {
        // cookies not available in certain contexts
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.impersonatedTenantId ? "owner" : token.role) as string;
        session.user.tenantId = (token.impersonatedTenantId || token.tenantId) as string;
        session.user.impersonatedTenantId = token.impersonatedTenantId as string | null;
        session.user.originalAdminRole = token.originalAdminRole as string | null;
      }
      return session;
    },
  },
});
