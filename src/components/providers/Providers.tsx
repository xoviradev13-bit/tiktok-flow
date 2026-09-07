"use client";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";
import { TRPCProvider } from "./TRPCProvider";
import { ReduxProvider } from "./ReduxProvider";
import { ThemeProvider } from "./ThemeProvider";
import { SidebarProvider } from "./SidebarProvider";
import { type Session } from "next-auth";

export default function Providers({
  children,
  session,
}: {
  children: React.ReactNode;
  session: Session | null;
}) {
  return (
    <>
      <ThemeProvider>
        <SidebarProvider>
          <SessionProvider
            refetchInterval={0}
            refetchOnWindowFocus={false}
            session={session}
          >
            <ReduxProvider>
              <TRPCProvider>{children}</TRPCProvider>
            </ReduxProvider>
          </SessionProvider>
        </SidebarProvider>
      </ThemeProvider>
      <Toaster position="bottom-center" />
    </>
  );
}
