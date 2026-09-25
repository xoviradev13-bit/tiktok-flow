import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import { authConfig } from "@/config/auth.config";
import { prisma } from "@/lib/prisma";

// OPTIMIZATION: Cache user lookups briefly to prevent DB slamming on every JWT call during navigation
export const userCache = new Map<string, { data: any; timestamp: number }>();
export const CACHE_TTL = 5000; // 5 seconds

export function clearUserCache(userId?: string) {
  if (userId) {
    userCache.delete(userId);
  } else {
    userCache.clear();
  }
}

const IS_PRODUCTION = process.env.APP_ENV === "production" || process.env.NODE_ENV === "production";
const SHARED_COOKIE_NAME = IS_PRODUCTION
  ? "__Secure-tiktokflow.session-token"
  : "tiktokflow.session-token";
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || (IS_PRODUCTION ? ".tiktokflow.site" : undefined);

export const authOptions: NextAuthConfig = {
  ...authConfig,
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  useSecureCookies: IS_PRODUCTION,

  cookies: {
    sessionToken: {
      name: SHARED_COOKIE_NAME,
      options: {
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure: IS_PRODUCTION,
        ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
      },
    },
  },

  pages: {
    signIn: "/signin",
    error: "/auth/error",
    verifyRequest: "/auth/verify-request",
  },

  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24h
  },

  debug: process.env.NODE_ENV === "development",

  callbacks: {
    // Cross-subdomain redirect handler (tiktokflow.site <-> app.tiktokflow.site)
    async redirect({ url, baseUrl }) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || (IS_PRODUCTION ? "https://app.tiktokflow.site" : baseUrl);

      // Relative path: e.g. "/accounts" -> "https://app.tiktokflow.site/accounts"
      if (url.startsWith("/")) {
        return `${appUrl}${url}`;
      }

      // Absolute URL: allow same origin, any tiktokflow.site subdomain, or local dev
      try {
        const parsed = new URL(url);
        if (
          parsed.origin === baseUrl ||
          parsed.hostname.endsWith("tiktokflow.site") ||
          parsed.hostname === "localhost" ||
          parsed.hostname === "127.0.0.1"
        ) {
          return url;
        }
      } catch {
        // Fallback on parse failure
      }

      return `${appUrl}/accounts`;
    },

    // Attach user & role to JWT
    async jwt({ token, user, account, trigger, session }) {
      if (user?.id) {
        token.id = user.id;
        token.name = user.name || (user.email ? user.email.split("@")[0] : token.name);
        token.role = (user as any).role || (user as any).userType || "STAFF";
        token.userType = token.role;
      }
      if (!token.id && token.sub) {
        token.id = token.sub;
      }
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }

      // Handle explicit session updates
      if (trigger === "update" && session && typeof session === "object") {
        const { user: _user, expires: _expires, ...sessionFields } = session as Record<string, unknown>;
        Object.assign(token, sessionFields);
        if (!token.id && token.sub) {
          token.id = token.sub;
        }
      }

      if (token.id) {
        const now = Date.now();
        const cached = userCache.get(token.id as string);

        let dbUser;
        if (cached && now - cached.timestamp < CACHE_TTL) {
          dbUser = cached.data;
        } else {
          dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: {
              id: true,
              role: true,
              isVerified: true,
              name: true,
              username: true,
              email: true,
              avatar: true,
              isActive: true,
              teamId: true,
              team: { select: { id: true, name: true, color: true } },
              leadingTeams: { select: { id: true, name: true, color: true } },
            },
          });
          if (dbUser) {
            userCache.set(token.id as string, { data: dbUser, timestamp: now });
          }
        }

        if (dbUser) {
          if (!dbUser.isActive) {
            token.isActive = false;
            token.error = "ACCOUNT_LOCKED";
            return {
              ...token,
              id: "",
              isActive: false,
              error: "ACCOUNT_LOCKED",
            };
          }
          token.isActive = true;
          token.error = undefined;
          token.name = dbUser.name || dbUser.username || (dbUser.email ? dbUser.email.split("@")[0] : token.name);
          token.role = dbUser.role ?? "STAFF";
          token.userType = dbUser.role ?? "STAFF";
          token.isVerified = dbUser.isVerified;
          const activeLedTeam = dbUser.leadingTeams?.[0] || dbUser.team || null;
          token.teamId = dbUser.teamId || activeLedTeam?.id || null;
          token.teamName = dbUser.team?.name || activeLedTeam?.name || null;
          token.ledTeam = activeLedTeam;
        }
      }

      return token;
    },

    async session({ session, token }) {
      // Account locked: return a minimal session carrying the error instead of
      // null, so the client (ProtectedLayout) can distinguish "locked" from a
      // plain logged-out state and redirect to /auth/error with an explanation
      // rather than silently bouncing to /signin.
      if ((token as any)?.error === "ACCOUNT_LOCKED") {
        return {
          ...session,
          user: undefined,
          error: "ACCOUNT_LOCKED",
        };
      }

      if (!(token?.id || token?.sub)) {
        return null as any;
      }

      if (token && session.user) {
        session.user.id = (token.id ?? token.sub) as string;
        session.user.name = (token.name as string) || session.user.name || (session.user.email ? session.user.email.split("@")[0] : "User");
        session.user.role = (token.role ?? token.userType ?? "STAFF") as string;
        session.user.userType = (token.role ?? token.userType ?? "STAFF") as string;
        session.user.isVerified = Boolean(token.isVerified);
        session.accessToken = token.accessToken as string;
        session.user.teamId = (token.teamId as string) || null;
        session.user.teamName = (token.teamName as string) || null;
        session.user.ledTeam = (token.ledTeam as any) || null;
      }
      return session;
    },

    async signIn({ user, account, profile }) {
      const email = (user?.email || (profile as any)?.email)?.toLowerCase().trim();
      if (!email) return false;

      // 1. Check if user already exists in DB
      const dbUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true, isActive: true, role: true },
      });

      if (dbUser) {
        if (!dbUser.isActive) {
          return "/auth/error?error=ACCOUNT_LOCKED";
        }
        return true;
      }

      // 2. If user does NOT exist, check if they have a valid invitation in the system
      const validInvite = await prisma.invitation.findFirst({
        where: {
          email: { equals: email, mode: "insensitive" },
          status: { in: ["PENDING", "ACCEPTED"] },
          expiresAt: { gt: new Date() },
        },
      });

      if (validInvite) {
        // User is invited, allow them to authenticate so /invite/accept can complete acceptance or handle account mismatch
        return true;
      }

      // 3. Neither user exists nor has valid invitation -> Block access
      return `/auth/error?error=InvitationRequired&email=${encodeURIComponent(email)}`;
    },
  },
};

export const {
  handlers: { GET, POST },
  signIn,
  signOut,
  auth,
} = NextAuth(authOptions);