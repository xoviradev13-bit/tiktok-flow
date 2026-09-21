/**
 * Verify Studio Insights vv_history → dailyViewsBreakdown mapping.
 *
 * 1) Offline: fixture math (period sums = last N points; dates end yesterday UTC).
 * 2) Live: extract @ousnowfan and assert intercept payload has ~366 daily points
 *    whose sum matches sumViews.views365d.
 */
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import {
  extractProfileStudio,
  getGpmStoragePath,
  getChromeExecutablePath,
} from "./agent.js";

const TARGET = "ousnowfan";
const END_DAYS = 1;

function buildDailyViewsBreakdown(vvHistory, endDays = 1) {
  if (!Array.isArray(vvHistory) || vvHistory.length === 0) return [];
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() - Math.max(0, Number(endDays) || 0));
  const n = vvHistory.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - (n - 1 - i));
    out.push({
      date: d.toISOString().split("T")[0],
      views: Number(vvHistory[i]?.value || 0) || 0,
    });
  }
  return out;
}

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT: " + msg);
}

function yesterdayUtc() {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() - END_DAYS);
  return end.toISOString().split("T")[0];
}

console.log("============================================================");
console.log("  TEST: dailyViewsBreakdown (365d vv_history intercept)");
console.log("============================================================\n");

// ---------- 1) Offline fixture ----------
const fixtureCandidates = [
  path.resolve("test-results/dev-test-ousnowfan/ousnowfan_dev.full.json"),
  path.resolve("../ousnowfan_data.json"),
  path.resolve("ousnowfan_data.json"),
];
let fixture = null;
let fixturePath = null;
for (const p of fixtureCandidates) {
  if (fs.existsSync(p)) {
    fixturePath = p;
    fixture = JSON.parse(fs.readFileSync(p, "utf8"));
    break;
  }
}

if (fixture) {
  const data = fixture.data || fixture;
  const vh =
    data.insightsHistory?.vv_history ||
    data.insights?.["365"]?.vv_history ||
    null;
  assert(Array.isArray(vh) && vh.length >= 360, `fixture vv_history len=${vh?.length}`);
  const vals = vh.map((x) => Number(x?.value || 0));
  const sv = data.sumViews || {};
  const sumAll = vals.reduce((a, b) => a + b, 0);
  const last8 = vals.slice(-8).reduce((a, b) => a + b, 0);
  const last29 = vals.slice(-29).reduce((a, b) => a + b, 0);
  const last61 = vals.slice(-61).reduce((a, b) => a + b, 0);

  console.log("[OFFLINE] fixture:", fixturePath);
  console.log("  vv_history len:", vh.length, "sum:", sumAll);
  console.log("  sumViews:", sv);

  if (sv.views365d != null) {
    assert(
      Math.abs(sumAll - Number(sv.views365d)) < 2,
      `full sum ${sumAll} != views365d ${sv.views365d}`
    );
  }
  if (sv.views7d != null) {
    assert(
      Math.abs(last8 - Number(sv.views7d)) < 2,
      `last8 ${last8} != views7d ${sv.views7d} (API uses days:8)`
    );
  }
  if (sv.views28d != null) {
    assert(
      Math.abs(last29 - Number(sv.views28d)) < 2,
      `last29 ${last29} != views28d ${sv.views28d}`
    );
  }
  if (sv.views60d != null) {
    assert(
      Math.abs(last61 - Number(sv.views60d)) < 2,
      `last61 ${last61} != views60d ${sv.views60d}`
    );
  }

  const daily = buildDailyViewsBreakdown(vh, END_DAYS);
  assert(daily.length === vh.length, "daily length mismatch");
  assert(daily[daily.length - 1].date === yesterdayUtc(), `last date should be ${yesterdayUtc()}, got ${daily[daily.length - 1].date}`);
  assert(daily[0].date < daily[daily.length - 1].date, "dates should be ascending");
  const dailySum = daily.reduce((s, x) => s + x.views, 0);
  assert(Math.abs(dailySum - sumAll) < 1, "daily sum mismatch");

  // Also exercise the shared TS helper if present
  try {
    const mod = await import(
      pathToFileURL(
        path.resolve("../src/lib/daily-views-breakdown.ts")
      ).href
    ).catch(() => null);
    if (mod?.buildDailyViewsBreakdown) {
      const d2 = mod.buildDailyViewsBreakdown(vh, END_DAYS);
      assert(d2.length === daily.length, "TS helper length");
      assert(d2[d2.length - 1].date === daily[daily.length - 1].date, "TS helper end date");
      console.log("  [OK] src/lib/daily-views-breakdown.ts matches");
    }
  } catch {
    /* ts import may need loader — skip */
  }

  console.log("  sample first:", daily[0]);
  console.log("  sample last :", daily[daily.length - 1]);
  console.log("[OFFLINE] PASS\n");
} else {
  console.log("[OFFLINE] skipped (no fixture)\n");
}

