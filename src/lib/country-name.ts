/** Map ISO / TikTok store-country codes to English country names. */

const CODE_TO_NAME: Record<string, string> = {
  us: "United States",
  gb: "United Kingdom",
  uk: "United Kingdom",
  vn: "Vietnam",
  de: "Germany",
  fr: "France",
  be: "Belgium",
  nl: "Netherlands",
  id: "Indonesia",
  th: "Thailand",
  my: "Malaysia",
  ph: "Philippines",
  sg: "Singapore",
  jp: "Japan",
  kr: "South Korea",
  br: "Brazil",
  mx: "Mexico",
  ca: "Canada",
  au: "Australia",
  nz: "New Zealand",
  in: "India",
  pk: "Pakistan",
  bd: "Bangladesh",
  eg: "Egypt",
  tr: "Turkey",
  ru: "Russia",
  es: "Spain",
  it: "Italy",
  pt: "Portugal",
  pl: "Poland",
  se: "Sweden",
  no: "Norway",
  dk: "Denmark",
  fi: "Finland",
  ch: "Switzerland",
  at: "Austria",
  ie: "Ireland",
  tw: "Taiwan",
  hk: "Hong Kong",
  cn: "China",
  sa: "Saudi Arabia",
  ae: "United Arab Emirates",
  za: "South Africa",
  ar: "Argentina",
  cl: "Chile",
  co: "Colombia",
  pe: "Peru",
  kh: "Cambodia",
  mm: "Myanmar",
  la: "Laos",
};

const LANG_ONLY = new Set([
  "vi", "en", "th", "id", "ms", "ja", "ko", "zh", "fr", "de", "es", "pt", "ru", "ar",
  "hi", "tr", "it", "pl", "nl", "sv", "ro", "uk", "cs", "hu", "el", "he", "bn", "fil",
]);

const NAME_ALIASES: Record<string, string> = {
  usa: "United States",
  "united states": "United States",
  america: "United States",
  "u.s.": "United States",
  "u.s.a.": "United States",
  uk: "United Kingdom",
  "united kingdom": "United Kingdom",
  britain: "United Kingdom",
  england: "United Kingdom",
  vietnam: "Vietnam",
  "viet nam": "Vietnam",
  "việt nam": "Vietnam",
  germany: "Germany",
  german: "Germany",
  belgium: "Belgium",
  france: "France",
  indonesia: "Indonesia",
  thailand: "Thailand",
  malaysia: "Malaysia",
  philippines: "Philippines",
  singapore: "Singapore",
  japan: "Japan",
  "south korea": "South Korea",
  korea: "South Korea",
  brazil: "Brazil",
  canada: "Canada",
  australia: "Australia",
};

function extractIsoCode(raw: string, fromStore = false): string | null {
  const s = String(raw || "").trim().toLowerCase().replace(/_/g, "-");
  if (!s) return null;
  if (/^[a-z]{2}$/.test(s)) {
    if (!fromStore && LANG_ONLY.has(s) && s !== "uk") return null;
    return s === "uk" ? "gb" : s;
  }
  if (/^[a-z]{2}-[a-z]{2}$/.test(s)) {
    const [a, b] = s.split("-");
    // vi-vn / vn-vi → vn
    if (LANG_ONLY.has(a) && !LANG_ONLY.has(b)) return b;
    if (!LANG_ONLY.has(a) || fromStore) return a === "uk" ? "gb" : a;
    if (!LANG_ONLY.has(b)) return b;
  }
  return null;
}

