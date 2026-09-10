/**
 * Tests GPM ↔ TikTok username matching (pure helpers + live disk resolve).
 * Run: node scripts/test-gpm-username-match.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Load compiled-free TS via tsx if available; else dynamic import of built helpers.
async function loadHelpers() {
  try {
    const { register } = await import("node:module");
    // Prefer tsx
    await import("tsx/esm");
  } catch {
    // ignore — use require with ts-node/register fallback below
  }

  try {
    const handle = await import("../src/lib/tiktok-handle.ts");
    const extractor = await import("../src/lib/tiktok-extractor.ts");
    return { handle, extractor };
  } catch (err) {
    console.error("Failed to import TS modules. Install/use tsx:", err.message);
    process.exit(1);
  }
}

function runPureTests(handle) {
  const {
    extractHandleFromGpmProfileLabel,
    matchUniqueGpmProfileByUsername,
    handlesMatch,
  } = handle;

  assert.equal(extractHandleFromGpmProfileLabel("Profile @user7300481501918"), "user7300481501918");
  assert.equal(extractHandleFromGpmProfileLabel("Profile 3359 [clone]"), null);
  assert.equal(extractHandleFromGpmProfileLabel("user7300481501918"), "user7300481501918");
  assert.ok(handlesMatch("User7300481501918", "user7300481501918"));

  // History glue bug: @userhttps:// must not become a handle; binary terminator must still match
  const polluted = handle.scoreLoggedInHandleFromArtifacts(
    "https://www.tiktok.com/@user7300481501918https://www.tiktok.com/@other\n" +
      "https://www.tiktok.com/@user7300481501918\u0014,\u0003]\n" +
      "https://www.tiktok.com/@user7300481501918user7300481501918 (@user7300481501918) | TikTok\n" +
      "https://www.tiktok.com/@user7300481501918\u0014"
  );
  assert.equal(polluted.handle, "user7300481501918");
  assert.equal(polluted.scores["user7300481501918https"], undefined);
  assert.ok((polluted.scores["user7300481501918"] || 0) >= 2);

  const conf = handle.scoreUsernameInArtifacts(
    "https://www.tiktok.com/@user7300481501918\u0014\n(@user7300481501918)",
    "user7300481501918"
  );
  assert.ok(conf >= 2, `expected score >= 2, got ${conf}`);

  // Unique handle match
  const unique = matchUniqueGpmProfileByUsername("user7300481501918", [
    { id: "aaa", name: "Profile A", tiktokHandle: "other" },
    { id: "bbb", name: "Profile B", tiktokHandle: "user7300481501918" },
  ]);
  assert.equal(unique?.id, "bbb");
  assert.equal(unique?.matchedVia, "tiktokHandle");

  // Unique label match
  const byLabel = matchUniqueGpmProfileByUsername("alice", [
    { id: "1", name: "Work @alice" },
    { id: "2", name: "Profile 2" },
  ]);
  assert.equal(byLabel?.id, "1");
  assert.equal(byLabel?.matchedVia, "label");

  // Ambiguous → null
  const ambig = matchUniqueGpmProfileByUsername("alice", [
    { id: "1", name: "@alice one" },
    { id: "2", name: "also @alice" },
  ]);
  assert.equal(ambig, null);

  // No match
  assert.equal(
    matchUniqueGpmProfileByUsername("nobody", [{ id: "1", name: "Profile 1" }]),
    null
  );

  console.log("✓ Pure matching helpers passed");
}

function runDiskTest(extractor) {
  const { resolveGpmProfileByUsername, getGpmStoragePath } = extractor;

  const storage = getGpmStoragePath();
  console.log(`GPM storage: ${storage}`);

  const expectedId = "32ace987-065a-4fb5-82bf-1cf195fa007c";
  const username = "user7300481501918";

  const resolved = resolveGpmProfileByUsername(username);
  console.log(`resolveGpmProfileByUsername(@${username}):`, resolved);
  assert.equal(
    resolved?.id,
    expectedId,
    "Should uniquely match the profile that has this handle on disk"
  );
  console.log("✓ Live disk resolve matched expected GPM profile");
}

const { handle, extractor } = await loadHelpers();
runPureTests(handle);
runDiskTest(extractor);
console.log("\nAll gpm-username-match checks finished.");
