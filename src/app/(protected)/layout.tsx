"use client";

import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AppFrame from "@/components/layout/AppFrame";
import AutoSyncRunner from "@/components/common/AutoSyncRunner";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status, update: updateSession } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;

    if (status === "unauthenticated") {
      // Session truly expired or user is logged out — redirect to login
      router.push("/login");
      return;
    }

    // status === "authenticated" but session data not yet hydrated
    // (e.g. post-redirect from another subdomain where the cookie is present
    // but the NextAuth client state hasn't been populated yet)
    if (!session) {
      updateSession();
    }
  }, [session, status, updateSession, router]);

  return (
    <AppFrame>
      <AutoSyncRunner />
      {children}
    </AppFrame>
  );
}
