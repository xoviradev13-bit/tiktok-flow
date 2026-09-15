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
