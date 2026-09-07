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
    user: {
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
  }
}
