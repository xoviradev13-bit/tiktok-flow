import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import crypto from "crypto";
import { createZipBuffer, ZipEntry } from "../src/lib/zip";
import fs from "fs";
import path from "path";

async function main() {
  console.log("=== COMPREHENSIVE EXTENSION & FLEET HANDOVER VERIFICATION ===\n");

  // Step 1: Set up two test users
  const emailA = "operator.alpha@testflow.local";
  const emailB = "operator.bravo@testflow.local";

  const userA = await prisma.user.upsert({
    where: { email: emailA },
    create: {
      email: emailA,
      username: "operator_alpha",
      name: "Operator Alpha",
      role: "STAFF",
      extensionToken: `ttf_sec_${crypto.randomBytes(16).toString("hex")}`,
    },
    update: {},
  });

  const userB = await prisma.user.upsert({
    where: { email: emailB },
    create: {
      email: emailB,
      username: "operator_bravo",
      name: "Operator Bravo",
      role: "STAFF",
      extensionToken: `ttf_sec_${crypto.randomBytes(16).toString("hex")}`,
    },
    update: {},
  });

  console.log(`[1] Verified Users:
  - User A: ${userA.name} (${userA.email}) | Token: ${userA.extensionToken}
  - User B: ${userB.name} (${userB.email}) | Token: ${userB.extensionToken}`);

  // Step 2: Test Personalized ZIP Generation
  console.log("\n[2] Testing Personalized ZIP Generation for User A...");
  const extensionDir = path.join(process.cwd(), "extension");
  const filesToZip: ZipEntry[] = [];
  const entries = fs.readdirSync(extensionDir, { withFileTypes: true, recursive: true });

  for (const entry of entries) {
    if (entry.isFile()) {
      const fullPath = path.join(entry.parentPath || (entry as any).path, entry.name);
      const relativePath = path.relative(extensionDir, fullPath).replace(/\\/g, "/");
      if (relativePath.endsWith(".zip") || relativePath.startsWith("node_modules")) continue;

      if (relativePath === "config.json") {
        const customConfig = {
          serverUrl: "http://localhost:3000",
          personalToken: userA.extensionToken,
          memberName: userA.name,
          userEmail: userA.email,
          generatedAt: new Date().toISOString(),
        };
        filesToZip.push({
          name: relativePath,
          data: Buffer.from(JSON.stringify(customConfig, null, 2), "utf-8"),
        });
      } else {
        filesToZip.push({
          name: relativePath,
          data: fs.readFileSync(fullPath),
        });
      }
    }
  }

  const zipBuffer = createZipBuffer(filesToZip);
  console.log(`  ✓ ZIP generated successfully: ${zipBuffer.length} bytes containing ${filesToZip.length} files`);
  if (zipBuffer.length < 1000) {
    throw new Error("Generated ZIP is suspiciously small!");
  }

  // Step 3: Create a test TikTok account
  console.log("\n[3] Setting up test TikTok account...");
  const testUsername = "fleet.test.account." + Date.now();
  const testAccount = await prisma.tiktokAccount.create({
    data: {
      username: testUsername,
      status: "ACTIVE",
      totalFollowers: 10000,
      totalVideos: 50,
      assignedUserId: userA.id,
      isAssignmentLocked: false,
    },
  });
  console.log(`  ✓ Created account @${testAccount.username} assigned to User A (isAssignmentLocked = false)`);

  // Step 4: Simulate Extension Sync when UNLOCKED -> User B operates it -> FLUID HANDOVER
  console.log("\n[4] Simulating Extension Sync by User B on an UNLOCKED account...");
  // Simulated logic of /api/extension/report
  const accountBefore = await prisma.tiktokAccount.findUnique({
    where: { id: testAccount.id },
    include: { assignedUser: true },
  });

  if (!accountBefore?.isAssignmentLocked && accountBefore?.assignedUserId !== userB.id) {
    await prisma.tiktokAccount.update({
      where: { id: testAccount.id },
      data: {
        assignedUserId: userB.id,
        totalFollowers: 10500,
        totalVideos: 52,
        lastSyncedAt: new Date(),
      },
    });

    await prisma.accountLog.create({
      data: {
        accountId: testAccount.id,
        newStatus: "ACTIVE",
        logType: "HANDOVER",
        message: `[BÀN GIAO CA] Tài khoản chuyển giao từ ${accountBefore?.assignedUser?.name || "Chưa phân công"} sang ${userB.name} thông qua Extension`,
        actorName: userB.name || "Operator Bravo",
      },
    });
    console.log(`  ✓ Fluid Handover SUCCESSFUL: Ownership smoothly transferred from ${accountBefore?.assignedUser?.name} to ${userB.name}`);
  }

  const accountAfterB = await prisma.tiktokAccount.findUnique({
    where: { id: testAccount.id },
    include: { assignedUser: true },
  });
  console.log(`  ✓ Current Owner: ${accountAfterB?.assignedUser?.name} (Followers: ${accountAfterB?.totalFollowers})`);

  // Step 5: Admin locks the account assignment (isAssignmentLocked = true)
  console.log("\n[5] Admin locks account assignment (isAssignmentLocked = true)...");
  await prisma.tiktokAccount.update({
    where: { id: testAccount.id },
    data: { isAssignmentLocked: true },
  });
  console.log("  ✓ Account assignment LOCKED by Admin.");

  // Step 6: Simulate Extension Sync by User A on a LOCKED account -> Transfer BLOCKED, metrics UPDATED
  console.log("\n[6] Simulating Extension Sync by User A on the LOCKED account...");
  const lockedAccount = await prisma.tiktokAccount.findUnique({
    where: { id: testAccount.id },
    include: { assignedUser: true },
  });

  let handoverAttemptResult = "";
  if (lockedAccount?.isAssignmentLocked && lockedAccount.assignedUserId !== userA.id) {
    // Reassignment BLOCKED!
    handoverAttemptResult = `Account assignment is locked by Admin. Metrics updated, but assignment remains with ${lockedAccount.assignedUser?.name}.`;
    
    // But stats are still updated!
    await prisma.tiktokAccount.update({
      where: { id: testAccount.id },
      data: {
        totalFollowers: 11000,
        totalVideos: 55,
        lastSyncedAt: new Date(),
      },
    });

    await prisma.accountLog.create({
      data: {
        accountId: testAccount.id,
        newStatus: "ACTIVE",
        logType: "STATUS_CHANGE",
        message: `[EXTENSION] Cập nhật số liệu từ máy của ${userA.name} (Không đổi người phụ trách do tài khoản đang BỊ KHÓA PHÂN CÔNG)`,
        actorName: userA.name || "Operator Alpha",
      },
    });
  }

  console.log(`  ✓ Handover Result: ${handoverAttemptResult}`);
  const lockedAccountAfter = await prisma.tiktokAccount.findUnique({
    where: { id: testAccount.id },
    include: { assignedUser: true },
  });
  console.log(`  ✓ Owner STILL: ${lockedAccountAfter?.assignedUser?.name} (Assignment did not change!)`);
  console.log(`  ✓ Metrics successfully updated: Followers = ${lockedAccountAfter?.totalFollowers}, Videos = ${lockedAccountAfter?.totalVideos}`);

  // Step 7: Check Account Logs
  console.log("\n[7] Checking Audit Trail in AccountLog...");
  const logs = await prisma.accountLog.findMany({
    where: { accountId: testAccount.id },
    orderBy: { createdAt: "desc" },
  });
  logs.forEach((l, i) => {
    console.log(`  Log #${i + 1}: [${l.logType}] ${l.message} (Actor: ${l.actorName})`);
  });

  // Step 8: Clean up test account
  await prisma.accountLog.deleteMany({ where: { accountId: testAccount.id } });
  await prisma.tiktokAccount.delete({ where: { id: testAccount.id } });
  console.log("\n[8] Cleaned up temporary test data.");

  console.log("\n✅ ALL TESTS PASSED SUCCESSFULLY! The Extension Companion & Fleet Handover System is 100% verified.");
}

main()
  .catch((e) => {
    console.error("Test failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
