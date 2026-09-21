import "dotenv/config";
import { prisma } from "../src/lib/prisma.ts";

const recent = await prisma.tiktokAccount.findMany({
  orderBy: { createdAt: "desc" },
  take: 8,
  select: {
    username: true,
    createdAt: true,
    lastSyncedAt: true,
    assignedUser: { select: { email: true, username: true, role: true, name: true } },
    logs: {
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { logType: true, message: true, actorName: true, createdAt: true },
    },
  },
});

for (const a of recent) {
  console.log(
    JSON.stringify(
      {
        username: a.username,
        createdAt: a.createdAt,
        assigned: a.assignedUser
          ? `${a.assignedUser.role} ${a.assignedUser.email || a.assignedUser.username}`
          : null,
        recentLogs: a.logs.map((l) => ({
          t: l.createdAt,
          type: l.logType,
          actor: l.actorName,
          msg: (l.message || "").slice(0, 160),
        })),
      },
      null,
      2
    )
  );
}

await prisma.$disconnect();
