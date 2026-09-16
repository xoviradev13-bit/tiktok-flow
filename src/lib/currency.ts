/**
 * Multi-Currency Normalization & Real-time Exchange Rate Engine
 * Converts native TikTok Studio currencies (USD, GBP, EUR, VND) to USD or VND.
 */

export type DisplayCurrency = "USD" | "VND" | "GBP" | "EUR";

export interface ExchangeRates {
  USD_VND: number;
  GBP_USD: number;
  EUR_USD: number;
  rates?: Record<string, number>;
  lastUpdated: string;
  source: "live" | "cached" | "fallback";
}

export const DEFAULT_EXCHANGE_RATES: ExchangeRates = {
  USD_VND: 25400,
  GBP_USD: 1.28,
  EUR_USD: 1.08,
  rates: {
    USD: 1,
    VND: 25400,
    GBP: 0.78,
    EUR: 0.92,
    CAD: 1.36,
    AUD: 1.52,
    JPY: 154,
    BRL: 5.4,
    SGD: 1.34,
    THB: 36.5,
    MYR: 4.7,
    PHP: 57,
    IDR: 16200,
  },
  lastUpdated: new Date().toISOString(),
  source: "fallback",
};

/**
 * Normalizes symbols and currency codes to standard 3-letter ISO code
 */
export function normalizeCurrencyCode(raw?: string | null): string {
  if (!raw) return "USD";
  const clean = raw.trim();
  if (clean === "£" || clean.toUpperCase() === "GBP") return "GBP";
  if (clean === "€" || clean.toUpperCase() === "EUR") return "EUR";
  if (clean === "₫" || clean.toUpperCase() === "VND") return "VND";
  if (clean === "$" || clean.toUpperCase() === "USD") return "USD";
  if (clean === "C$" || clean.toUpperCase() === "CAD") return "CAD";
  if (clean === "A$" || clean.toUpperCase() === "AUD") return "AUD";
  if (clean === "¥" || clean.toUpperCase() === "JPY") return "JPY";
  if (clean === "R$" || clean.toUpperCase() === "BRL") return "BRL";
  if (clean === "S$" || clean.toUpperCase() === "SGD") return "SGD";
  if (clean.toUpperCase() === "RM" || clean.toUpperCase() === "MYR") return "MYR";
  if (clean === "₱" || clean.toUpperCase() === "PHP") return "PHP";
  if (clean === "฿" || clean.toUpperCase() === "THB") return "THB";
  if (clean.toUpperCase() === "RP" || clean.toUpperCase() === "IDR") return "IDR";
  return clean.toUpperCase();
}

/**
 * Converts an amount from any native currency into the target display currency (USD, VND, GBP, EUR)
 */
export function convertCurrency(
  amount: number,
  fromCurrency: string = "USD",
  targetCurrency: DisplayCurrency = "USD",
  rates: Partial<ExchangeRates> = DEFAULT_EXCHANGE_RATES
): number {
  if (isNaN(amount) || amount === 0) return 0;

  const usdVndRate = rates.USD_VND || DEFAULT_EXCHANGE_RATES.USD_VND;
  const gbpUsdRate = rates.GBP_USD || DEFAULT_EXCHANGE_RATES.GBP_USD;
  const eurUsdRate = rates.EUR_USD || DEFAULT_EXCHANGE_RATES.EUR_USD;
  const fullRates = rates.rates || DEFAULT_EXCHANGE_RATES.rates || {};

  const from = normalizeCurrencyCode(fromCurrency);

  // 1. First convert any source currency into USD benchmark
  let amountInUsd = amount;
  if (from === "USD") {
    amountInUsd = amount;
  } else if (from === "GBP") {
    amountInUsd = amount * gbpUsdRate;
  } else if (from === "EUR") {
    amountInUsd = amount * eurUsdRate;
  } else if (from === "VND") {
    amountInUsd = amount / usdVndRate;
  } else if (fullRates[from] && fullRates[from] > 0) {
    // Rates from open.er-api.com are [foreign currency] per 1 USD
    amountInUsd = amount / fullRates[from];
  }

  // 2. Convert USD benchmark to target display currency
  switch (targetCurrency) {
    case "USD":
      return Math.round(amountInUsd * 100) / 100;
    case "VND":
      return Math.round(amountInUsd * usdVndRate);
    case "GBP":
      return Math.round((amountInUsd / gbpUsdRate) * 100) / 100;
    case "EUR":
      return Math.round((amountInUsd / eurUsdRate) * 100) / 100;
    default:
      return Math.round(amountInUsd * 100) / 100;
  }
}

/**
 * Formats monetary amounts with appropriate symbols and regional conventions
 */
