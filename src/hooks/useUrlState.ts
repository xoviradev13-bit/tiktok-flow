"use client";

import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";

/**
 * Standard SaaS URL Query State Helper (Linear, Stripe, GitHub, Vercel):
 * - Keeps URLs concise and clean.
 * - Automatically removes default / empty / "ALL" values.
 * - Uses window.history.replaceState to avoid polluting browser back-history.
 * - Non-destructive, instant updates without full-page reloads.
 */
export function useUrlParams() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const getParam = useCallback(
    (key: string, fallback = ""): string => {
      return searchParams?.get(key) ?? fallback;
    },
    [searchParams]
  );

  const getNumberParam = useCallback(
    (key: string, fallback: number): number => {
      const val = searchParams?.get(key);
      if (!val) return fallback;
      const num = Number(val);
      return isNaN(num) ? fallback : num;
    },
    [searchParams]
  );

  const updateUrlParams = useCallback(
    (
      updates: Record<string, string | number | boolean | undefined | null>,
      defaults: Record<string, string | number | boolean | undefined | null> = {}
    ) => {
      if (typeof window === "undefined") return;

      const params = new URLSearchParams(window.location.search);

      Object.entries(updates).forEach(([key, val]) => {
        const defaultVal = defaults[key];
        const isDefault = defaultVal !== undefined && String(val) === String(defaultVal);

        if (
          val === undefined ||
          val === null ||
          val === "" ||
          val === "ALL" ||
          isDefault
        ) {
          params.delete(key);
        } else {
          params.set(key, String(val));
        }
      });

      const searchStr = params.toString();
      const newUrl = searchStr ? `${pathname}?${searchStr}` : pathname;
      window.history.replaceState(null, "", newUrl);
    },
    [pathname]
  );

  return {
    searchParams,
    pathname,
    router,
    getParam,
    getNumberParam,
    updateUrlParams,
  };
}
