// TikTokFlow Companion - Content Script
// Injected into TikTok & TikTok Studio pages to detect live login status & all 4 metric groups

// ─── MAIN-world → ISOLATED-world bridge ─────────────────────────────────────
// main_world_intercept.js (MAIN world) fires these events after capturing API
// responses. We receive them here and store in chrome.storage.session so the
// service worker can read fresh m10n / per-post data without re-fetching.
(function bridgeApiCapture() {
  const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

  window.addEventListener("tiktokflow:api_capture", (e) => {
    const { type, data, ts } = e.detail || {};
    if (!type || !data) return;
    chrome.storage.session.get("tiktokflow_api_cache").then((result) => {
      const cache = result.tiktokflow_api_cache || {};
      // For per_post, accumulate pages; for everything else, replace.
      if (type === "per_post") {
        const existing = cache.per_post?.items ?? [];
        const incoming = data?.data?.video_analytics_video_list ?? [];
        // Merge by video_id to avoid duplicates
        const merged = [...existing];
        for (const item of incoming) {
          if (!merged.some((x) => x.video_id === item.video_id)) merged.push(item);
        }
        cache.per_post = { items: merged, ts };
      } else {
        cache[type] = { data, ts };
      }
      return chrome.storage.session.set({ tiktokflow_api_cache: cache });
    }).catch(() => {});
  });
})();
// ────────────────────────────────────────────────────────────────────────────