/** Normalize any country hint to an English country name (no language suffix). */
export function toCountryName(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (NAME_ALIASES[lower]) return NAME_ALIASES[lower];

  const code = extractIsoCode(trimmed, true);
  if (code && CODE_TO_NAME[code]) return CODE_TO_NAME[code];

  // Already a display name with spaces / capital letter
  if (
    /^[A-Za-z][A-Za-z .'-]+$/.test(trimmed) &&
    trimmed.length > 2 &&
    !/^[a-z]{2}(-[a-z]{2})?$/i.test(trimmed)
  ) {
    return trimmed.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return null;
}

export function isWeakCountryName(raw?: string | null): boolean {
  const name = (toCountryName(raw) || String(raw || "").trim()).toLowerCase();
  if (!name) return true;
  return (
    name === "us" ||
    name === "en" ||
    name === "vi" ||
    name === "united states" ||
    LANG_ONLY.has(name)
  );
}

export const COUNTRY_TO_CODE: Record<string, string> = {
  "united states": "US", "unitedstates": "US", "usa": "US", "us": "US", "mỹ": "US",
  "united kingdom": "UK", "unitedkingdom": "UK", "great britain": "UK", "britain": "UK", "england": "UK", "uk": "UK", "gb": "UK", "anh": "UK",
  "vietnam": "VN", "viet nam": "VN", "việt nam": "VN", "vn": "VN",
  "germany": "DE", "deutschland": "DE", "de": "DE", "đức": "DE",
  "france": "FR", "fr": "FR", "pháp": "FR",
  "belgium": "BE", "be": "BE", "bỉ": "BE",
  "netherlands": "NL", "nl": "NL", "hà lan": "NL",
  "indonesia": "ID", "id": "ID",
  "thailand": "TH", "th": "TH", "thái lan": "TH",
  "malaysia": "MY", "my": "MY",
  "philippines": "PH", "ph": "PH",
  "singapore": "SG", "sg": "SG",
  "japan": "JP", "jp": "JP", "nhật bản": "JP",
  "south korea": "KR", "korea": "KR", "kr": "KR", "hàn quốc": "KR",
  "brazil": "BR", "br": "BR",
  "mexico": "MX", "mx": "MX",
  "canada": "CA", "ca": "CA",
  "australia": "AU", "au": "AU",
  "spain": "ES", "es": "ES",
  "italy": "IT", "it": "IT",
  "taiwan": "TW", "tw": "TW",
  "hong kong": "HK", "hk": "HK",
};

export function toStandardCountryCode(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim().toLowerCase();
  if (COUNTRY_TO_CODE[trimmed]) return COUNTRY_TO_CODE[trimmed];
  if (/^[a-z]{2}$/.test(trimmed)) return trimmed === "gb" ? "UK" : trimmed.toUpperCase();
  return null;
}

export function detectCountryFromText(text?: string | null): string | null {
  if (!text) return null;
  const s = String(text).replace(/[_\-\.]+/g, " ");
  if (/\b(uk|gb|united\s*kingdom|great\s*britain|anh)\b/i.test(s)) return "UK";
  if (/\b(vn|vietnam|việt\s*nam)\b/i.test(s)) return "VN";
  if (/\b(de|germany|deutschland|đức)\b/i.test(s)) return "DE";
  if (/\b(fr|france|pháp)\b/i.test(s)) return "FR";
  if (/\b(us|usa|united\s*states|mỹ)\b/i.test(s)) return "US";
  if (/\b(th|thailand|thái\s*lan)\b/i.test(s)) return "TH";
  if (/\b(id|indonesia)\b/i.test(s)) return "ID";
  if (/\b(ph|philippines)\b/i.test(s)) return "PH";
  if (/\b(my|malaysia)\b/i.test(s)) return "MY";
  if (/\b(sg|singapore)\b/i.test(s)) return "SG";
  if (/\b(jp|japan|nhật\s*bản)\b/i.test(s)) return "JP";
  if (/\b(kr|korea|hàn\s*quốc)\b/i.test(s)) return "KR";
  if (/\b(br|brazil)\b/i.test(s)) return "BR";
  return null;
}

export function detectCountryFromCurrency(cur?: string | null): string | null {
  if (!cur) return null;
  const c = String(cur).trim().toUpperCase();
  switch (c) {
    case "£": case "GBP": return "UK";
    case "₫": case "VND": return "VN";
    case "€": case "EUR": return "DE";
    case "R$": case "BRL": return "BR";
    case "RP": case "IDR": return "ID";
    case "₱": case "PHP": return "PH";
    case "RS": case "PKR": return "PK";
    case "₽": case "RUB": return "RU";
    case "৳": case "BDT": return "BD";
    case "EGP": return "EG";
    case "¥": case "JPY": return "JP";
    case "₩": case "KRW": return "KR";
    case "฿": case "THB": return "TH";
    case "RM": case "MYR": return "MY";
    case "₺": case "TRY": return "TR";
    case "$": case "USD": return "US";
    default: return null;
  }
}