export function formatRevenue(
  amount: number,
  fromCurrency: string = "USD",
  targetCurrency: DisplayCurrency = "USD",
  options?: {
    compact?: boolean;
    hideSymbol?: boolean;
    rates?: Partial<ExchangeRates>;
  }
): string {
  const converted = convertCurrency(amount, fromCurrency, targetCurrency, options?.rates);

  if (targetCurrency === "VND") {
    if (options?.compact) {
      if (Math.abs(converted) >= 1_000_000_000) {
        return `${(converted / 1_000_000_000).toFixed(1)}B ₫`;
      }
      if (Math.abs(converted) >= 1_000_000) {
        return `${(converted / 1_000_000).toFixed(1)}M ₫`;
      }
      if (Math.abs(converted) >= 1_000) {
        return `${(converted / 1_000).toFixed(0)}K ₫`;
      }
    }
    const formatted = Math.round(converted).toLocaleString("vi-VN");
    return options?.hideSymbol ? formatted : `${formatted} ₫`;
  }

  if (targetCurrency === "GBP") {
    if (options?.compact) {
      if (Math.abs(converted) >= 1_000_000) {
        return `£${(converted / 1_000_000).toFixed(1)}M`;
      }
      if (Math.abs(converted) >= 1_000) {
        return `£${(converted / 1_000).toFixed(1)}K`;
      }
    }
    const formatted = converted.toLocaleString("en-GB", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return options?.hideSymbol ? formatted : `£${formatted}`;
  }

  if (targetCurrency === "EUR") {
    if (options?.compact) {
      if (Math.abs(converted) >= 1_000_000) {
        return `€${(converted / 1_000_000).toFixed(1)}M`;
      }
      if (Math.abs(converted) >= 1_000) {
        return `€${(converted / 1_000).toFixed(1)}K`;
      }
    }
    const formatted = converted.toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return options?.hideSymbol ? formatted : `€${formatted}`;
  }

  // Default USD formatting
  if (options?.compact) {
    if (Math.abs(converted) >= 1_000_000) {
      return `$${(converted / 1_000_000).toFixed(1)}M`;
    }
    if (Math.abs(converted) >= 1_000) {
      return `$${(converted / 1_000).toFixed(1)}K`;
    }
  }

  const formatted = converted.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return options?.hideSymbol ? formatted : `$${formatted}`;
}

/**
 * Fetches live exchange rates from open API or database cache
 */
export async function getOrSyncExchangeRates(
  prisma?: any,
  options?: { forceLive?: boolean }
): Promise<ExchangeRates> {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  // 1. Try reading from Database cache if prisma available and not forcing live
  if (prisma && !options?.forceLive) {
    try {
      const record = await prisma.systemConfig.findUnique({
        where: { key: "currency_exchange_rates" },
      });
      if (record && record.value) {
        const cached: ExchangeRates = JSON.parse(record.value);
        const lastUpdatedMs = new Date(cached.lastUpdated).getTime();
        if (!isNaN(lastUpdatedMs) && Date.now() - lastUpdatedMs < ONE_DAY_MS) {
          return { ...cached, source: "cached" };
        }
      }
    } catch (e) {
      console.warn("[Currency] Failed reading cached exchange rates:", e);
    }
  }

  // 2. Fetch fresh rates from free Open Exchange Rates API (open.er-api.com)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const rates = data?.rates || {};
      const usdVnd = typeof rates.VND === "number" && rates.VND > 10000 ? Math.round(rates.VND) : DEFAULT_EXCHANGE_RATES.USD_VND;
      const usdGbp = typeof rates.GBP === "number" && rates.GBP > 0 ? rates.GBP : 0.78;
      const usdEur = typeof rates.EUR === "number" && rates.EUR > 0 ? rates.EUR : 0.92;

      const freshRates: ExchangeRates = {
        USD_VND: usdVnd,
        GBP_USD: Math.round((1 / usdGbp) * 100) / 100,
        EUR_USD: Math.round((1 / usdEur) * 100) / 100,
        rates,
        lastUpdated: new Date().toISOString(),
        source: "live",
      };

      if (prisma) {
        await prisma.systemConfig.upsert({
          where: { key: "currency_exchange_rates" },
          create: {
            key: "currency_exchange_rates",
            value: JSON.stringify(freshRates),
            description: "Tỷ giá quy đổi tự động (USD, VND, GBP, EUR và 160+ tiền tệ)",
          },
          update: {
            value: JSON.stringify(freshRates),
            updatedAt: new Date(),
          },
        }).catch(() => {});
      }

      return freshRates;
    }
  } catch (err: any) {
    console.warn("[Currency] Could not fetch live exchange rates, using fallback:", err.message);
  }

  return DEFAULT_EXCHANGE_RATES;
}
