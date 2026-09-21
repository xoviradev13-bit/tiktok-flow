/**
 * TikTokFlow — m10n diagnostic v2
 * Paste in DevTools console on a plain tiktok.com tab (NOT Studio).
 * Now adds the URL params TikTok's SDK normally injects automatically.
 */
(async () => {
  // Read app context from the page the same way TikTok's SDK does
  const appContext = window.__UNIVERSAL_DATA_FOR_REHYDRATION__?.["__DEFAULT_SCOPE__"]?.["webapp.app-context"]
    || window.__NEXT_DATA__?.props?.pageProps?.serverCode
    || {};

  const aid    = appContext.appId   || "1988";
  const region = appContext.region  || navigator.language?.split("-")[1] || "US";
  const lang   = navigator.language || "en-US";

  console.group("=== TikTokFlow m10n diagnostic v2 ===");
  console.log("Tab:", location.href);
  console.log(`Context: aid=${aid} region=${region} lang=${lang}`);

  const commonParams = new URLSearchParams({
    aid,
    device_platform: "web",
    app_name: "tiktok_web",
    region,
    os: "windows",
    browser_language: lang,
    browser_platform: "Win32",
    browser_name: "Mozilla",
    cookie_enabled: "1",
  }).toString();

  const studioParams = new URLSearchParams({
    aid,
    device_platform: "web",
    app_name: "tiktok_studio_web",
    region,
    browser_language: lang,
  }).toString();

  const variants = [
    { label: "No params (baseline)", params: "" },
    { label: "tiktok_web params", params: commonParams },
    { label: "tiktok_studio_web params", params: studioParams },
  ];

  const BASE = "https://www.tiktok.com/tiktok/v1/creator/m10n_center/reward_analytics";

  for (const v of variants) {
    const url = v.params ? `${BASE}?${v.params}` : BASE;
    try {
      const resp = await fetch(url, {
        credentials: "include",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      const json = await resp.json().catch(() => null);
      const hasData = !!(json?.data);
      console.log(
        `[${resp.status}] ${v.label}`,
        `| hasData=${hasData}`,
        `| status_code=${json?.status_code ?? "n/a"}`,
        `| msg="${json?.status_msg ?? ""}"`,
        hasData ? `| 7d_income=${json.data.seven_d_income}` : ""
      );
    } catch (e) {
      console.warn(`[ERR] ${v.label}: ${e.message}`);
    }
  }

  console.group("Page SDK context");
  console.log("appId:", aid);
  const sdkState = window.__SIGI_STATE__ || window.SIGI_STATE;
  console.log("SIGI_STATE present:", !!sdkState);
  console.groupEnd();

  console.groupEnd();
  console.log("\nIf tiktok_studio_web returns hasData=true → just change app_name in doFetch, no Studio tab needed.");
  console.log("If all fail → Studio page context is required (SDK reads window.location to set params).");
})();
