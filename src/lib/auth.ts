import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import { authConfig } from "@/config/auth.config";
import { prisma } from "@/lib/prisma";

// OPTIMIZATION: Cache user lookups briefly to prevent DB slamming on every JWT call during navigation
const userCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5000; // 5 seconds

const IS_PRODUCTION = process.env.APP_ENV === "production";
const SHARED_COOKIE_NAME = IS_PRODUCTION
  ? "__Secure-tiktokflow.session-token"
  : "tiktokflow.session-token";

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
        ...(IS_PRODUCTION ? { domain: ".tiktokflow.com" } : {}),
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
    // Attach user & role to JWT
    async jwt({ token, user, account, trigger, session }) {
      if (user?.id) {
        token.id = user.id;
        token.name = user.name || (user.email ? user.email.split("@")[0] : token.name);
        token.role = (user as any).role || (user as any).userType || "ADMIN";
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
        const { user: _user, expires: _expires, ...sessionFields } = session as Record<
          string,
          unknown
        >;
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
            },
          });
          if (dbUser) {
            userCache.set(token.id as string, { data: dbUser, timestamp: now });
          }
        }

        if (dbUser) {
          token.name = dbUser.name || dbUser.username || (dbUser.email ? dbUser.email.split("@")[0] : token.name);
          token.role = dbUser.role ?? "STAFF";
          token.userType = dbUser.role ?? "STAFF";
          token.isVerified = dbUser.isVerified;
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = (token.id ?? token.sub) as string;
        session.user.name = (token.name as string) || session.user.name || (session.user.email ? session.user.email.split("@")[0] : "Admin");
        session.user.role = (token.role ?? token.userType ?? "ADMIN") as string;
        session.user.userType = (token.role ?? token.userType ?? "ADMIN") as string;
        session.user.isVerified = Boolean(token.isVerified);
        session.accessToken = token.accessToken as string;
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

      // 2. If user does NOT exist, check if they have a valid pending invitation
      const pendingInvite = await prisma.invitation.findFirst({
        where: {
          email: { equals: email, mode: "insensitive" },
          status: "PENDING",
          expiresAt: { gt: new Date() },
        },
      });

      if (pendingInvite) {
        // User is invited, allow them to authenticate so /invite/accept can complete acceptance
        return true;
      }

      // 3. Neither user exists nor has valid invitation -> Block access
      return "/auth/error?error=InvitationRequired";
    },
  },
};

export const {
  handlers: { GET, POST },
  signIn,
  signOut,
  auth,
} = NextAuth(authOptions);
