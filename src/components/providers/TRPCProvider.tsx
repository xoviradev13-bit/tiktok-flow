'use client'
import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink, TRPCClientError } from '@trpc/client';
import { makeQueryClient } from '@/utils/trpc/trpcClient';
import type { AppRouter } from '@/trpc/root';
import superjson from 'superjson';
import { trpc } from "@/lib/trpc";
import { signOut } from 'next-auth/react';

interface TRPCProviderProps {
  children: React.ReactNode;
}

let browserQueryClient: QueryClient | undefined = undefined;

/**
 * Handles a 401/UNAUTHORIZED response from any API layer.
 * Signs the user out and redirects to /login with the current path as callbackUrl,
 * so they return to the same page after re-authenticating.
 */
async function handleUnauthorized() {
  const callbackUrl = encodeURIComponent(window.location.pathname + window.location.search);
  await signOut({ redirect: false });
  window.location.href = `/login?callbackUrl=${callbackUrl}`;
}

export function getQueryClient() {
  if (typeof window === 'undefined') {
    // Server: always make a new query client
    return makeQueryClient();
  } else {
    // Browser: make a new query client if we don't already have one
    // This is very important, so we don't re-make a new client if React
    // suspends during the initial render. This may not be needed if we
    // have a suspense boundary BELOW the creation of the query client
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient;
  }
}

function getUrl() {
  const base = (() => {
    if (typeof window !== "undefined") return "";
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    return "http://localhost:3000";
  })();

  return `${base}/api/trpc`;
}

export function TRPCProvider({ children }: TRPCProviderProps) {
  const [queryClient] = useState(() => {
    const client = getQueryClient();

    // Global 401 interceptor: any query/mutation returning UNAUTHORIZED
    // triggers a signOut and redirects to login with callbackUrl preserved.
    client.getQueryCache().config.onError = (error) => {
      if (error instanceof TRPCClientError && error.data?.code === 'UNAUTHORIZED') {
        handleUnauthorized();
      }
    };
    client.getMutationCache().config.onError = (error) => {
      if (error instanceof TRPCClientError && error.data?.code === 'UNAUTHORIZED') {
        handleUnauthorized();
      }
    };

    return client;
  });

  const trpcClient = createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: getUrl(),
        transformer: superjson,
      }),
    ],
  });

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
