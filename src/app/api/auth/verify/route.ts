import { NextResponse } from "next/server";
import jwt, { TokenExpiredError } from "jsonwebtoken";
import { prisma } from "@/lib/prisma";
import { rejectIfExtAccessTyp } from "@/lib/extension-auth";

const JWT_SECRET = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  // Validate token presence
  if (!token || !JWT_SECRET) {
    return NextResponse.redirect(
      `${APP_URL}/auth/error?error=TOKEN_INVALID`
    );
  }

  try {
    // Verify token
    let decoded: {
      sub?: string;
      email: string;
      password?: string;
      name?: string;
      callbackUrl?: string;
      typ?: string;
    };
    try {
      decoded = jwt.verify(token, JWT_SECRET) as any;
    } catch (jwtError) {
      if (jwtError instanceof TokenExpiredError) {
        return NextResponse.redirect(
          `${APP_URL}/auth/error?error=TOKEN_EXPIRED`
        );
      }
      return NextResponse.redirect(
        `${APP_URL}/auth/error?error=TOKEN_INVALID`
      );
    }

    if (rejectIfExtAccessTyp(decoded)) {
      return NextResponse.redirect(
        `${APP_URL}/auth/error?error=TOKEN_INVALID`
      );
    }

    const callbackParam = decoded.callbackUrl
      ? `&callbackUrl=${encodeURIComponent(decoded.callbackUrl)}`
      : "";

    // Check if user exists (by sub ID or email)
    const existing = decoded.sub
      ? await prisma.user.findUnique({ where: { id: decoded.sub } })
      : await prisma.user.findUnique({ where: { email: decoded.email.toLowerCase().trim() } });

    if (existing) {
      if (existing.isVerified) {
        // User already verified, redirect to login with message
        return NextResponse.redirect(
          `${APP_URL}/signin?verified=already${callbackParam}`
        );
      }

      // Mark user as verified
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          isVerified: true,
          emailVerified: new Date(),
        },
      });

      // Close pending invitation
      const pendingInvite = await prisma.invitation.findFirst({
        where: {
          email: { equals: existing.email.toLowerCase().trim(), mode: "insensitive" },
          status: "PENDING",
        },
      });
      if (pendingInvite) {
        await prisma.invitation.update({
          where: { id: pendingInvite.id },
          data: {
            status: "ACCEPTED",
            acceptedAt: new Date(),
          },
        });
      }

      return NextResponse.redirect(
        `${APP_URL}/signin?verified=success${callbackParam}`
      );
    }

    // Backward-compatibility fallback for older in-flight tokens carrying password
    if (decoded.password) {
      const rawUsername = decoded.name?.trim() || decoded.email.split("@")[0];
      const pendingInvite = await prisma.invitation.findFirst({
        where: {
          email: { equals: decoded.email.toLowerCase().trim(), mode: "insensitive" },
          status: "PENDING",
        },
      });

      await prisma.user.create({
        data: {
          email: decoded.email.toLowerCase().trim(),
          username: rawUsername,
          name: rawUsername,
          password: decoded.password,
          isVerified: true,
          emailVerified: new Date(),
          role: pendingInvite?.role || "STAFF",
          teamId: pendingInvite?.teamId || null,
          isActive: true,
        },
      });

      if (pendingInvite) {
        await prisma.invitation.update({
          where: { id: pendingInvite.id },
          data: {
            status: "ACCEPTED",
            acceptedAt: new Date(),
          },
        });
      }

      return NextResponse.redirect(
        `${APP_URL}/signin?verified=success${callbackParam}`
      );
    }

    return NextResponse.redirect(
      `${APP_URL}/auth/error?error=TOKEN_INVALID`
    );

  } catch (error) {
    console.error("Verification error:", error);
    return NextResponse.redirect(
      `${APP_URL}/auth/error?error=INTERNAL_ERROR`
    );
  }
}