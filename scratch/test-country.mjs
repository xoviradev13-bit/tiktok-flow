import { detectAccountCountry } from "../client-agent/agent.js";
import assert from "assert";

console.log("[*] Testing detectAccountCountry...");

// Case 1: Passport raw takes highest priority
const c1 = detectAccountCountry({
  passportCountryRaw: "US",
  cookieCountryRaw: "VN",
  pageCountryHints: { region: "DE", storeCountry: "FR" },
  currency: "£",
  profileName: "Account UK",
  gpmGroupName: "Group VN",
});
assert.strictEqual(c1, "US", "Case 1 failed: passportCountryRaw should take precedence");
console.log("  [+] Case 1 passed (passport precedence)");

// Case 2: Cookie country when passport is absent
const c2 = detectAccountCountry({
  passportCountryRaw: null,
  cookieCountryRaw: "gb",
  pageCountryHints: { region: "DE" },
  currency: "$",
  profileName: "Test",
  gpmGroupName: "Group",
});
assert.strictEqual(c2, "UK", "Case 2 failed: cookie country gb -> UK");
console.log("  [+] Case 2 passed (cookie country)");

// Case 3: Region hint when cookie is absent
const c3 = detectAccountCountry({
  passportCountryRaw: null,
  cookieCountryRaw: null,
  pageCountryHints: { region: "de" },
  currency: "$",
  profileName: "Test",
  gpmGroupName: "Group",
});
assert.strictEqual(c3, "DE", "Case 3 failed: region de -> DE");
console.log("  [+] Case 3 passed (region hint)");

// Case 4: Currency detection
const c4 = detectAccountCountry({
  passportCountryRaw: null,
  cookieCountryRaw: null,
  pageCountryHints: null,
  currency: "₫",
  profileName: "General Account",
  gpmGroupName: null,
});
assert.strictEqual(c4, "VN", "Case 4 failed: currency ₫ -> VN");
console.log("  [+] Case 4 passed (currency detection)");

// Case 5: Profile or group name text
const c5 = detectAccountCountry({
  passportCountryRaw: null,
  cookieCountryRaw: null,
  pageCountryHints: null,
  currency: "$",
  profileName: "Beta US Creator",
  gpmGroupName: null,
});
assert.strictEqual(c5, "US", "Case 5 failed: profileName text -> US");
console.log("  [+] Case 5 passed (text detection)");

console.log("[✓] All detectAccountCountry tests PASSED!");
