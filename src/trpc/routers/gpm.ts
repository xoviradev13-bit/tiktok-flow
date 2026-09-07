import { router, protectedProcedure, leadProcedure } from "@/trpc/init";
import { z } from "zod";
import { gpmClient } from "@/lib/gpm-api";
import { findTikTokHandleInProfile, detectTikTokAccountFromGpm } from "@/lib/tiktok-extractor";

function serializeBigInt<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_, value) =>
      typeof value === "bigint" ? Number(value) : value
    )
  );
}

export const gpmRouter = router({
  // 1. Check GPM-Login Connection
  checkStatus: protectedProcedure.query(async () => {
    return await gpmClient.checkConnection();
  }),

  // 2. List GPM Profiles
  listProfiles: protectedProcedure
    .input(
      z.object({
        page: z.number().default(1),
        pageSize: z.number().default(100),
        search: z.string().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const res = await gpmClient.listProfiles(
        input?.page || 1,
        input?.pageSize || 100,
        input?.search || ""
      );
      return res;
    }),

  // 3. Start Profile
  startProfile: protectedProcedure
    .input(z.object({ gpmProfileId: z.string() }))
    .mutation(async ({ input }) => {
      const res = await gpmClient.startProfile(input.gpmProfileId);
      return res;
    }),

  // 4. Stop Profile
  stopProfile: protectedProcedure
    .input(z.object({ gpmProfileId: z.string() }))
    .mutation(async ({ input }) => {
      const res = await gpmClient.stopProfile(input.gpmProfileId);
      return { success: res };
    }),

  // 5. Scan & Import Profiles into Fleet
  scanAndImport: protectedProcedure
    .input(
      z.object({
        autoAssignUserId: z.string().optional().nullable(),
      }).optional()
    )
    .mutation(async ({ ctx, input }) => {
      const gpmResult = await gpmClient.listProfiles(1, 200);
      const profiles = gpmResult?.data || [];

      if (!profiles || profiles.length === 0) {
        return {
          totalScanned: 0,
          newImportedCount: 0,
          updatedCount: 0,
          imported: [],
          message: "No profiles found in GPMLogin software.",
        };
      }

      const imported: any[] = [];
      const updated: any[] = [];

      const currentUserId = ctx.session.user.id;
      const currentUserRole = ctx.session.user.role;
      const actorName = ctx.session.user.name || ctx.session.user.email || "GPM Auto-Scanner";

      for (const p of profiles) {
        const realHandle = findTikTokHandleInProfile(p.id);

        const existing = await ctx.prisma.tiktokAccount.findFirst({
          where: {
            OR: [
              { gpmProfileId: p.id },
              ...(realHandle ? [{ username: realHandle }] : []),
            ],
          },
          include: {
            assignedUser: {
              select: { id: true, role: true, name: true, username: true },
            },
          },
        });

        // Strictly ignore profiles that have never opened / logged into TikTok
        if (!realHandle && !existing) {
          continue;
        }

        const extractedUsername = realHandle || existing?.username || `profile_${p.id.slice(0, 8)}`;

        if (!existing) {
          let country = "US";
          if (p.name.includes("uk") || p.group_id?.includes("UK")) country = "UK";
          else if (p.name.includes("vn") || p.group_id?.includes("VN")) country = "VN";
          else if (p.name.includes("de")) country = "DE";
          else if (p.name.includes("fr")) country = "FR";

          let assignedUserId: string | null = null;
          if (input?.autoAssignUserId) {
            assignedUserId = input.autoAssignUserId;
          } else if (currentUserRole === "STAFF" && currentUserId) {
            assignedUserId = currentUserId;
          }

          const newAccount = await ctx.prisma.tiktokAccount.create({
            data: {
              username: extractedUsername,
              country,
              groupName: p.group_id || "GPM Fleet",
              gpmProfileId: p.id,
              status: "ACTIVE",
              assignedUserId,
              totalViews: BigInt(0),
              totalFollowers: 0,
              totalVideos: 0,
              totalRevenue: 0,
              lastSyncedAt: new Date(),
            },
          });

          await ctx.prisma.accountLog.create({
            data: {
              accountId: newAccount.id,
              newStatus: "ACTIVE",
              logType: "STATUS_CHANGE",
              message: assignedUserId
                ? `Auto-imported & assigned to ${actorName} from GPM-Login Profile "${p.name}" (ID: ${p.id})`
                : `Auto-imported from GPM-Login Profile "${p.name}" (ID: ${p.id})`,
              actorName,
            },
          });

          imported.push(newAccount);
        } else {
          const updateData: any = {
            gpmProfileId: p.id,
            groupName: p.group_id || existing.groupName,
            lastSyncedAt: new Date(),
          };
          if (realHandle && existing.username !== realHandle) {
            updateData.username = realHandle;
          }

          let reassignedLogMsg: string | null = null;

          // Smart Auto-Claim Logic:
          if (currentUserRole === "STAFF" && currentUserId) {
            if (!existing.assignedUserId) {
              updateData.assignedUserId = currentUserId;
              reassignedLogMsg = `User ${actorName} auto-claimed account from GPMLogin`;
            } else if (
              existing.assignedUserId !== currentUserId &&
              (existing.assignedUser?.role === "ADMIN" || existing.assignedUser?.role === "LEAD")
            ) {
              updateData.assignedUserId = currentUserId;
              reassignedLogMsg = `Transferred management from ${existing.assignedUser?.name || existing.assignedUser?.username || "Admin"} to ${actorName}`;
            }
          }

          const up = await ctx.prisma.tiktokAccount.update({
            where: { id: existing.id },
            data: updateData,
          });

          if (reassignedLogMsg) {
            await ctx.prisma.accountLog.create({
              data: {
                accountId: existing.id,
                newStatus: existing.status,
                logType: "STATUS_CHANGE",
                message: reassignedLogMsg,
                actorName,
              },
            });
          }

          updated.push(up);
        }
      }

      return {
        totalScanned: profiles.length,
        newImportedCount: imported.length,
        updatedCount: updated.length,
        imported: serializeBigInt(imported),
        message: `Scanned ${profiles.length} profiles from GPMLogin. New: ${imported.length}, Updated: ${updated.length}`,
      };
    }),
});
