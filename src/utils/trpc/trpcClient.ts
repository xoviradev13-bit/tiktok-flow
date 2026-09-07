"use client";
import { QueryClient } from "@tanstack/react-query";

export function makeQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000, 
      },
    },
  });
  return queryClient;
}
