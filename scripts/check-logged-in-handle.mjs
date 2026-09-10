/**
 * Comprehensive checks: logged-in handle resolution must NOT prefer visited public profiles.
 * Run: node --experimental-strip-types scripts/check-logged-in-handle.mjs
 *   or: npx tsx scripts/check-logged-in-handle.mjs
 */
import {
  scoreLoggedInHandleFromArtifacts,
  isPlausibleTikTokHandle,
  handlesMatch,
  extractProfileHandleFromPath,
} from "../src/lib/tiktok-handle.ts";

let passed = 0;
let failed = 0;

function assert(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? " — " + detail : ""}`);
  }
}

console.log("\n=== TikTok logged-in handle resolution checks ===\n");

// 1. Basics
assert("plausible handle", isPlausibleTikTokHandle("real_creator99"));
assert("reject foryou", !isPlausibleTikTokHandle("foryou"));
assert("reject explore", !isPlausibleTikTokHandle("explore"));
assert("handlesMatch case-insensitive", handlesMatch("@Alice", "alice"));
assert(
  "extract own path",
  extractProfileHandleFromPath("https://www.tiktok.com/@myaccount/video/1") === "myaccount"
);
assert(
  "extract ignores non-profile",
  extractProfileHandleFromPath("https://www.tiktok.com/foryou") === null
);

// 2. History-only: first visited stranger must NOT win over frequent own profile
{
  const blob = [
    "https://www.tiktok.com/@famous_stranger",
    "https://www.tiktok.com/@another_creator",
    "https://www.tiktok.com/@my_real_account",
    "https://www.tiktok.com/@my_real_account",
    "https://www.tiktok.com/@my_real_account",
  ].join("\n");
  const { handle } = scoreLoggedInHandleFromArtifacts(blob);
  assert(
    "frequency beats first history visit",
    handle?.toLowerCase() === "my_real_account",
    `got ${handle}`
  );
}

// 3. uniqueId must beat a single stray /@ visit
{
  const blob = [
    'https://www.tiktok.com/@random_public_profile',
    '"uniqueId":"session_owner"',
  ].join("\n");
  const { handle } = scoreLoggedInHandleFromArtifacts(blob);
  assert(
    "uniqueId beats single history visit",
    handle?.toLowerCase() === "session_owner",
    `got ${handle}`
  );
}

// 4. UniqId (Studio) highest priority
{
  const blob = [
    '"uniqueId":"old_cached"',
    "https://www.tiktok.com/@old_cached",
    "https://www.tiktok.com/@old_cached",
    "https://www.tiktok.com/@old_cached",
    "https://www.tiktok.com/@old_cached",
    "https://www.tiktok.com/@old_cached",
    '"UniqId":"studio_owner"',
  ].join("\n");
  const { handle } = scoreLoggedInHandleFromArtifacts(blob);
  assert(
    "Studio UniqId beats repeated history",
    handle?.toLowerCase() === "studio_owner",
    `got ${handle}`
  );
}

// 5. Single random history visit alone is insufficient (score < 2)
{
  const blob = "https://www.tiktok.com/@one_off_visit";
  const { handle } = scoreLoggedInHandleFromArtifacts(blob);
  assert("reject single one-off history visit", handle === null, `got ${handle}`);
}

// 6. refer_title alone is weak; needs support
{
  const blob = 'refer_title":"/@maybe_visited"';
  const { handle } = scoreLoggedInHandleFromArtifacts(blob);
  assert("reject weak refer_title alone", handle === null, `got ${handle}`);
}

// 7. Extension-style own-vs-other profile gate
{
  const loggedIn = "my_account";
  const viewedOther = extractProfileHandleFromPath("/@someone_else");
  const viewedOwn = extractProfileHandleFromPath("/@my_account");
  assert("other profile detected", viewedOther === "someone_else");
  assert("own profile detected", handlesMatch(viewedOwn, loggedIn));
  assert("other is not own", !handlesMatch(viewedOther, loggedIn));
}

// 8. Extension content.js must not use generic header @ selector pattern for identity
{
  const fs = await import("fs");
  const content = fs.readFileSync(new URL("../extension/content.js", import.meta.url), "utf8");
  assert(
    "content.js does not use risky header a[href*=/@] for identity",
    !/querySelector\(\s*['"]header a\[href\*=/.test(content)
  );
  assert(
    "content.js gates DOM scrape with isOwnProfilePage",
    content.includes("isOwnProfilePage")
  );
  assert(
    "content.js prefers app-context over user-detail",
    content.includes("webapp.app-context") &&
      content.includes("must never be used as identity")
  );
  assert(
    "content.js skips report when not logged in",
    content.includes("Skipping report — not logged in")
  );
}

// 9. Extractor prefers Studio username over disk handle
{
  const fs = await import("fs");
  const extractor = fs.readFileSync(
    new URL("../src/lib/tiktok-extractor.ts", import.meta.url),
    "utf8"
  );
  assert(
    "extractor uses scoreLoggedInHandleFromArtifacts",
    extractor.includes("scoreLoggedInHandleFromArtifacts")
  );
  assert(
    "extractor prefers studioData.username over disk handle",
    /const finalHandle = studioData\.username \|\| handle/.test(extractor)
  );
  assert(
    "extractor probes passport session before public scrape",
    extractor.includes("passport/web/account/info")
  );
}

// 10. Client-agent uses scoring, not first History match
{
  const fs = await import("fs");
  const agent = fs.readFileSync(new URL("../client-agent/agent.js", import.meta.url), "utf8");
  assert(
    "client-agent uses scoreLoggedInHandleFromArtifacts",
    agent.includes("scoreLoggedInHandleFromArtifacts")
  );
  assert(
    "client-agent does not early-return first History @ match",
    !/while\s*\(\s*\(match\s*=\s*re\.exec/.test(agent)
  );
  assert(
    "client-agent prefers UniqId over detectedHandle",
    /userInfo\?\.UniqId\s*\|\|\s*\n?\s*detectedHandle/.test(agent) ||
      agent.includes("userInfo?.UniqId ||")
  );
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