(function () {
  let lastReportedDataHash = "";
  let isScanning = false;
  let cachedHandle = null;
  let lastSuccessfulReportAt = 0; // used by adaptive poll loop to reset backoff on activity


  // FIX: identity cache — nickname/avatar never change, so stop refetching the
  // full TikTok profile HTML on every scan.
  const IDENTITY_CACHE_KEY = "ttfOwnIdentityCache";
  const IDENTITY_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

  // Read previously cached handle from storage on init
  try {
    chrome.storage.local.get(["cachedTikTokHandle", "latestAccount"], (items) => {
      if (items && items.cachedTikTokHandle) {
        cachedHandle = items.cachedTikTokHandle;
      } else if (items && items.latestAccount && items.latestAccount.username) {
        cachedHandle = items.latestAccount.username;
      }
    });
  } catch (e) { }

  // Helpers
  // FIX: shared localized-number parser. Previously `parseMoney` used
  // `.replace(",", ".")` which only replaced the FIRST comma — turning
  // "$1,234.56" into "1.234" (off by a factor of a thousand).
  function parseLocalizedNumber(raw) {
    if (raw === null || raw === undefined) return 0;
    if (typeof raw === "number") return isFinite(raw) ? raw : 0;
    let s = String(raw).trim();
    if (!s) return 0;

    // Normalize Arabic decimal/thousands marks before stripping.
    s = s.replace(/\u066B/g, ".").replace(/\u066C/g, ",");

    // Keep only digits, dots, commas, and a leading minus.
    const neg = /^-/.test(s);
    s = s.replace(/[^0-9.,]/g, "");
    if (!s) return 0;

    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");

    let normalized;
    if (lastDot === -1 && lastComma === -1) {
      normalized = s;
    } else if (lastDot > lastComma) {
      // US style: dots are decimal, commas are thousands.
      normalized = s.replace(/,/g, "");
    } else if (lastComma > lastDot) {
      // EU style: commas are decimal, dots are thousands.
      normalized = s.replace(/\./g, "").replace(",", ".");
    } else {
      // Only one type of separator.
      const sepIdx = Math.max(lastDot, lastComma);
      const sepChar = lastDot === sepIdx ? "." : ",";
      const after = s.length - sepIdx - 1;
      const digitCount = s.replace(/[^0-9]/g, "").length;
      // "1,234" → thousands. "0,25" → decimal.
      if (after === 3 && digitCount > 3) {
        normalized = s.replace(/[.,]/g, "");
      } else {
        normalized = s
          .replace(sepChar === "." ? /,/g : /\./g, "")
          .replace(",", ".");
      }
    }

    const n = parseFloat(normalized);
    if (!isFinite(n)) return 0;
    return neg ? -n : n;
  }

  function parseNum(str) {
    if (!str) return 0;
    let s = String(str).trim();

    // 1. Digits mapping across all 57 language scripts:
    // Arabic-Indic, Eastern Arabic/Urdu, Bengali, Devanagari (Hindi), Thai, Myanmar, Khmer
    const scriptDigits = [
      ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"], // Arabic
      ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"], // Urdu/Persian
      ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"], // Bengali
      ["०", "१", "२", "३", "४", "५", "६", "७", "८", "९"], // Devanagari (Hindi)
      ["๐", "๑", "๒", "๓", "๔", "๕", "๖", "๗", "๘", "๙"], // Thai
      ["၀", "၁", "၂", "၃", "၄", "၅", "၆", "၇", "၈", "၉"], // Myanmar
      ["០", "១", "២", "៣", "៤", "៥", "៦", "៧", "៨", "៩"], // Khmer
    ];

    for (const digitSet of scriptDigits) {
      for (let i = 0; i < 10; i++) {
        s = s.split(digitSet[i]).join(String(i));
      }
    }

    // Normalize Unicode decimal/thousands separators
    s = s.replace(/\u066B/g, ".").replace(/\u066C/g, ",");
    s = s.toLowerCase();

    // Multiplier scanning for all 57 languages
    let multiplier = 1;

    // Trillions / Billions / Crore / 亿 / 億 / 억
    if (/(?:^|[\s\d.,])(t|trillion|b|billion|млрд|tỷ|ty|مليار|কোটি|করোড়|করোড়|crore|หมื่นล้าน|亿|億|억)(?:[\s.,]|$)/iu.test(s)) {
      multiplier = 1000000000;
    }
    // Millions / ล้าน / သန်း / លាន / млн / jt / tr
    else if (/(?:^|[\s\d.,])(m|million|млн|jt|tr|مليون|মি|মিলিয়ন|নিঝুত|ล้าน|သန်း|លាន|millon|milhões)(?:[\s.,]|$)/iu.test(s)) {
      multiplier = 1000000;
    }
    // Lakh (100,000)
    else if (/(?:^|[\s\d.,])(lakh|লাখ|लाख|แสน|သိန်း|សែន)(?:[\s.,]|$)/iu.test(s)) {
      multiplier = 100000;
    }
    // Myriad (10,000) - 万 / 萬 / 만 / หมื่น / သောင်း / ម៉ឺន
    else if (/(?:^|[\s\d.,])(万|萬|만|หมื่น|သောင်း|ម៉ឺន)(?:[\s.,]|$)/iu.test(s)) {
      multiplier = 10000;
    }
    // Thousands - K, тыс, тис, rb, mil, ألف, হাজার, हज़ार, พัน, ထောင်, ពាន់, хил, tsd, bin
    else if (/(?:^|[\s\d.,])(k|thousand|тыс|тыс\.|тис|тис\.|rb|mil|ألف|হাজার|हज़ार|พัน|ထောင်|ពាន់|хил|kilo|tūkst|tūst|tsd|tsd\.|bin)(?:[\s.,]|$)/iu.test(s)) {
      multiplier = 1000;
    }

    if (multiplier > 1) {
      const match = s.match(/([0-9]+(?:[.,][0-9]+)?)/);
      if (match) {
        // FIX: use the localized parser for multiplier values too (handles
        // "1,5M" → 1.5M correctly, not "1.5M" → 15).
        const val = parseLocalizedNumber(match[1]);
        return Math.round(val * multiplier);
      }
    }

    // Standard clean integer
    const clean = s.replace(/[^0-9]/g, "");
    return parseInt(clean, 10) || 0;
  }

  function parseMoney(str) {
    if (!str) return 0;
    let s = String(str).trim();
    const arabicDigits = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
    const urduDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
    const bengaliDigits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
    for (let i = 0; i < 10; i++) {
      s = s.split(arabicDigits[i]).join(String(i))
        .split(urduDigits[i]).join(String(i))
        .split(bengaliDigits[i]).join(String(i));
    }
    // FIX: use the shared localized parser (handles "1,234.56", "1.234,56",
    // and "₫1.250.000" correctly).
    return parseLocalizedNumber(s);
  }

  function detectCurrency(text) {
    if (!text) return "$";
    if (text.includes("£") || /\bGBP\b/i.test(text)) return "£";
    if (text.includes("€") || /\bEUR\b/i.test(text)) return "€";
    if (text.includes("₫") || /\bVND\b/i.test(text)) return "₫";
    if (text.includes("R$") || /\bBRL\b/i.test(text)) return "R$";
    if (text.includes("Rp") || /\bIDR\b/i.test(text)) return "Rp";
    if (text.includes("₱") || /\bPHP\b/i.test(text)) return "₱";
    if (text.includes("Rs") || /\bPKR\b/i.test(text)) return "Rs";
    if (text.includes("₽") || /\bRUB\b/i.test(text)) return "₽";
    if (text.includes("৳") || /\bBDT\b/i.test(text)) return "৳";
    if (text.includes("EGP") || text.includes("ج.م")) return "EGP";
    if (text.includes("¥") || /\bJPY\b/i.test(text)) return "¥";
    if (text.includes("₩") || /\bKRW\b/i.test(text)) return "₩";
    if (text.includes("฿") || /\bTHB\b/i.test(text)) return "฿";
    if (text.includes("RM") || /\bMYR\b/i.test(text)) return "RM";
    if (text.includes("₺") || /\bTRY\b/i.test(text)) return "₺";
    return "$";
  }

  function detectCountryFromCurrency(currency) {
    switch (currency) {
      case "£": return "United Kingdom";
      case "€": return "Germany";
      case "₫": return "Vietnam";
      case "R$": return "Brazil";
      case "Rp": return "Indonesia";
      case "₱": return "Philippines";
      case "Rs": return "Pakistan";
      case "₽": return "Russia";
      case "৳": return "Bangladesh";
      case "EGP": return "Egypt";
      case "¥": return "Japan";
      case "₩": return "South Korea";
      case "฿": return "Thailand";
      case "RM": return "Malaysia";
      case "₺": return "Turkey";
      default: return null;
    }
  }

  /** UI / BCP47 language codes — never treat these alone as market country. */
  const LANG_ONLY = new Set([
    "vi", "en", "th", "id", "ms", "ja", "ko", "zh", "fr", "de", "es", "pt", "ru", "ar",
    "hi", "tr", "it", "pl", "nl", "sv", "ro", "uk", "cs", "hu", "el", "he", "bn", "fil",
  ]);

  const CODE_TO_COUNTRY_NAME = {
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
    ch: "Switzerland",
    at: "Austria",
    ie: "Ireland",
    tw: "Taiwan",
    hk: "Hong Kong",
    kh: "Cambodia",
    mm: "Myanmar",
    la: "Laos",
  };

  function readCookie(name) {
    try {
      const m = document.cookie.match(
        new RegExp("(?:^|; )" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)")
      );
      return m ? decodeURIComponent(m[1]) : null;
    } catch {
      return null;
    }
  }

  /** Extract ISO country code. For store cookies, 2-letter codes are always countries. */
  function extractCountryCode(raw, opts) {
    const fromStore = opts && opts.fromStore === true;
    const s = String(raw || "").trim().toLowerCase().replace(/_/g, "-");
    if (!s) return null;
    if (/^[a-z]{2}$/.test(s)) {
      if (!fromStore && LANG_ONLY.has(s) && s !== "uk") return null;
      return s === "uk" ? "gb" : s;
    }
    if (/^[a-z]{2}-[a-z]{2}$/.test(s)) {
      const [a, b] = s.split("-");
      // vi-VN → vn ; vn-vi → vn
      if (LANG_ONLY.has(a) && !LANG_ONLY.has(b)) return b;
      if (!LANG_ONLY.has(a) || fromStore) return a === "uk" ? "gb" : a;
      if (!LANG_ONLY.has(b)) return b;
    }
    return null;
  }

  /**
   * Resolve English country name (Vietnam, Belgium, Germany…).
   * Prefer store-country-code; never append language.
   */
  function normalizeCountryName(parts) {
    const storeCode = extractCountryCode(parts.storeCountry, { fromStore: true });
    const regionCode = extractCountryCode(parts.region, { fromStore: true });
    const code = storeCode || regionCode;
    if (!code) return null;
    return CODE_TO_COUNTRY_NAME[code] || code.toUpperCase();
  }

  function extractCountryFromAppContext(scope) {
    const ctx = scope?.["webapp.app-context"] || {};
    const appCtx = ctx.appContext || {};
    const user = ctx.user || {};
    return {
      region:
        appCtx.region ||
        appCtx.priority_region ||
        user.region ||
        scope?.["webapp.user-detail"]?.userInfo?.user?.region ||
        null,
      language: appCtx.language || ctx.language || null,
      storeCountry: readCookie("store-country-code"),
      langCookie:
        readCookie("tiktok_webapp_lang") ||
        readCookie("app_language") ||
        readCookie("i18next"),
    };
  }

  // Multi-language text matcher for Studio DOM cards
  function findDomMetric(labelVariants) {
    const all = Array.from(document.querySelectorAll("*"));
    const lowerVariants = labelVariants.map((v) => v.toLowerCase());

    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (el.children.length === 0 && el.textContent) {
        const txt = el.textContent.trim().toLowerCase();
        if (lowerVariants.includes(txt)) {
          const parent = el.parentElement;
          if (parent) {
            const lines = parent.innerText
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean);
            const idx = lines.findIndex((l) => lowerVariants.includes(l.toLowerCase()));
            if (idx !== -1) {
              if (lines[idx + 1] && /^[0-9.,KMBkmb$£€₫]/.test(lines[idx + 1])) return lines[idx + 1];
              if (lines[idx - 1] && /^[0-9.,KMBkmb$£€₫]/.test(lines[idx - 1])) return lines[idx - 1];
            }
          }
        }
      }
    }
    return "";
  }

  function normalizeHandle(raw) {
    if (!raw) return null;
    const h = String(raw).replace(/^@/, "").trim();
    if (!h || h.length < 2 || h.length > 30) return null;
    if (!/^[a-zA-Z0-9._]+$/.test(h)) return null;
    return h;
  }

  function handlesEqual(a, b) {
    const na = normalizeHandle(a);
    const nb = normalizeHandle(b);
    return !!na && !!nb && na.toLowerCase() === nb.toLowerCase();
  }

  /** Profile handle from current URL path (/@user/...), or null on feed/studio/etc. */
  function getViewedProfileHandleFromUrl() {
    try {
      const m = window.location.pathname.match(/^\/@([a-zA-Z0-9._]+)/);
      return normalizeHandle(m?.[1] || null);
    } catch {
      return null;
    }
  }

  function rememberHandle(uname) {
    const n = normalizeHandle(uname);
    if (!n) return;
    cachedHandle = n;
    try { chrome.storage.local.set({ cachedTikTokHandle: cachedHandle }); } catch (e) { }
  }

  // 1. Resolve Verified Authenticated Login State (never use the viewed /@profile as identity)
  async function checkAuthenticationState() {
    // A. Explicit login or passport redirection page -> Definitely Logged Out
    if (/login|passport/i.test(window.location.href)) {
      return { isLoggedIn: false, username: null };
    }

    // B. Inside TikTok Studio (/tiktokstudio/* or /creator-center/*)
    const isStudio =
      window.location.href.includes("tiktokstudio") ||
      window.location.href.includes("creator-center");

    if (isStudio) {
      let studioHandle = null;

      // Prefer creator context JSON over DOM text
      try {
        const creatorEl = document.getElementById("__Creator_Center_Context__");
        if (creatorEl?.textContent) {
          const raw = creatorEl.textContent.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
          const parsed = JSON.parse(raw);
          studioHandle =
            normalizeHandle(parsed?.user?.uniqueId) ||
            normalizeHandle(parsed?.userInfo?.user?.uniqueId) ||
            normalizeHandle(parsed?.userBaseInfo?.UserProfile?.UserBase?.UniqId);
        }
      } catch (e) { }

      if (!studioHandle) {
        const studioUserEl =
          document.querySelector('[data-e2e="user-avatar"]') ||
          document.querySelector('[class*="avatar"] img') ||
          document.querySelector('[class*="userName"], [class*="username"], [class*="user-name"]');
        if (studioUserEl) {
          const parent = studioUserEl.closest("header, [class*='header'], [class*='nav']") || studioUserEl.parentElement;
          if (parent) {
            const text = parent.innerText || "";
            const m = text.match(/@([a-zA-Z0-9_.-]{3,30})/);
            if (m && m[1]) studioHandle = normalizeHandle(m[1]);
            else {
              const parts = text.split("|").map((p) => p.trim());
              if (parts[0] && /^[a-zA-Z0-9_.-]{3,30}$/.test(parts[0])) studioHandle = normalizeHandle(parts[0]);
            }
          }
        }
      }

      if (studioHandle) rememberHandle(studioHandle);
      return { isLoggedIn: true, username: studioHandle || cachedHandle || null };
    }

    // C. Guest login button with no nav profile control
    const loginBtn = document.querySelector('[data-e2e="top-login-button"]');
    // Only trust dedicated profile-icon controls — NEVER generic header @ links on a public profile page
    // (those selectors often match the *viewed* profile, not the logged-in account).
    const profileIcon =
      document.querySelector('a[data-e2e="profile-icon"]') ||
      document.querySelector('a[data-e2e="nav-profile"]') ||
      document.querySelector('[data-e2e="profile-icon"] a');

    if (loginBtn && !profileIcon) {
      return { isLoggedIn: false, username: null };
    }

    // D. Ground-Truth: Authenticated viewer in SSR hydration (__UNIVERSAL_DATA_FOR_REHYDRATION__)
    // webapp.app-context.user = AUTHENTICATED VIEWER
    // webapp.user-detail = VIEWED profile (must never be used as identity)
    try {
      const scriptTag = document.getElementById("__UNIVERSAL_DATA_FOR_REHYDRATION__");
      if (scriptTag && scriptTag.textContent) {
        const json = JSON.parse(scriptTag.textContent);
        const scope = json["__DEFAULT_SCOPE__"] || {};
        const appUser = scope["webapp.app-context"]?.user;
        const hints = extractCountryFromAppContext(scope);
        const country = normalizeCountryName({
          storeCountry: hints.storeCountry,
          region: hints.region,
          language: hints.language || hints.langCookie,
        });
        if (appUser && (appUser.uniqueId || appUser.id)) {
          const uname = normalizeHandle(appUser.uniqueId);
          if (uname) rememberHandle(uname);
          return { isLoggedIn: true, username: uname, country: country || null };
        }
      }
    } catch (e) { }

    // E. Passport API (session cookie) — authoritative for logged-in identity
    try {
      const res = await fetch("https://www.tiktok.com/passport/web/account/info/?app_id=1233", {
        credentials: "include",
      });
      if (res.ok) {
        const info = await res.json();
        const uname = normalizeHandle(info.data?.username || info.data?.screen_name);
        const hints = {
          storeCountry: readCookie("store-country-code"),
          region: info.data?.store_country || info.data?.country_code || info.data?.country || null,
          language:
            readCookie("tiktok_webapp_lang") ||
            readCookie("app_language") ||
            info.data?.language ||
            null,
        };
        // Never treat numeric dial codes as market locale
        if (hints.region && /^\d+$/.test(String(hints.region))) hints.region = null;
        const country = normalizeCountryName(hints);
        if (uname && info.data?.user_id_str) {
          rememberHandle(uname);
          return { isLoggedIn: true, username: uname, country: country || null };
        }
      }
    } catch (e) { }

    // F. Nav profile icon only (safe) — after ground-truth probes
    const cookieCountry = normalizeCountryName({
      storeCountry: readCookie("store-country-code"),
      region: null,
      language: readCookie("tiktok_webapp_lang") || readCookie("app_language"),
    });
    if (profileIcon) {
      const href = profileIcon.getAttribute("href") || "";
      const m = href.match(/\/@([a-zA-Z0-9_.-]+)/);
      const uname = normalizeHandle(m?.[1]);
      if (uname) {
        rememberHandle(uname);
        return { isLoggedIn: true, username: uname, country: cookieCountry || null };
      }
      // Icon present but no href handle — still logged in; use cache if available
      if (cachedHandle) {
        return { isLoggedIn: true, username: cachedHandle, country: cookieCountry || null };
      }
    }

    return { isLoggedIn: false, username: null, country: null };
  }

  // 2. Identity-only detector (Client Agent owns metrics)
  async function extractAllMetrics() {
    if (isScanning) return null;
    isScanning = true;

    try {
      const auth = await checkAuthenticationState();
      const isLoggedIn = auth.isLoggedIn === true;
      const username = normalizeHandle(auth.username) || (isLoggedIn ? normalizeHandle(cachedHandle) : null) || "";

      const isStudio =
        window.location.href.includes("tiktokstudio") ||
        window.location.href.includes("creator-center");

      const viewedHandle = getViewedProfileHandleFromUrl();
      const isOwnProfilePage =
        !!viewedHandle && !!username && handlesEqual(viewedHandle, username);
      const isOtherProfilePage =
        !!viewedHandle && !!username && !handlesEqual(viewedHandle, username);

      const result = {
        username: username || "unknown",
        nickname: "",
        avatarUrl: "",
        // English country name only (Vietnam). Never invent "United States".
        country: auth.country || null,
        currency: "$",
        isLoggedIn: isLoggedIn,
        viewedProfile: viewedHandle || null,
        isOwnProfilePage: isOwnProfilePage,
        isOtherProfilePage: isOtherProfilePage,
        isStudio: isStudio,
        metricsSource: "identity",
        source: "extension",
      };

      if (!isLoggedIn || !username) {
        return {
          ...result,
          username: username || cachedHandle || "unknown",
          isLoggedIn: false,
        };
      }

      // Nickname / avatar only — never followers, revenue, views
      try {
        if (isOwnProfilePage) {
          const titleEl = document.querySelector('[data-e2e="user-title"], h1');
          if (titleEl && titleEl.textContent) result.nickname = titleEl.textContent.trim();
          const avatarEl =
            document.querySelector('[data-e2e="user-avatar"] img') ||
            document.querySelector('img[class*="Avatar"]');
          if (avatarEl && avatarEl.src) result.avatarUrl = avatarEl.src;
        }
        // Always hydrate OUR identity via /@username fetch — never scrape the viewed public profile
        if (!result.nickname || !result.avatarUrl) {
          await hydrateOwnIdentity(result);
        }
      } catch (e) { /* non-blocking */ }

      return result;
    } catch (err) {
      console.warn("[TikTokFlow] Identity detection error:", err);
      return null;
    } finally {
      isScanning = false;
    }
  }

  // FIX: cached hydrateOwnIdentity. Previously this fetched the entire TikTok
  // profile page (~200KB HTML) on every scan — several times per minute on
  // active tabs. Now cached by username with a 24h TTL.
  async function hydrateOwnIdentity(result) {
    if (!result.username || result.username === "unknown") return;

    // Fast path: read the cache.
    let cache = {};
    try {
      const stored = await chrome.storage.local.get([IDENTITY_CACHE_KEY]);
      cache = stored[IDENTITY_CACHE_KEY] || {};
    } catch { /* ignore */ }

    const entry = cache[result.username];
    if (
      entry &&
      typeof entry === "object" &&
      entry.at &&
      Date.now() - entry.at < IDENTITY_CACHE_TTL_MS
    ) {
      if (entry.nickname) result.nickname = entry.nickname;
      if (entry.avatarUrl) result.avatarUrl = entry.avatarUrl;
      return;
    }

    // Slow path: fetch the profile page.
    try {
      const profileRes = await fetch(`https://www.tiktok.com/@${result.username}`, {
        credentials: "include",
        headers: { Accept: "text/html,application/xhtml+xml" },
      });
      if (!profileRes.ok) return;
      const html = await profileRes.text();
      const rehydrationMatch = html.match(
        /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/
      );
      if (!rehydrationMatch?.[1]) return;
      const parsed = JSON.parse(rehydrationMatch[1]);
      const userInfo = parsed?.["__DEFAULT_SCOPE__"]?.["webapp.user-detail"]?.userInfo;
      const hydratedId = normalizeHandle(userInfo?.user?.uniqueId);
      if (hydratedId && !handlesEqual(hydratedId, result.username)) return;
      if (!userInfo?.user) return;
      if (userInfo.user.nickname) result.nickname = userInfo.user.nickname;
      if (userInfo.user.avatarLarger || userInfo.user.avatarThumb) {
        result.avatarUrl = userInfo.user.avatarLarger || userInfo.user.avatarThumb;
      }

      // Persist to cache (single-entry map — replaces on each successful hydrate).
      if (result.nickname || result.avatarUrl) {
        try {
          await chrome.storage.local.set({
            [IDENTITY_CACHE_KEY]: {
              [result.username]: {
                nickname: result.nickname || "",
                avatarUrl: result.avatarUrl || "",
                at: Date.now(),
              },
            },
          });
        } catch { /* non-blocking */ }
      }
    } catch (e) { /* non-blocking */ }
  }

  // 3. Debounced Detection & Reporting
  let debounceTimer = null;
  const FORCE_REREPORT_MS = 45_000;

  async function triggerDetection(opts = {}) {
    const force = opts.force === true;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const data = await extractAllMetrics();
      if (!data || !data.username || data.username === "unknown") return;

      // Never report metrics scraped while logged out / unidentified
      if (!data.isLoggedIn) {
        console.log("[TikTokFlow] Skipping report — not logged in");
        return;
      }

      // Public profile of someone else → still report OUR logged-in identity (first login / GPM link),
      // but never use their page DOM as nickname/avatar (extractAllMetrics already hydrates via /@us).
      if (data.isOtherProfilePage) {
        console.log(
          `[TikTokFlow] On public @${data.viewedProfile} — reporting logged-in identity @${data.username}`
        );
      }

      // Hash identity only — Agent owns metrics
      const currentHash = JSON.stringify({
        u: data.username,
        n: data.nickname || "",
        logged: !!data.isLoggedIn,
      });

      const stale =
        !lastSuccessfulReportAt ||
        Date.now() - lastSuccessfulReportAt > FORCE_REREPORT_MS;
      if (!force && currentHash === lastReportedDataHash && !stale) {
        return;
      }

      console.log("[TikTokFlow] Reporting identity for logged-in account:", data.username, {
        force,
        stale,
      });


      try {
        chrome.runtime.sendMessage(
          {
            type: "TIKTOK_STATUS_DETECTED",
            data: {
              ...data,
              // Identity report is allowed on other profiles; strip page-context flag so
              // background does not treat this as a no-op skip.
              isOtherProfilePage: false,
              viewedWhileOnOtherProfile: data.isOtherProfilePage ? data.viewedProfile : null,
              detectedUrl: window.location.href,
              timestamp: new Date().toISOString(),
            },
          },
          (resp) => {
            if (chrome.runtime.lastError) {
              console.warn(
                "[TikTokFlow] Report message failed:",
                chrome.runtime.lastError.message
              );
              // Do NOT mark hash — allow retry on next tick
              return;
            }
            // Only mark success after server identity post (phase 1) — not mere SW receipt.
            if (resp && resp.ok) {
              lastReportedDataHash = currentHash;
              lastSuccessfulReportAt = Date.now();
            }
          }
        );
      } catch (e) {
        console.warn("[TikTokFlow] Report send threw:", e?.message || e);
      }
    }, force ? 200 : 1200);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "FORCE_IDENTITY_SCAN") {
      lastReportedDataHash = "";
      triggerDetection({ force: true });
      sendResponse({ ok: true });
      return true;
    }
  });

  // Initial runs
  triggerDetection();
  setTimeout(() => triggerDetection(), 2500);
  setTimeout(() => triggerDetection(), 6000);

  // FIX: adaptive polling. Previously a flat 10s interval ran on every TikTok
  // tab forever, even when nothing changed — dozens of useless scans per minute
  // on a machine with many open profiles. Now backs off to 60s when idle and
  // resets to 10s on activity.
  let idleBackoffMs = 10_000;
  const MAX_BACKOFF_MS = 60_000;
  setTimeout(function pollLoop() {
    triggerDetection();
    const recent = lastSuccessfulReportAt && Date.now() - lastSuccessfulReportAt < 60_000;
    idleBackoffMs = recent
      ? 10_000
      : Math.min(MAX_BACKOFF_MS, Math.round(idleBackoffMs * 1.5));
    setTimeout(pollLoop, idleBackoffMs);
  }, 10_000);

  // Re-scan when tab becomes visible (common after opening another profile)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") triggerDetection({ force: true });
  });
  window.addEventListener("pageshow", () => triggerDetection({ force: true }));
  window.addEventListener("focus", () => triggerDetection());

  // MutationObserver with debounce
  const target = document.body || document.documentElement;
  if (target) {
    const observer = new MutationObserver(() => {
      triggerDetection();
    });
    observer.observe(target, { childList: true, subtree: true });
  }
})();