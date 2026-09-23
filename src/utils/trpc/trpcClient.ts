"use client";
import { QueryClient } from "@tanstack/react-query";

export function makeQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // 30s: serve cached data on fast navigation, but post-sync freshness is
        // handled by the refreshData invalidation listeners on each page —
        // invalidate() bypasses staleTime and forces a refetch immediately.
        staleTime: 30 * 1000,
      },
    },
  });
  return queryClient;
}
