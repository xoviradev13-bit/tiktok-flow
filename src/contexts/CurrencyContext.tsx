"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  DisplayCurrency,
  ExchangeRates,
  DEFAULT_EXCHANGE_RATES,
  convertCurrency,
  formatRevenue as formatRevenueUtil,
} from "@/lib/currency";

interface CurrencyContextType {
  currency: DisplayCurrency;
  setCurrency: (c: DisplayCurrency) => void;
  rates: ExchangeRates;
  isLiveRates: boolean;
  refreshRates: () => Promise<void>;
  ratesLastFetched: string | null;
  formatRevenue: (
    amount: number | string | null | undefined,
    fromCurrency?: string | null,
    options?: { compact?: boolean; hideSymbol?: boolean }
  ) => string;
  formatAmount: (
    amount: number | string | null | undefined,
    fromCurrency?: string | null,
    options?: { compact?: boolean; hideSymbol?: boolean }
  ) => string;
  convertAmount: (amount: number | string | null | undefined, fromCurrency?: string | null) => number;
  convertToActive: (amount: number | string | null | undefined, fromCurrency?: string | null) => number;
}

const CurrencyContext = createContext<CurrencyContextType>({
  currency: "USD",
  setCurrency: () => {},
  rates: DEFAULT_EXCHANGE_RATES,
  isLiveRates: false,
  refreshRates: async () => {},
  ratesLastFetched: null,
  formatRevenue: (amt) => (amt ? `$${Number(amt).toFixed(2)}` : "$0.00"),
  formatAmount: (amt) => (amt ? `$${Number(amt).toFixed(2)}` : "$0.00"),
  convertAmount: (amt) => Number(amt || 0),
  convertToActive: (amt) => Number(amt || 0),
});

const STORAGE_KEY = "app_display_currency";

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<DisplayCurrency>("USD");
  const [rates, setRates] = useState<ExchangeRates>(DEFAULT_EXCHANGE_RATES);
  const [isLiveRates, setIsLiveRates] = useState<boolean>(false);
  const [ratesLastFetched, setRatesLastFetched] = useState<string | null>(null);

  // Initialize from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as DisplayCurrency | null;
      if (saved && ["USD", "VND", "GBP", "EUR"].includes(saved)) {
        setCurrencyState(saved);
      }
    } catch {
      // localStorage not available
    }
  }, []);

  const refreshRates = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const res = await fetch("https://open.er-api.com/v6/latest/USD", {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        const r = data?.rates || {};
        const usdVnd = typeof r.VND === "number" && r.VND > 10000 ? Math.round(r.VND) : DEFAULT_EXCHANGE_RATES.USD_VND;
        const usdGbp = typeof r.GBP === "number" && r.GBP > 0 ? r.GBP : 0.78;
        const usdEur = typeof r.EUR === "number" && r.EUR > 0 ? r.EUR : 0.92;

        const freshRates: ExchangeRates = {
          USD_VND: usdVnd,
          GBP_USD: Math.round((1 / usdGbp) * 100) / 100,
          EUR_USD: Math.round((1 / usdEur) * 100) / 100,
          rates: r,
          lastUpdated: new Date().toISOString(),
          source: "live",
        };
        setRates(freshRates);
        setIsLiveRates(true);
        setRatesLastFetched(freshRates.lastUpdated);
      }
    } catch {
      // Fallback stays in place
    }
  }, []);

  useEffect(() => {
    refreshRates();
  }, [refreshRates]);

  const setCurrency = useCallback((newCurrency: DisplayCurrency) => {
    setCurrencyState(newCurrency);
    try {
      localStorage.setItem(STORAGE_KEY, newCurrency);
      window.dispatchEvent(new CustomEvent("appCurrencyChange", { detail: newCurrency }));
    } catch {}
  }, []);

  // Sync across tabs/windows
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue && ["USD", "VND", "GBP", "EUR"].includes(e.newValue)) {
        setCurrencyState(e.newValue as DisplayCurrency);
      }
    };
    const handleCustom = (e: any) => {
      if (e.detail && ["USD", "VND", "GBP", "EUR"].includes(e.detail)) {
        setCurrencyState(e.detail as DisplayCurrency);
      }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("appCurrencyChange", handleCustom);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("appCurrencyChange", handleCustom);
    };
  }, []);

  const formatRevenue = useCallback(
    (
      amount: number | string | null | undefined,
      fromCurrency?: string | null,
      options?: { compact?: boolean; hideSymbol?: boolean }
    ) => {
      const num = typeof amount === "string" ? parseFloat(amount) : Number(amount || 0);
      return formatRevenueUtil(num, fromCurrency || "USD", currency, {
        ...options,
        rates,
      });
    },
    [currency, rates]
  );

  const convertAmount = useCallback(
    (amount: number | string | null | undefined, fromCurrency?: string | null) => {
      const num = typeof amount === "string" ? parseFloat(amount) : Number(amount || 0);
      return convertCurrency(num, fromCurrency || "USD", currency, rates);
    },
    [currency, rates]
  );

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        setCurrency,
        rates,
        isLiveRates,
        refreshRates,
        ratesLastFetched,
        formatRevenue,
        formatAmount: formatRevenue,
        convertAmount,
        convertToActive: convertAmount,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error("useCurrency must be used within a CurrencyProvider");
  }
  return context;
}
