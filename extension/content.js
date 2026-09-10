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

  async function hydrateOwnPublicStats(result) {
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
      // Guard: ensure hydrated profile is OUR account, not a redirect/mismatch
      const hydratedId = normalizeHandle(userInfo?.user?.uniqueId);
      if (hydratedId && !handlesEqual(hydratedId, result.username)) {
        console.warn(
          `[TikTokFlow] Skipping hydrate — page @${hydratedId} != logged-in @${result.username}`
        );
        return;
      }
      if (!userInfo) return;
      const stats = userInfo.stats || {};
      if (stats.followerCount) result.followersCount = Number(stats.followerCount);
      if (stats.followingCount) result.followingCount = Number(stats.followingCount);
      if (stats.heartCount) result.totalLikes = Number(stats.heartCount);
      if (stats.videoCount) {
        result.totalVideos = Number(stats.videoCount);
        result.videoCount = Number(stats.videoCount);
      }
      if (userInfo.user?.nickname) result.nickname = userInfo.user.nickname;
      if (userInfo.user?.avatarLarger || userInfo.user?.avatarThumb) {
        result.avatarUrl = userInfo.user.avatarLarger || userInfo.user.avatarThumb;
      }
    } catch (e) {
      // Non-blocking
    }
  }

  // 2. Main Extractor
  async function extractAllMetrics() {
    if (isScanning) return null;
    isScanning = true;

    try {
      const auth = await checkAuthenticationState();
      const isLoggedIn = auth.isLoggedIn === true;
      // Identity MUST come from auth/session — never from the URL being viewed
      const username = normalizeHandle(auth.username) || (isLoggedIn ? normalizeHandle(cachedHandle) : null) || "";

      const isStudio =
        window.location.href.includes("tiktokstudio") ||
        window.location.href.includes("creator-center");

      const viewedHandle = getViewedProfileHandleFromUrl();
      const isOwnProfilePage =
        !!viewedHandle && !!username && handlesEqual(viewedHandle, username);
      const isOtherProfilePage =
        !!viewedHandle && !!username && !handlesEqual(viewedHandle, username);

      if (isOtherProfilePage) {
        console.log(
          `[TikTokFlow] Viewing public profile @${viewedHandle} — extracting ONLY logged-in @${username}`
        );
      }

      // Metrics default container
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
        metricsSource: isStudio ? "studio" : isOwnProfilePage ? "own_profile" : "hydrated",

        // 1. Views breakdown
        viewsToday: 0,
        views7d: 0,
        views14d: 0,
        views30d: 0,
        totalViews: 0,

        // 2. Videos breakdown
        videosToday: 0,
        videos7d: 0,
        videos14d: 0,
        videos30d: 0,
        totalVideos: 0,
        videoCount: 0,

        // 3. Channel Info & Engagement
        followersCount: 0,
        followingCount: 0,
        totalLikes: 0,

        // 4. Monetization & Economics
        totalRevenue: 0,
        rpm: 0,
      };

      // Not logged in → never scrape a public profile and claim it as an account report
      if (!isLoggedIn || !username) {
        return {
          ...result,
          username: username || cachedHandle || "unknown",
          isLoggedIn: false,
        };
      }

      // ----------------------------------------------------
      // A. Extract from Standard Profile Page ONLY when it is OUR profile
      // ----------------------------------------------------
      if (isOwnProfilePage) {
        const bodyText = document.body ? document.body.innerText : "";

        const followersEl = document.querySelector('[data-e2e="followers-count"]');
        const followingEl = document.querySelector('[data-e2e="following-count"]');
        const likesEl = document.querySelector('[data-e2e="likes-count"]');
        const titleEl = document.querySelector('[data-e2e="user-title"], h1');

        if (titleEl && titleEl.textContent) result.nickname = titleEl.textContent.trim();

        if (followersEl) result.followersCount = parseNum(followersEl.textContent);
        else {
          const m =
            bodyText.match(/([0-9.,\u0660-\u0669\u09e6-\u09efKMBkmbмлнтысrbjttr]+)\s*(?:Follower|Followers|Người theo dõi|Pengikut|Seguidores|Подписчик|Подписчиков|المتابعون|متابع|ফলোয়ার|অনুসারী|Tagasubaybay|فالوورز)/iu) ||
            bodyText.match(/(?:Follower|Followers|Người theo dõi|Pengikut|Seguidores|Подписчик|Подписчиков|المتابعون|متابع|ফলোয়ার|অনুসারী|Tagasubaybay|فالوورز)\s*([0-9.,\u0660-\u0669\u09e6-\u09efKMBkmbмлнтысrbjttr]+)/iu);
          if (m) result.followersCount = parseNum(m[1]);
        }

        if (followingEl) result.followingCount = parseNum(followingEl.textContent);
        else {
          const m =
            bodyText.match(/([0-9.,\u0660-\u0669\u09e6-\u09efKMBkmbмлнтысrbjttr]+)\s*(?:Following|Đã follow|Đang theo dõi|Mengikuti|Seguindo|Siguiendo|Подписки|Подписок|أتابعه|متابَعون|অনুসরণ|Sinusubaybayan|فالو)/iu) ||
            bodyText.match(/(?:Following|Đã follow|Đang theo dõi|Mengikuti|Seguindo|Siguiendo|Подписки|Подписок|أتابعه|متابَعون|অনুসরণ|Sinusubaybayan|فالو)\s*([0-9.,\u0660-\u0669\u09e6-\u09efKMBkmbмлнтысrbjttr]+)/iu);
          if (m) result.followingCount = parseNum(m[1]);
        }

        if (likesEl) result.totalLikes = parseNum(likesEl.textContent);
        else {
          const m =
            bodyText.match(/([0-9.,\u0660-\u0669\u09e6-\u09efKMBkmbмлнтысrbjttr]+)\s*(?:Likes|Like|Lượt thích|Thích|Suka|Curtidas|Me gusta|Лайки|Лайков|Нравится|الإعجابات|إعجاب|পছন্দ|লাইক|پسندیدگیاں)/iu) ||
            bodyText.match(/(?:Likes|Like|Lượt thích|Thích|Suka|Curtidas|Me gusta|Лайки|Лайков|Нравится|الإعجابات|إعجاب|পছন্দ|লাইক|پسندیدگیاں)\s*([0-9.,\u0660-\u0669\u09e6-\u09efKMBkmbмлнтысrbjttr]+)/iu);
          if (m) result.totalLikes = parseNum(m[1]);
        }

        const videoCards = Array.from(
          document.querySelectorAll('[data-e2e="user-post-item"], a[href*="/video/"]')
        );
        if (videoCards.length > 0) {
          result.totalVideos = videoCards.length;
          result.videoCount = videoCards.length;

          let viewsSum = 0;
          for (const card of videoCards) {
            const viewEl = card.querySelector('[data-e2e="video-views"], strong, span');
            if (viewEl && viewEl.textContent) {
              viewsSum += parseNum(viewEl.textContent);
            }
          }
          if (viewsSum > 0) result.totalViews = viewsSum;
        }
      }

      // ----------------------------------------------------
      // A2. Always hydrate OUR public stats when missing, or when viewing someone else / home feed
      // ----------------------------------------------------
      if (
        !isStudio &&
        result.username &&
        result.username !== "unknown" &&
        (isOtherProfilePage || !isOwnProfilePage || !result.followersCount || !result.totalLikes)
      ) {
        await hydrateOwnPublicStats(result);
      }

      // ----------------------------------------------------
      // B. Extract from TikTok Studio (/tiktokstudio/*)
      // ----------------------------------------------------
      if (isStudio) {
        // Multi-language DOM matching
        // Universal Multi-Language Support for Top 10 Countries:
        // 1. US (English)
        // 2. Indonesia (Bahasa)
        // 3. Brazil (Portuguese)
        // 4. Mexico (Spanish)
        // 5. Pakistan (Urdu / English)
        // 6. Philippines (Tagalog / Filipino)
        // 7. Vietnam (Vietnamese)
        // 8. Russia (Russian)
        // 9. Bangladesh (Bengali)
        // 10. Egypt (Arabic)
        // + French, German, Chinese
        const revenueLabels = [
          // English & US
          "est. rewards", "estimated rewards", "rewards", "total rewards",
          // Vietnamese
          "ước tính phần thưởng", "phần thưởng ước tính", "ước tính doanh thu", "doanh thu ước tính", "thu nhập ước tính", "phần thưởng",
          // Indonesian
          "estimasi hadiah", "hadiah", "pendapatan", "total hadiah",
          // Portuguese / Brazil
          "recompensas estimadas", "recompensas", "ganhos estimados", "total de recompensas",
          // Spanish / Mexico
          "recompensas estimadas", "recompensas", "ingresos estimados",
          // Russian
          "расчетное вознаграждение", "расчётное вознаграждение", "вознаграждения", "доход",
          // Arabic / Egypt
          "المكافآت التقديرية", "المكافآت", "الأرباح التقديرية", "الأرباح", "إجمالي المكافآت",
          // Urdu / Pakistan
          "تخمینہ شدہ انعامات", "انعامات", "کل انعامات",
          // Bengali / Bangladesh
          "আনুমানিক পুরস্কার", "পুরস্কার", "আয়",
          // Tagalog / Philippines
          "tinatayang mga gantimpala", "mga gantimpala", "gantimpala",
          // French & German & Chinese
          "récompenses estimées", "recompenses estimees", "récompenses", "revenus estimés",
          "geschätzte belohnungen", "geschaetzte belohnungen", "belohnungen", "einnahmen",
          "预计收益", "預計收益", "预计奖励", "預計獎勵", "奖励", "收益"
        ];

        const viewsLabels = [
          // US / English
          "video views", "views", "video view",
          // Vietnamese
          "lượt xem video", "lượt xem", "số lượt xem",
          // Indonesian
          "tayangan video", "tayangan", "penayangan video", "penayangan",
          // Portuguese / Brazil
          "visualizações de vídeo", "visualizacoes de video", "visualizações", "visualizacoes",
          // Spanish / Mexico
          "visualizaciones de videos", "reproducciones de video", "visualizaciones", "reproducciones",
          // Russian
          "просмотры видео", "просмотры", "просмотров",
          // Arabic / Egypt
          "مشاهدات الفيديو", "مشاهدات", "المشاهدات",
          // Urdu / Pakistan
          "ویڈیو ملاحظات", "ملاحظات", "ویوز",
          // Bengali / Bangladesh
          "ভিডিও ভিউ", "ভিউ",
          // Tagalog / Philippines
          "mga panonood ng video", "mga panonood", "panonood",
          // French, German, Chinese
          "vues de vidéos", "vues de vidéo", "vues vidéo",
          "videoaufrufe", "aufrufe",
          "视频播放量", "視頻播放量", "播放量", "视频播放"
        ];

        const profileViewsLabels = [
          // US / English
          "profile views", "profile view",
          // Vietnamese
          "lượt xem hồ sơ", "lượt xem trang cá nhân", "lượt xem trang",
          // Indonesian
          "tayangan profil", "penayangan profil",
          // Portuguese / Brazil
          "visualizações do perfil", "visualizacoes do perfil", "visitas ao perfil",
          // Spanish / Mexico
          "visualizaciones del perfil", "visitas al perfil",
          // Russian
          "просмотры профиля", "просмотров профиля",
          // Arabic / Egypt
          "مشاهدات الملف الشخصي", "زيارات الملف الشخصي",
          // Urdu / Pakistan
          "پروفائل ملاحظات",
          // Bengali / Bangladesh
          "প্রোফাইল ভিউ",
          // Tagalog / Philippines
          "mga panonood ng profile", "panonood ng profile",
          // French, German, Chinese
          "vues du profil", "vues de profil", "profilaufrufe",
          "主页访问量", "主頁訪問量", "个人主页访问量", "主页访问"
        ];

        const followersLabels = [
          // US / English
          "followers", "follower", "net followers",
          // Vietnamese
          "người theo dõi", "theo dõi mới",
          // Indonesian
          "pengikut", "pengikut baru", "pengikut bersih",
          // Portuguese / Brazil
          "seguidores", "novos seguidores",
          // Spanish / Mexico
          "seguidores", "nuevos seguidores",
          // Russian
          "подписчики", "подписчиков", "подписчика", "новые подписчики",
          // Arabic / Egypt
          "المتابعون", "متابع", "متابعين", "متابع جديد",
          // Urdu / Pakistan
          "فالوورز", "پیروکار",
          // Bengali / Bangladesh
          "অনুসারী", "ফলোয়ার",
          // Tagalog / Philippines
          "mga tagasubaybay", "tagasubaybay",
          // French, German, Chinese
          "abonnés", "abonnes", "follower", "neue follower",
          "粉丝", "粉絲", "新增粉丝"
        ];

        const likesLabels = [
          // US / English
          "likes", "like",
          // Vietnamese
          "lượt thích", "thích",
          // Indonesian
          "suka", "menyukai", "total suka",
          // Portuguese / Brazil
          "curtidas", "gostos",
          // Spanish / Mexico
          "me gusta",
          // Russian
          "лайки", "лайков", "нравится", "отметки «нравится»",
          // Arabic / Egypt
          "تسجيلات الإعجاب", "إعجاب", "الإعجابات", "لايكات",
          // Urdu / Pakistan
          "پسندیدگیاں", "لائیکس",
          // Bengali / Bangladesh
          "পছন্দ", "লাইক",
          // Tagalog / Philippines
          "mga like", "like", "mga gusto",
          // French, German, Chinese
          "j'aime", "mentions j'aime", "gefällt mir", "点赞", "點贊", "赞"
        ];

        const commentsLabels = [
          // US / English
          "comments", "comment",
          // Vietnamese
          "bình luận", "số bình luận",
          // Indonesian
          "komentar",
          // Portuguese / Brazil
          "comentários", "comentarios",
          // Spanish / Mexico
          "comentarios", "comentario",
          // Russian
          "комментарии", "комментариев",
          // Arabic / Egypt
          "التعليقات", "تعليقات", "تعليق",
          // Urdu / Pakistan
          "تبصرے", "کمنٹس",
          // Bengali / Bangladesh
          "মন্তব্য", "কমেন্ট",
          // Tagalog / Philippines
          "mga komento", "komento",
          // French, German, Chinese
          "commentaires", "commentaire", "kommentare", "kommentar", "评论", "評論"
        ];

        const sharesLabels = [
          // US / English
          "shares", "share",
          // Vietnamese
          "lượt chia sẻ", "chia sẻ",
          // Indonesian
          "dibagikan", "bagikan",
          // Portuguese / Brazil
          "compartilhamentos", "compartilhar",
          // Spanish / Mexico
          "compartidos", "compartir",
          // Russian
          "репосты", "поделились", "поделиться",
          // Arabic / Egypt
          "مشاركات", "المشاركات", "إعادة نشر", "مشاركة",
          // Urdu / Pakistan
          "شیئرز", "شیئر",
          // Bengali / Bangladesh
          "শেয়ার",
          // Tagalog / Philippines
          "mga share", "ibahagi",
          // French, German, Chinese
          "partages", "partage", "geteilt", "分享", "轉發", "转发"
        ];

        // Rewards Analytics labels
        const totalRevLabels = [
          "total", "tổng", "tổng số", "total rewards", "est. rewards", "ước tính phần thưởng",
          "total hadiah", "total de recompensas", "всего", "итого", "إجمالي المكافآت", "کل انعامات", "মোট পুরস্কার", "kabuuang gantimpala",
          "total des récompenses", "gesamtsumme", "全部收益", "总计", "總計"
        ];
        const liveRewardsLabels = [
          "live rewards", "phần thưởng live", "hadiah live", "recompensas live", "награды за live", "مكافآت live", "لائیو انعامات", "লাইভ পুরস্কার",
          "récompenses live", "live-belohnungen", "直播奖励", "直播收益"
        ];
        const tiktokShopLabels = [
          "tiktok shop for seller", "tiktok shop", "cửa hàng tiktok", "متجر tiktok", "boutique tiktok", "tiktok-shop", "tiktok shop para vendedores", "tiktok电商", "带货收益"
        ];
        const creatorRewardsLabels = [
          "creator rewards program", "creator rewards", "chương trình phần thưởng", "program hadiah kreator", "programa de recompensas do criador", "programa de recompensas para creadores",
          "программа вознаграждений", "برنامج مكافآت المبدعين", "programme de récompenses", "creator rewards-programm", "创作者奖励计划", "創作者獎勵計劃"
        ];

        const rawRevenue = findDomMetric(revenueLabels);
        if (rawRevenue) {
          result.totalRevenue = parseMoney(rawRevenue);
          result.currency = detectCurrency(rawRevenue);
          const cFromCur = detectCountryFromCurrency(result.currency);
          if (cFromCur !== "US" || !auth.country) {
            result.country = cFromCur;
          }
        }

        const rawViews = findDomMetric(viewsLabels);
        if (rawViews) {
          const v = parseNum(rawViews);
          if (v > 0) result.totalViews = v;
        }

        const rawProfileViews = findDomMetric(profileViewsLabels);
        if (rawProfileViews) {
          result.profileViews = parseNum(rawProfileViews);
        }

        const rawFollowers = findDomMetric(followersLabels);
        if (rawFollowers && result.followersCount === 0) {
          result.followersCount = parseNum(rawFollowers);
        }

        const rawLikes = findDomMetric(likesLabels);
        if (rawLikes && result.totalLikes === 0) {
          result.totalLikes = parseNum(rawLikes);
        }

        const rawComments = findDomMetric(commentsLabels);
        if (rawComments) {
          result.commentsCount = parseNum(rawComments);
        }

        const rawShares = findDomMetric(sharesLabels);
        if (rawShares) {
          result.sharesCount = parseNum(rawShares);
        }

        // Rewards Analytics Breakdown (Intelligent Semantic & Card-Level Scan)
        // 1. Direct semantic findDomMetric
        const rawLiveRev = findDomMetric(liveRewardsLabels);
        if (rawLiveRev) result.liveRewardsRevenue = parseMoney(rawLiveRev);

        const rawShopRev = findDomMetric(tiktokShopLabels);
        if (rawShopRev) result.tiktokShopRevenue = parseMoney(rawShopRev);

        const rawCreatorRev = findDomMetric(creatorRewardsLabels);
        if (rawCreatorRev) result.creatorRewardsRevenue = parseMoney(rawCreatorRev);

        const rawTotalRev = findDomMetric(totalRevLabels);
        if (rawTotalRev) {
          const t = parseMoney(rawTotalRev);
          if (t > 0) result.totalRevenue = t;
        }

        // 2. Context-Aware Card Container Scan (Never rely on fixed index order)
        try {
          const rewardContainers = Array.from(document.querySelectorAll("[class*='reward'], [class*='monetiz'], [class*='tab-item'], [class*='tabItem'], [class*='card']"));
          for (const card of rewardContainers) {
            const text = card.innerText || "";
            const moneyMatch = text.match(/([$£€₫¥]|USD|EUR|GBP|VND)?\s*([0-9]+(?:[.,][0-9]{2})?)\s*([$£€₫¥]|USD|EUR|GBP|VND)?/);
            if (moneyMatch && moneyMatch[2]) {
              const amount = parseFloat(moneyMatch[2].replace(",", "."));
              const lower = text.toLowerCase();

              // Globally distinctive identifiers across all 10 countries
              if (/\blive\b|phần thưởng live|hadiah live|recompensas live|награды за live|مكافآت live|لائیو|লাইভ/iu.test(lower) && result.liveRewardsRevenue === 0) {
                result.liveRewardsRevenue = amount;
              } else if (/shop|seller|vendeur|tienda|boutique|cửa hàng|متجر|магазин/iu.test(lower) && result.tiktokShopRevenue === 0) {
                result.tiktokShopRevenue = amount;
              } else if (/creator|crp|programme|chương trình|creador|criador|kreator|программа вознаграждений|مكافآت المبدعين|কন্টেন্ট/iu.test(lower) && result.creatorRewardsRevenue === 0) {
                result.creatorRewardsRevenue = amount;
              } else if (/\btotal\b|tổng|gesamt|tous|всего|итого|إجمالي|کل|মোট/iu.test(lower) && result.totalRevenue === 0) {
                result.totalRevenue = amount;
              }
            }
          }
        } catch (cardScanErr) { }

        // 3. Mathematical Consistency & Reconciliation
        // Heuristic only: when Studio exposes a single total with no LIVE/Shop/Creator
        // breakdown, we attribute the whole amount to Creator Rewards. That matches the
        // common "Est. Rewards" Key Metrics card, but it is NOT always true — some UI
        // locales/layouts show Shop-only (or LIVE-only) totals without labeling the stream.
        // Prefer explicit component cards when present; do not invent split ratios.
        const sumComponents = (result.creatorRewardsRevenue || 0) + (result.liveRewardsRevenue || 0) + (result.tiktokShopRevenue || 0);
        if (result.totalRevenue === 0 && sumComponents > 0) {
          result.totalRevenue = sumComponents;
        } else if (result.totalRevenue > 0 && result.creatorRewardsRevenue === 0 && result.liveRewardsRevenue === 0 && result.tiktokShopRevenue === 0) {
          result.creatorRewardsRevenue = result.totalRevenue;
        }

        // ----------------------------------------------------
        // C. Extract Per-Video Metrics (Views, Likes, Comments)
        // ----------------------------------------------------
        result.videosList = [];
        try {
          // C.1 DOM Posts Table (from /tiktokstudio/content)
          const tableRows = Array.from(document.querySelectorAll("tbody tr, [class*='TableRow'], [data-e2e*='table-row']"));
          for (const row of tableRows) {
            const rowText = row.innerText || "";
            const cells = Array.from(row.querySelectorAll("td, [class*='TableCell'], [class*='cell']"));
            if (cells.length >= 4) {
              const titleEl = cells[0].querySelector("[class*='title'], [class*='desc'], p, span") || cells[0];
              const title = titleEl?.innerText?.split("\n")?.[0]?.trim() || "";

              // Extract numeric columns: Views, Likes, Comments
              const nums = cells.map(c => parseNum(c.innerText)).filter(n => n !== null);
              const viewsVal = parseNum(cells[2]?.innerText);
              const likesVal = parseNum(cells[3]?.innerText);
              const commentsVal = cells[4] ? parseNum(cells[4]?.innerText) : 0;

              const mDate = rowText.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}/i);
              const postDate = mDate ? mDate[0] : "";
              const privacy = /everyone|mọi người/i.test(rowText) ? "Everyone" : "Private";

              if (title && (viewsVal > 0 || likesVal > 0 || commentsVal > 0 || postDate)) {
                result.videosList.push({
                  title,
                  views: viewsVal,
                  likes: likesVal,
                  comments: commentsVal,
                  postDate,
                  privacy,
                });
              }
            }
          }
        } catch (domVideoErr) { }

        // ----------------------------------------------------
        // D. Top Posts Extraction (7d, 28d, 60d, 365d)
        // ----------------------------------------------------
        result.topVideos = { past7d: [], past28d: [], past60d: [], past365d: [] };
        try {
          // If on /tiktokstudio/analytics/content, parse the "Your top posts" table
          const topPostRows = Array.from(document.querySelectorAll("tbody tr, [class*='TableRow']"));
          for (let i = 0; i < topPostRows.length; i++) {
            const row = topPostRows[i];
            const text = row.innerText || "";
            if (text.includes("View data") || text.includes("Xem dữ liệu")) {
              const cells = Array.from(row.querySelectorAll("td, [class*='cell']"));
              const title = cells[1]?.innerText?.split("\n")?.[0]?.trim() || "";
              const viewsInRange = parseNum(cells[2]?.innerText);
              const allViews = parseNum(cells[3]?.innerText);
              const postedOn = cells[4]?.innerText?.trim() || "";

              if (title) {
                const item = { rank: i + 1, title, viewsInRange, allViews, postedOn };
                if (window.location.href.includes("pastDay%22%3A%22365") || window.location.href.includes("pastDay=365")) {
                  result.topVideos.past365d.push(item);
                } else if (window.location.href.includes("pastDay%22%3A%2260") || window.location.href.includes("pastDay=60")) {
                  result.topVideos.past60d.push(item);
                } else if (window.location.href.includes("pastDay%22%3A%2228") || window.location.href.includes("pastDay=28")) {
                  result.topVideos.past28d.push(item);
                } else {
                  result.topVideos.past7d.push(item);
                }
              }
            }
          }
        } catch (topDomErr) { }

        // ----------------------------------------------------
        // E. Direct Background Studio API Calls for full breakdown
        // ----------------------------------------------------
        try {
          // 1. Overview API (1d, 7d, 14d, 28d)
          const [resp1d, resp7d, resp14d, resp30d, respItems] = await Promise.all([
            fetch("/api/creator/overview/?type=fixed&pastDay=1", { credentials: "include" }).then(r => r.ok ? r.json() : null).catch(() => null),
            fetch("/api/creator/overview/?type=fixed&pastDay=7", { credentials: "include" }).then(r => r.ok ? r.json() : null).catch(() => null),
            fetch("/api/creator/overview/?type=fixed&pastDay=14", { credentials: "include" }).then(r => r.ok ? r.json() : null).catch(() => null),
            fetch("/api/creator/overview/?type=fixed&pastDay=28", { credentials: "include" }).then(r => r.ok ? r.json() : null).catch(() => null),
            fetch("/api/creator/item/list/?count=50", { credentials: "include" }).then(r => r.ok ? r.json() : null).catch(() => null),
          ]);

          if (resp1d) {
            const v1 = resp1d.video_views || resp1d.views || resp1d.data?.video_views;
            if (typeof v1 === "number") result.viewsToday = v1;
          }
          if (resp7d) {
            const v7 = resp7d.video_views || resp7d.views || resp7d.data?.video_views;
            if (typeof v7 === "number") result.views7d = v7;
            const pv = resp7d.profile_views || resp7d.data?.profile_views;
            if (typeof pv === "number" && !result.profileViews) result.profileViews = pv;
            const lk = resp7d.likes || resp7d.data?.likes;
            if (typeof lk === "number" && !result.totalLikes) result.totalLikes = lk;
            const cm = resp7d.comments || resp7d.data?.comments;
            if (typeof cm === "number" && !result.commentsCount) result.commentsCount = cm;
            const sh = resp7d.shares || resp7d.data?.shares;
            if (typeof sh === "number" && !result.sharesCount) result.sharesCount = sh;
          }
          if (resp14d) {
            const v14 = resp14d.video_views || resp14d.views || resp14d.data?.video_views;
            if (typeof v14 === "number") result.views14d = v14;
          }
          if (resp30d) {
            const v30 = resp30d.video_views || resp30d.views || resp30d.data?.video_views;
            if (typeof v30 === "number") result.views30d = v30;
          }

          // 2. Video list from API (/api/creator/item/list)
          if (respItems) {
            const items = respItems.itemList || respItems.items || respItems.data?.itemList || [];
            if (Array.isArray(items) && items.length > 0) {
              result.totalVideos = Math.max(result.totalVideos, items.length);
              result.videoCount = result.totalVideos;

              const nowSec = Math.floor(Date.now() / 1000);
              let vToday = 0, v7d = 0, v14d = 0, v30d = 0;
              const apiVideos = [];

              for (const item of items) {
                const createTime = item.createTime || item.create_time || 0;
                const ageSec = nowSec - createTime;
                if (ageSec <= 86400) vToday++;
                if (ageSec <= 7 * 86400) v7d++;
                if (ageSec <= 14 * 86400) v14d++;
                if (ageSec <= 30 * 86400) v30d++;

                const playCount = item.stats?.playCount || item.statistics?.play_count || 0;
                const diggCount = item.stats?.diggCount || item.statistics?.digg_count || 0;
                const commentCount = item.stats?.commentCount || item.statistics?.comment_count || 0;
                const shareCount = item.stats?.shareCount || item.statistics?.share_count || 0;
                const desc = item.desc || item.title || "";
                const postDateStr = createTime ? new Date(createTime * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

                apiVideos.push({
                  id: item.id || item.item_id || "",
                  title: desc,
                  views: playCount,
                  likes: diggCount,
                  comments: commentCount,
                  shares: shareCount,
                  postDate: postDateStr,
                  createTime,
                  privacy: item.isPublic !== false ? "Everyone" : "Private",
                });
              }

              result.videosToday = vToday;
              result.videos7d = v7d;
              result.videos14d = v14d;
              result.videos30d = v30d;

              // Merge API videos into videosList if DOM didn't catch all
              if (result.videosList.length === 0 || apiVideos.length > result.videosList.length) {
                result.videosList = apiVideos;
              }

              // Compute top videos for 7d, 28d, 60d, 365d if DOM was on a different tab
              const sortedAll = [...apiVideos].sort((a, b) => b.views - a.views);
              if (result.topVideos.past7d.length === 0) {
                result.topVideos.past7d = sortedAll.filter(v => (nowSec - v.createTime) <= 7 * 86400).slice(0, 5).map((v, idx) => ({
                  rank: idx + 1, title: v.title, viewsInRange: v.views, allViews: v.views, postedOn: v.postDate
                }));
              }
              if (result.topVideos.past28d.length === 0) {
                result.topVideos.past28d = sortedAll.filter(v => (nowSec - v.createTime) <= 28 * 86400).slice(0, 5).map((v, idx) => ({
                  rank: idx + 1, title: v.title, viewsInRange: v.views, allViews: v.views, postedOn: v.postDate
                }));
              }
              if (result.topVideos.past60d.length === 0) {
                result.topVideos.past60d = sortedAll.filter(v => (nowSec - v.createTime) <= 60 * 86400).slice(0, 5).map((v, idx) => ({
                  rank: idx + 1, title: v.title, viewsInRange: v.views, allViews: v.views, postedOn: v.postDate
                }));
              }
              if (result.topVideos.past365d.length === 0) {
                result.topVideos.past365d = sortedAll.slice(0, 10).map((v, idx) => ({
                  rank: idx + 1, title: v.title, viewsInRange: v.views, allViews: v.views, postedOn: v.postDate
                }));
              }
            }
          }
        } catch (apiErr) { }

        // Calculate RPM
        if (result.totalViews > 0 && result.totalRevenue > 0) {
          result.rpm = Number(((result.totalRevenue / (result.totalViews / 1000))).toFixed(3));
        }
      }

      return result;
    } catch (err) {
      console.warn("[TikTokFlow] Extraction error:", err);
      return null;
    } finally {
      isScanning = false;
    }
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

      // Hash to avoid duplicate network reports
      const currentHash = JSON.stringify({
        u: data.username,
        f: data.followersCount,
        v: data.totalVideos,
        rev: data.totalRevenue,
        views: data.totalViews,
        vt: data.viewsToday,
        src: data.metricsSource || "",
      });

      if (currentHash !== lastReportedDataHash) {
        lastReportedDataHash = currentHash;

        console.log("[TikTokFlow] Reporting live stats for logged-in account:", data.username, {
          followers: data.followersCount,
          videos: data.totalVideos,
          revenue: data.totalRevenue,
          views: data.totalViews,
          viewsToday: data.viewsToday,
          viewedProfile: data.viewedProfile || null,
          isOwnProfilePage: !!data.isOwnProfilePage,
        });

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
