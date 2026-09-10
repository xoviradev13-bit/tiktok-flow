import { NextResponse } from "next/server";
import jwt, { TokenExpiredError } from "jsonwebtoken";
import { prisma } from "@/lib/prisma";
import { rejectIfExtAccessTyp } from "@/lib/extension-auth";

const JWT_SECRET = process.env.AUTH_SECRET || "default-secret";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  // Validate token presence
  if (!token) {
    return NextResponse.redirect(
      `${APP_URL}/auth/error?error=TOKEN_INVALID`
    );
  }

  try {
    // Verify token
    let decoded: { email: string; password: string; name?: string; callbackUrl?: string; typ?: string };
    try {
      decoded = jwt.verify(token, JWT_SECRET) as {
        email: string;
        password: string;
        name?: string;
        callbackUrl?: string;
        typ?: string;
      };
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

    // Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { email: decoded.email }
    });

    if (existing) {
      // User already verified, redirect to login with message
      return NextResponse.redirect(
        `${APP_URL}/signin?verified=already${callbackParam}`
      );
    }

    const rawUsername = decoded.name?.trim() || decoded.email.split("@")[0];

    // Check if there is an active pending invite
    const pendingInvite = await prisma.invitation.findFirst({
      where: {
        email: { equals: decoded.email.toLowerCase().trim(), mode: "insensitive" },
        status: "PENDING",
      },
    });

    // Create new user in PostgreSQL with user-defined username and invitation details
    await prisma.user.create({
      data: {
        email: decoded.email.toLowerCase().trim(),
        username: rawUsername,
        name: rawUsername,
        password: decoded.password,
        isVerified: true,
        role: pendingInvite?.role || "STAFF",
        groupId: pendingInvite?.groupId || null,
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

    // Redirect to login with success message & preserved callbackUrl
    return NextResponse.redirect(
      `${APP_URL}/signin?verified=success${callbackParam}`
    );

  } catch (error) {
    console.error("Verification error:", error);
    return NextResponse.redirect(
      `${APP_URL}/auth/error?error=INTERNAL_ERROR`
    );
  }
}