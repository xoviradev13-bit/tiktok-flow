import { DefaultSession, DefaultJWT } from "next-auth";
import { JWT } from "next-auth/jwt";

declare module "next-auth" {
  interface User {
    role?: string;
    userType?: string;
    isVerified?: boolean;
  }

  interface Session {
    accessToken?: string;
    // Set to "ACCOUNT_LOCKED" when the jwt callback detects dbUser.isActive === false.
    // When present, `user` is omitted — always check `error` before reading `user`.
    error?: "ACCOUNT_LOCKED";
    user?: {
      id: string;
      role?: string;
      userType?: string;
      isVerified?: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    accessToken?: string;
    role?: string;
    userType?: string;
    isVerified?: boolean;
    // Set to "ACCOUNT_LOCKED" in the jwt callback when the DB user is inactive.
    error?: "ACCOUNT_LOCKED";
  }
}