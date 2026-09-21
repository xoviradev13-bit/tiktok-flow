/**
 * TikTokFlow – MAIN world API interceptor
 * Runs at document_start in the page's MAIN world (has window, no chrome APIs).
 * Patches window.fetch to capture TikTok Creator m10n / per-post / user / insights
 * responses as they happen naturally during Studio page load.
 * Sends captured data to the ISOLATED world content.js via CustomEvent.
 */
(function () {
  "use strict";
  if (window.__tiktokflow_intercepted__) return;
  window.__tiktokflow_intercepted__ = true;

  const _origFetch = window.fetch.bind(window);

  window.fetch = async function (input, init) {
    const response = await _origFetch(input, init);
    try {
      const url = typeof input === "string" ? input
        : input instanceof Request ? input.url
        : String(input);

      const fire = (type, data) =>
        window.dispatchEvent(
          new CustomEvent("tiktokflow:api_capture", {
            detail: { type, data, ts: Date.now() },
          })
        );

      if (url.includes("/m10n_center/reward_analytics") && !url.includes("_per_post")) {
        response.clone().json().then((d) => fire("m10n", d)).catch(() => {});
      } else if (url.includes("/m10n_center/reward_analytics_per_post")) {
        response.clone().json().then((d) => fire("per_post", d)).catch(() => {});
      } else if (url.includes("/m10n_center/all_programs")) {
        response.clone().json().then((d) => fire("programs", d)).catch(() => {});
      } else if (url.includes("/tiktokstudio/api/web/user")) {
        response.clone().json().then((d) => fire("user", d)).catch(() => {});
      } else if (url.includes("/aweme/v2/data/insight/")) {
        // Key by day-range so we don't overwrite different ranges
        const dayMatch = url.match(/[?&]days=(\d+)/);
        const key = "insight_" + (dayMatch ? dayMatch[1] : "unknown");
        response.clone().json().then((d) => fire(key, d)).catch(() => {});
      } else if (
        url.includes("/creator/manage/item_list") ||
        url.includes("/content/manage") ||
        (url.includes("item_list") && url.includes("tiktok"))
      ) {
        response.clone().json().then((d) => fire("item_list", d)).catch(() => {});
      }
    } catch (_) { /* never throw */ }
    return response;
  };
})();