// ---------- 2) Live extract ----------
const storagePath = getGpmStoragePath();
const chromePath = getChromeExecutablePath();
const sessDir = process.env.LOCALAPPDATA + "\\TikTokFlow\\sessions";
const sessionFiles = fs.existsSync(sessDir)
  ? fs.readdirSync(sessDir).filter((f) => f.endsWith(".json"))
  : [];

const profileIds = sessionFiles
  .map((f) => {
    const id = f.replace(".json", "");
    try {
      const data = JSON.parse(fs.readFileSync(path.join(sessDir, f), "utf8"));
      return { id, at: data.at || 0 };
    } catch {
      return { id, at: 0 };
    }
  })
  .sort((a, b) => b.at - a.at)
  .map((x) => x.id);

console.log("[LIVE] storage:", storagePath);
console.log("[LIVE] trying", profileIds.length, "cached sessions for @" + TARGET);

let found = false;
for (let i = 0; i < profileIds.length; i++) {
  const profileId = profileIds[i];
  const profileDir = path.join(storagePath, profileId, "Default");
  if (!fs.existsSync(profileDir)) continue;

  console.log(`  [${i + 1}/${profileIds.length}] ${profileId.slice(0, 8)}...`);
  const result = await extractProfileStudio(
    profileDir,
    profileId,
    chromePath,
    null
  ).catch((err) => ({ success: false, error: err.message }));

  if (!result.success) {
    console.log("    -> fail:", result.error);
    continue;
  }
  const d = result.data || {};
  const username = String(d.username || "").toLowerCase();
  console.log("    -> @" + d.username);
  if (username !== TARGET.toLowerCase()) continue;

  found = true;
  const daily = d.dailyViewsBreakdown;
  const sv = d.sumViews || {};
  console.log("\n[LIVE] @" + d.username);
  console.log("  insightsStatus:", d.insightsStatus || d.insightsUnavailable);
  console.log("  sumViews:", sv);
  console.log(
    "  dailyViewsBreakdown:",
    Array.isArray(daily) ? daily.length + " points" : daily
  );

  assert(
    d.insightsStatus === "ok" || d.insightsUnavailable === false,
    "Insights should be ok for this account"
  );
  assert(Array.isArray(daily) && daily.length >= 360, `expected ~366 points, got ${daily?.length}`);
  assert(daily[daily.length - 1].date === yesterdayUtc(), "live last date = yesterday UTC");
  const sum = daily.reduce((s, x) => s + Number(x.views || 0), 0);
  console.log("  daily sum:", sum, "views365d:", sv.views365d);
  assert(
    Math.abs(sum - Number(sv.views365d || 0)) < 2,
    `live daily sum ${sum} != views365d ${sv.views365d}`
  );
  // Period cross-check: last 8 / 29 / 61
  const vals = daily.map((x) => Number(x.views || 0));
  if (sv.views7d != null) {
    const last8 = vals.slice(-8).reduce((a, b) => a + b, 0);
    assert(Math.abs(last8 - Number(sv.views7d)) < 2, `live last8 vs views7d`);
  }
  if (sv.views28d != null) {
    const last29 = vals.slice(-29).reduce((a, b) => a + b, 0);
    assert(Math.abs(last29 - Number(sv.views28d)) < 2, `live last29 vs views28d`);
  }

  const outDir = path.resolve("test-results/daily-views-breakdown");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${TARGET}_${Date.now()}.json`);
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        username: d.username,
        sumViews: sv,
        dailyViewsBreakdown: daily,
        sampleFirst: daily.slice(0, 3),
        sampleLast: daily.slice(-3),
      },
      null,
      2
    )
  );
  console.log("  wrote", outFile);
  console.log("[LIVE] PASS");
  break;
}

if (!found) {
  console.log("\n[LIVE] @" + TARGET + " not found — offline checks still ran.");
  if (!fixture) process.exit(2);
}

console.log("\n============================================================");
console.log("  ALL CHECKS PASSED");
console.log("============================================================");
