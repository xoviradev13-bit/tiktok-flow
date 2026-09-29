"use client";

import { useSession, type UpdateSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import AppFrame from "@/components/layout/AppFrame";
import AutoSyncRunner from "@/components/common/AutoSyncRunner";
import { AuthScreenSpinner } from "@/components/loading/AuthScreenSpinner";

const SESSION_HYDRATION_TIMEOUT_MS = 5000;

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status, update } = useSession();
  // next-auth types disallow authenticated+null; keep update callable in that runtime edge case
  const updateSession: UpdateSession = update;
  const hydrationAttempted = useRef(false);
  const [hydrationTimedOut, setHydrationTimedOut] = useState(false);

  const isAccountLocked = (session as any)?.error === "ACCOUNT_LOCKED";

  useEffect(() => {
    if (status === "loading") return;

    // Account locked mid-session: redirect to the error page, not /signin,
    // so the user gets an explanation instead of a bare sign-in form.
    if (isAccountLocked) {
      window.location.href = "/auth/error?error=ACCOUNT_LOCKED";
      return;
    }

    if (status === "unauthenticated") {
      // Route through force-signout so the stale JWT cookie is cleared server-side
      // before landing on /signin — otherwise the middleware sees isAuthenticated=true
      // and bounces the user back to /accounts.
      const callbackPath =
        typeof window !== "undefined" ? window.location.pathname + window.location.search : "";
      const dest = callbackPath ? encodeURIComponent(callbackPath) : encodeURIComponent("/accounts");
      window.location.href = `/api/auth/force-signout?callbackUrl=${dest}`;
      return;
    }

    // status === "authenticated" but session data not yet hydrated
    // (e.g. post-redirect from another subdomain where the cookie is present
    // but the NextAuth client state hasn't been populated yet)
    const hasSessionData = Boolean(session);
    if (status === "authenticated" && !hasSessionData && !hydrationAttempted.current) {
      hydrationAttempted.current = true;

      const timeoutId = window.setTimeout(() => {
        setHydrationTimedOut(true);
      }, SESSION_HYDRATION_TIMEOUT_MS);

      updateSession()
        .catch(() => {
          // swallow; timeout above (or the render guard) handles the failure path
        })
        .finally(() => {
          window.clearTimeout(timeoutId);
        });
    }
  }, [session, status, updateSession, isAccountLocked]);

  // Hydration attempt failed to produce a session within the timeout —
  // treat as unauthenticated rather than hanging forever.
  useEffect(() => {
    if (hydrationTimedOut) {
      const callbackPath =
        typeof window !== "undefined" ? window.location.pathname + window.location.search : "";
      const dest = callbackPath ? encodeURIComponent(callbackPath) : encodeURIComponent("/accounts");
      window.location.href = `/api/auth/force-signout?callbackUrl=${dest}`;
    }
  }, [hydrationTimedOut]);

  // Show a spinner while auth is resolving, redirecting, or hydrating,
  // so protected content/effects never flash for an unauthenticated user.
  if (status === "loading") return <AuthScreenSpinner />;
  if (isAccountLocked) return <AuthScreenSpinner />;
  if (status === "unauthenticated") return <AuthScreenSpinner />;
  if (status === "authenticated" && !session) return <AuthScreenSpinner />;
  if (hydrationTimedOut) return <AuthScreenSpinner />;

  return (
    <AppFrame>
      <AutoSyncRunner />
      {children}
    </AppFrame>
  );
}