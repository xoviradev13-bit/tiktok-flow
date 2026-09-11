// TikTokFlow Companion - Content Script
// Injected into TikTok & TikTok Studio pages to detect live login status & all 4 metric groups

(function () {
  let lastReportedDataHash = "";
  let isScanning = false;
  let cachedHandle = null;

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
        const val = parseFloat(match[1].replace(",", "."));
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
    s = s.replace(/\u066B/g, ".");
    const clean = s.replace(/[^0-9.,]/g, "").replace(",", ".");
    return parseFloat(clean) || 0;
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
      case "£": return "UK";
      case "€": return "DE";
      case "₫": return "VN";
      case "R$": return "BR";
      case "Rp": return "ID";
      case "₱": return "PH";
      case "Rs": return "PK";
      case "₽": return "RU";
      case "৳": return "BD";
      case "EGP": return "EG";
      case "¥": return "JP";
      case "₩": return "KR";
      case "฿": return "TH";
      case "RM": return "MY";
      case "₺": return "TR";
      default: return "US";
    }
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
        const region =
          scope["webapp.app-context"]?.appContext?.region ||
          scope["webapp.app-context"]?.language ||
          null;
        if (appUser && (appUser.uniqueId || appUser.id)) {
          const uname = normalizeHandle(appUser.uniqueId);
          if (uname) rememberHandle(uname);
          return { isLoggedIn: true, username: uname, country: region || null };
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
        const cCode = info.data?.country_code || info.data?.country;
        if (uname && info.data?.user_id_str) {
          rememberHandle(uname);
          return { isLoggedIn: true, username: uname, country: cCode || null };
        }
      }
    } catch (e) { }

    // F. Nav profile icon only (safe) — after ground-truth probes
    if (profileIcon) {
      const href = profileIcon.getAttribute("href") || "";
      const m = href.match(/\/@([a-zA-Z0-9_.-]+)/);
      const uname = normalizeHandle(m?.[1]);
      if (uname) {
        rememberHandle(uname);
        return { isLoggedIn: true, username: uname, country: null };
      }
      // Icon present but no href handle — still logged in; use cache if available
      if (cachedHandle) {
        return { isLoggedIn: true, username: cachedHandle, country: null };
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
        country: auth.country ? String(auth.country).toUpperCase() : "US",
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
        if ((!result.nickname || !result.avatarUrl) && !isOtherProfilePage) {
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

  async function hydrateOwnIdentity(result) {
    if (!result.username || result.username === "unknown") return;
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
    } catch (e) { /* non-blocking */ }
  }

  // 3. Debounced Detection & Reporting
  let debounceTimer = null;
  async function triggerDetection() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const data = await extractAllMetrics();
      if (!data || !data.username || data.username === "unknown") return;

      // Never report metrics scraped while logged out / unidentified
      if (!data.isLoggedIn) {
        console.log("[TikTokFlow] Skipping report — not logged in");
        return;
      }

      // Public profile of someone else → do not touch popup metrics / server stats
      if (data.isOtherProfilePage) {
        console.log(
          `[TikTokFlow] Skipping report — viewing public @${data.viewedProfile} (logged-in @${data.username} unchanged)`
        );
        try {
          chrome.runtime.sendMessage({
            type: "TIKTOK_STATUS_DETECTED",
            data: {
              username: data.username,
              isLoggedIn: true,
              isOtherProfilePage: true,
              viewedProfile: data.viewedProfile,
              metricsSource: "identity_only",
            },
          });
        } catch (e) {}
        return;
      }

      // Hash identity only — Agent owns metrics
      const currentHash = JSON.stringify({
        u: data.username,
        n: data.nickname || "",
        logged: !!data.isLoggedIn,
      });

      if (currentHash !== lastReportedDataHash) {
        lastReportedDataHash = currentHash;

        console.log("[TikTokFlow] Reporting identity for logged-in account:", data.username);

        try {
          chrome.runtime.sendMessage({
            type: "TIKTOK_STATUS_DETECTED",
            data: {
              ...data,
              detectedUrl: window.location.href,
              timestamp: new Date().toISOString(),
            },
          });
        } catch (e) { }
      }
    }, 1200); // 1.2s debounce for peak performance
  }

  // Initial runs
  triggerDetection();
  setTimeout(triggerDetection, 2500);
  setTimeout(triggerDetection, 6000);

  // Periodic check for SPA navigation
  setInterval(triggerDetection, 25000);

  // MutationObserver with debounce
  const target = document.body || document.documentElement;
  if (target) {
    const observer = new MutationObserver(() => {
      triggerDetection();
    });
    observer.observe(target, { childList: true, subtree: true });
  }
})();
