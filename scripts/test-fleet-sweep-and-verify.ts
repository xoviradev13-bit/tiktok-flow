import "dotenv/config";
import path from "path";
import fs from "fs";
import { prisma } from "../src/lib/prisma.js";
import {
  getGpmStoragePath,
  getChromeExecutablePath,
  extractProfileStudio,
  findTikTokHandleInProfile,
  readGpmProfileMetaFromDisk,
} from "../client-agent/agent.js";
import { revealPersonalToken } from "../src/lib/extension-auth.js";
import { POST as reportRoute } from "../src/app/api/extension/report/route.js";

async function main() {
  const adminUser = await prisma.user.findFirst({
    where: { role: "ADMIN", extensionToken: { not: null } },
  });
  if (!adminUser || !adminUser.extensionToken) {
    throw new Error("No admin user with extensionToken found");
  }
  const token = revealPersonalToken(adminUser.extensionToken);
  if (!token) {
    throw new Error("Failed to unseal extensionToken");
  }
  console.log(`Using admin user: ${adminUser.email} (token: ${token.slice(0, 15)}...)`);

  const storagePath = getGpmStoragePath();
  const chromePath = getChromeExecutablePath();
  const entries = fs.readdirSync(storagePath, { withFileTypes: true });
  const diskDirs = entries.filter(
    (e) =>
      e.isDirectory() &&
      !e.name.startsWith("_") &&
      /^[0-9a-f-]{36}$/i.test(e.name) &&
      fs.existsSync(path.join(storagePath, e.name, "Default"))
  );

  console.log(`=== FOUND ${diskDirs.length} GPM PROFILES ON DISK ===`);

  // Build profile list
  const profilesToSync = [];
  for (const p of diskDirs) {
    const fullDir = path.join(storagePath, p.name);
    const handle = findTikTokHandleInProfile(fullDir);
    const meta = readGpmProfileMetaFromDisk(storagePath, p.name);
    const profileName = meta.name || `Profile ${p.name.slice(0, 8)}`;
    profilesToSync.push({
      id: p.name,
      name: profileName,
      groupId: meta.groupId || null,
      groupName: meta.groupName || null,
      tiktokHandle: handle,
      fullDir,
    });
  }

  // Deduplicate by known handle
  const seenHandles = new Set();
  const activeProfiles = [];
  for (const p of profilesToSync) {
    if (p.tiktokHandle) {
      const lower = p.tiktokHandle.toLowerCase();
      if (seenHandles.has(lower)) {
        console.log(`[*] [Deduplicate Skip] Profile ${p.name} (${p.id.slice(0, 8)}) - @${p.tiktokHandle} already queued.`);
        continue;
      }
      seenHandles.add(lower);
    }
    activeProfiles.push(p);
  }

  console.log(`\n=== SCANNING ${activeProfiles.length} UNIQUE ACCOUNTS (Sequential, safe) ===`);
  const reportedUsernames = new Set();

  for (let i = 0; i < activeProfiles.length; i++) {
    const p = activeProfiles[i];
    const label = p.tiktokHandle ? `@${p.tiktokHandle}` : `Profile ${p.id.slice(0, 8)}`;
    console.log(`\n[${i + 1}/${activeProfiles.length}] Scanning ${label}...`);
    const t0 = Date.now();

    try {
      const res = await extractProfileStudio(p.fullDir, p.id, chromePath, p.tiktokHandle);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

      if (res.success && res.data) {
        const d = res.data;
        const normUser = (d.username || "").toLowerCase();
        if (normUser && reportedUsernames.has(normUser)) {
          console.log(` -> Already reported @${d.username} in this run; skipping duplicate.`);
          continue;
        }
        if (normUser) reportedUsernames.add(normUser);

        console.log(` -> EXTRACTED in ${elapsed}s: @${d.username}`);
        console.log(`    Followers: ${d.followersCount} | Views: ${d.totalViews} | Videos: ${d.totalVideos} | Revenue: ${d.currency}${d.totalRevenue || 0}`);

        // Post directly to report route handler
        const payload = {
          ...d,
          gpmProfileName: d.gpmProfileName || p.name,
          gpmGroupName: d.gpmGroupName || p.groupName || undefined,
          source: "agent",
          metricsSource: "agent",
        };

        const req = new Request("http://localhost:3000/api/extension/report", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        const routeRes = await reportRoute(req);
        const routeData = await routeRes.json();
        console.log(` -> REPORT ROUTE HTTP ${routeRes.status}:`, routeData.success ? "SUCCESS" : routeData);
      } else {
        console.log(` -> FAILED in ${elapsed}s: ${res.error}`);
      }
    } catch (e: any) {
      console.log(` -> EXCEPTION: ${e.message}`);
    }
  }

  // VERIFY DATABASE
  console.log("\n========================================================");
  console.log("   FINAL VERIFICATION OF ALL ACCOUNTS & ANALYTICS        ");
  console.log("========================================================");

  const allAccounts = await prisma.tiktokAccount.findMany({
    include: {
      analytics: true,
      dailyRevenues: { take: 3 },
    },
    orderBy: { username: "asc" },
  });

  console.log(`Total TikTok Accounts in DB: ${allAccounts.length}`);
  let analyticsCount = 0;

  for (const a of allAccounts) {
    const hasAnalytics = !!a.analytics;
    if (hasAnalytics) analyticsCount++;
    console.log(`\nAccount: @${a.username} (GPM: ${a.gpmProfileName || a.gpmProfileId})`);
    console.log(`  - Followers: ${a.totalFollowers}`);
    console.log(`  - Views: ${a.totalViews}`);
    console.log(`  - Videos: ${a.totalVideos}`);
    console.log(`  - Revenue: ${a.totalRevenue}`);
    console.log(`  - Status: ${a.status}`);
    console.log(`  - LastSyncedAt: ${a.lastSyncedAt?.toISOString()}`);
    console.log(`  - Has AccountAnalytics: ${hasAnalytics ? "YES" : "NO"}`);
    if (a.analytics) {
      console.log(`    * sumViews:`, a.analytics.sumViews);
      console.log(`    * sumRevenue:`, a.analytics.sumRevenue);
      console.log(`    * updatedAt: ${a.analytics.updatedAt?.toISOString()}`);
    }
  }

  console.log("\n--------------------------------------------------------");
  console.log(`SUMMARY: ${analyticsCount}/${allAccounts.length} accounts have AccountAnalytics created.`);
  console.log("========================================================\n");
}

main().catch(console.error).finally(() => process.exit(0));
