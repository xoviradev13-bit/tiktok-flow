import { prisma } from "../src/lib/prisma";

async function main() {
  const acc = await prisma.tiktokAccount.findUnique({
    where: { username: "ceotelamonix" },
    select: { id: true, username: true, status: true, bannedReason: true, totalFollowers: true, metadata: true },
  });
  console.log("Account before:", JSON.stringify(acc, null, 2));

  if (acc && acc.status === "BANNED" && acc.totalFollowers < 10000) {
    const meta = (acc.metadata as Record<string, any>) || {};
    delete meta.bannedReason;
    meta.creatorRewardsStatus = "ACTIVE";
    meta.recoveredAt = new Date().toISOString();

    const updated = await prisma.tiktokAccount.update({
      where: { id: acc.id },
      data: {
        status: "ACTIVE",
        bannedReason: null,
        metadata: meta,
      },
      select: { id: true, username: true, status: true, bannedReason: true, totalFollowers: true },
    });
    console.log("Account recovered successfully:", JSON.stringify(updated, null, 2));

    await prisma.accountLog.create({
      data: {
        accountId: acc.id,
        oldStatus: "BANNED",
        newStatus: "ACTIVE",
        logType: "STATUS_CHANGE",
        message: `[KHÔI PHÚC TRẠNG THÁI] Tự động giải phóng trạng thái BANNED do tài khoản < 10.000 followers chưa từng tham gia Creator Rewards Program. Trạng thái: ACTIVE.`,
        actorName: "System",
      },
    });

    await prisma.accountAlert.updateMany({
      where: {
        accountId: acc.id,
        alertType: "PROGRAM_DISQUALIFIED",
        status: "OPEN",
      },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
      },
    });
  }
}

main()
  .catch((e) => console.error("Error:", e))
  .finally(() => process.exit(0));
