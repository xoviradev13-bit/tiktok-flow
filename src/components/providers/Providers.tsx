"use client";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";
import { TRPCProvider } from "./TRPCProvider";
import { ReduxProvider } from "./ReduxProvider";
import { ThemeProvider } from "./ThemeProvider";
import { ColorThemeProvider } from "@/components/theme/ColorThemeProvider";
import { SidebarProvider } from "./SidebarProvider";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
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
        <ColorThemeProvider>
          <CurrencyProvider>
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
          </CurrencyProvider>
        </ColorThemeProvider>
      </ThemeProvider>
      <Toaster position="bottom-center" />
    </>
  );
}
