import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const connectionString =
  process.env.DIRECT_URL || process.env.DATABASE_URL || "";

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...");

  // 1. Clear existing data
  await prisma.dailyRevenue.deleteMany({});
  await prisma.dailyChecklistItem.deleteMany({});
  await prisma.dailyChecklist.deleteMany({});
  await prisma.accountAlert.deleteMany({});
  await prisma.accountLog.deleteMany({});
  await prisma.tiktokAccount.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.systemConfig.deleteMany({});

  // 2. Create Users
  const admin = await prisma.user.create({
    data: {
      username: "admin",
      name: "Nguyễn Quốc Đạt (Admin)",
      email: "admin@tiktokflow.io",
      role: "ADMIN",
    },
  });

  const lead = await prisma.user.create({
    data: {
      username: "alex_lead",
      name: "Alex Miller (Team Lead)",
      email: "alex@tiktokflow.io",
      role: "LEAD",
    },
  });

  const staff1 = await prisma.user.create({
    data: {
      username: "sarah_staff",
      name: "Sarah Jenkins (Editor & Op)",
      email: "sarah@tiktokflow.io",
      role: "STAFF",
    },
  });

  const staff2 = await prisma.user.create({
    data: {
      username: "david_staff",
      name: "David Trần (Operator)",
      email: "david@tiktokflow.io",
      role: "STAFF",
    },
  });

  console.log("✅ Seeded Users: 4 users created");

  // 3. Create TikTok Accounts Fleet
  const sampleAccounts = [
    {
      username: "daily_viral_clips_us",
      country: "US",
      groupName: "Team US - Niche Funny",
      status: "ACTIVE" as const,
      assignedUserId: staff1.id,
      totalViews: BigInt(3420000),
      totalFollowers: 145200,
      totalVideos: 124,
      totalRevenue: 2840.5,
      gpmProfileId: "7798d4ca-a002-4a52-9223-5140c68667b1",
    },
    {
      username: "motivation_hub_daily",
      country: "US",
      groupName: "Team US - Motivation",
      status: "ACTIVE" as const,
      assignedUserId: staff1.id,
      totalViews: BigInt(5120000),
      totalFollowers: 289400,
      totalVideos: 210,
      totalRevenue: 4910.2,
      gpmProfileId: "7798d4ca-a002-4a52-9223-5140c68667b2",
    },
    {
      username: "curious_facts_world",
      country: "US",
      groupName: "Team US - Facts",
      status: "RESTRICTED" as const,
      assignedUserId: staff1.id,
      totalViews: BigInt(890000),
      totalFollowers: 43200,
      totalVideos: 68,
      totalRevenue: 620.0,
      gpmProfileId: "7798d4ca-a002-4a52-9223-5140c68667b3",
    },
    {
      username: "luxury_lifestyle_uk",
      country: "UK",
      groupName: "Team UK - Luxury",
      status: "ACTIVE" as const,
      assignedUserId: staff1.id,
      totalViews: BigInt(2100000),
      totalFollowers: 98500,
      totalVideos: 95,
      totalRevenue: 1950.8,
      gpmProfileId: "7798d4ca-a002-4a52-9223-5140c68667b4",
    },
    {
      username: "tech_gadgets_review_us",
      country: "US",
      groupName: "Team US - Tech Affiliate",
      status: "ACTIVE" as const,
      assignedUserId: staff2.id,
      totalViews: BigInt(6200000),
      totalFollowers: 312000,
      totalVideos: 180,
      totalRevenue: 5820.0,
      gpmProfileId: "7798d4ca-a002-4a52-9223-5140c68667b5",
    },
    {
      username: "satisfying_asmr_relax",
      country: "DE",
      groupName: "Team EU - ASMR",
      status: "WARMING" as const,
      assignedUserId: staff2.id,
      totalViews: BigInt(120000),
      totalFollowers: 12400,
      totalVideos: 25,
      totalRevenue: 45.0,
      gpmProfileId: "7798d4ca-a002-4a52-9223-5140c68667b6",
    },
    {
      username: "crypto_trends_insider",
      country: "US",
      groupName: "Team US - Finance",
      status: "BANNED" as const,
      assignedUserId: staff2.id,
      totalViews: BigInt(1450000),
      totalFollowers: 76000,
      totalVideos: 82,
      totalRevenue: 1350.0,
      gpmProfileId: "7798d4ca-a002-4a52-9223-5140c68667b7",
    },
    {
      username: "pet_cuteness_overload",
      country: "FR",
      groupName: "Team EU - Pets",
      status: "ACTIVE" as const,
      assignedUserId: staff2.id,
      totalViews: BigInt(4100000),
      totalFollowers: 220000,
      totalVideos: 140,
      totalRevenue: 3450.0,
      gpmProfileId: "7798d4ca-a002-4a52-9223-5140c68667b8",
    },
  ];

  const createdAccounts = [];
  for (const acc of sampleAccounts) {
    const created = await prisma.tiktokAccount.create({
      data: {
        ...acc,
        lastSyncedAt: new Date(),
      },
    });
    createdAccounts.push(created);

    // Create Initial Audit Log
    await prisma.accountLog.create({
      data: {
        accountId: created.id,
        oldStatus: null,
        newStatus: created.status,
        logType: "STATUS_CHANGE",
        message: `Account initialized and assigned to ${acc.assignedUserId === staff1.id ? "Sarah Jenkins" : "David Trần"}`,
        actorName: "System",
      },
    });
  }

  console.log(`✅ Seeded Accounts: ${createdAccounts.length} accounts created`);

  // 4. Create Sample Alerts
  await prisma.accountAlert.create({
    data: {
      accountId: createdAccounts[2].id, // curious_facts_world
      alertType: "LOW_QUALITY",
      severity: "WARNING",
      description: "Video ID #7329182 flagged for unoriginal content / low quality. Distribution reduced.",
      status: "OPEN",
    },
  });

  await prisma.accountAlert.create({
    data: {
      accountId: createdAccounts[6].id, // crypto_trends_insider
      alertType: "PROGRAM_DISQUALIFIED",
      severity: "CRITICAL",
      description: "Account banned and removed from Creator Rewards Beta due to community guidelines strike.",
      status: "OPEN",
    },
  });

  // 5. Create Daily Checklist for Today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Sarah's Checklist (4 accounts, 4 completed -> 100% -> 1.0 công)
  const sarahChecklist = await prisma.dailyChecklist.create({
    data: {
      userId: staff1.id,
      date: today,
      totalAssigned: 4,
      completedCount: 4,
      completionRate: 100.0,
      workdayScore: 1.0,
      isLocked: false,
    },
  });

  const sarahAccounts = createdAccounts.filter((a) => a.assignedUserId === staff1.id);
  for (const acc of sarahAccounts) {
    await prisma.dailyChecklistItem.create({
      data: {
        checklistId: sarahChecklist.id,
        accountId: acc.id,
        isPosted: true,
        isSynced: true,
        isCompleted: true,
        notes: "Posted 2 videos on schedule, analytics synced via GPM.",
      },
    });
  }

  // David's Checklist (4 accounts, 2 completed -> 50% -> 0.5 công)
  const davidChecklist = await prisma.dailyChecklist.create({
    data: {
      userId: staff2.id,
      date: today,
      totalAssigned: 4,
      completedCount: 2,
      completionRate: 50.0,
      workdayScore: 0.5,
      isLocked: false,
    },
  });

  const davidAccounts = createdAccounts.filter((a) => a.assignedUserId === staff2.id);
  for (let i = 0; i < davidAccounts.length; i++) {
    const acc = davidAccounts[i];
    const isDone = i < 2;
    await prisma.dailyChecklistItem.create({
      data: {
        checklistId: davidChecklist.id,
        accountId: acc.id,
        isPosted: isDone,
        isSynced: isDone,
        isCompleted: isDone,
        notes: isDone ? "Completed 1 video" : "Pending upload before 10:00 AM",
      },
    });
  }

  // 6. Seed Daily Revenues for the past 7 days
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);

    for (const acc of createdAccounts) {
      if (acc.status === "BANNED") continue;
      const baseRev = (Math.random() * 80 + 20);
      const rpm = (Math.random() * 0.4 + 0.35);
      const views = Math.floor((baseRev / rpm) * 1000);

      await prisma.dailyRevenue.create({
        data: {
          accountId: acc.id,
          date: d,
          revenue: Math.round(baseRev * 100) / 100,
          views: BigInt(views),
          rpm: Math.round(rpm * 100) / 100,
          sourceType: "CREATOR_REWARDS",
        },
      });
    }
  }

  console.log("✅ Seeded Checklists and 7-day Historical Revenues");

  // 7. Seed System Configurations
  await prisma.systemConfig.createMany({
    data: [
      {
        key: "scoring_rules",
        value: JSON.stringify({
          cutOffHour: 10,
          cutOffMinute: 0,
          fullDayThreshold: 85,
          halfDayThreshold: 50,
          requireDataSync: true,
        }),
        description: "Quy tắc tính KPI công hàng ngày",
      },
      {
        key: "gpm_config",
        value: JSON.stringify({
          baseUrl: "http://localhost:9495/api/v1",
          autoSyncTime: "09:00",
          enabled: true,
        }),
        description: "Cấu hình kết nối GPMLogin Local API",
      },
    ],
  });

  console.log("✅ Seeded System Configurations");
  console.log("\n🚀 All database tables seeded with high fidelity TikTok automation fleet data!");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
