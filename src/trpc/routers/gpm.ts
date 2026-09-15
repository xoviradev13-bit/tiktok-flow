import { router, protectedProcedure, leadProcedure } from "@/trpc/init";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { gpmClient } from "@/lib/gpm-api";

function serializeBigInt<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_, value) =>
      typeof value === "bigint" ? Number(value) : value
    )
  );
}

async function getResolvedGpmPort(
  prisma: any,
  userId?: string,
  gpmProfileId?: string,
  explicitPort?: number | null
): Promise<number | null> {
  if (explicitPort && Number.isFinite(explicitPort) && explicitPort > 0) {
    return explicitPort;
  }
  if (gpmProfileId) {
    const acc = await prisma.tiktokAccount.findFirst({
      where: { gpmProfileId },
      select: { gpmPort: true, assignedUser: { select: { gpmPort: true } } },
    });
    if (acc?.gpmPort) return acc.gpmPort;
    if (acc?.assignedUser?.gpmPort) return acc.assignedUser.gpmPort;
  }
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { gpmPort: true },
    });
    if (user?.gpmPort) return user.gpmPort;
  }
  try {
    const cfg = await prisma.systemConfig.findUnique({
      where: { key: "gpm_config" },
    });
    if (cfg?.value) {
      const parsed = JSON.parse(cfg.value);
      if (parsed?.port) return Number(parsed.port);
    }
  } catch {}
  return null;
}

async function syncGpmConfig(prisma: any, targetPort?: number | null) {
  try {
    if (targetPort && Number.isFinite(targetPort) && targetPort > 0) {
      gpmClient.setBaseUrl(`http://127.0.0.1:${targetPort}/api/v1`);
      return;
    }
    const cfg = await prisma.systemConfig.findUnique({
      where: { key: "gpm_config" },
    });
    if (cfg?.value) {
      const parsed = JSON.parse(cfg.value);
      if (parsed?.baseUrl) {
        gpmClient.setBaseUrl(parsed.baseUrl);
      }
    }
  } catch {
    // Ignore config parse errors
  }
}

export const gpmRouter = router({
  // 1. Check GPM-Login Connection (With User & DB Fallback)
  checkStatus: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.session.user.id },
      select: { gpmPort: true, gpmIsOnline: true, gpmLastSeenAt: true },
    });
    const resolvedPort = await getResolvedGpmPort(ctx.prisma, ctx.session.user.id);
    await syncGpmConfig(ctx.prisma, resolvedPort);
    const status = await gpmClient.checkConnection(resolvedPort);

    const isFresh =
      user?.gpmLastSeenAt &&
      Date.now() - user.gpmLastSeenAt.getTime() < 5 * 60 * 1000;
    const dbOnline = !!user?.gpmIsOnline && !!isFresh;

    if (!status.isOnline && dbOnline && resolvedPort) {
      return {
        isOnline: true,
        message: `GPMLogin online qua Client Agent (cổng ${resolvedPort})`,
        baseUrl: `http://127.0.0.1:${resolvedPort}/api/v1`,
        port: resolvedPort,
        viaClientAgent: true,
      };
    }

    return {
      ...status,
      port: status.port || resolvedPort || null,
    };
  }),

  // 2. List GPM Profiles
  listProfiles: protectedProcedure
    .input(
      z
        .object({
          page: z.number().default(1),
          pageSize: z.number().default(100),
          search: z.string().optional(),
          port: z.number().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const targetPort = await getResolvedGpmPort(ctx.prisma, ctx.session.user.id, undefined, input?.port);
      await syncGpmConfig(ctx.prisma, targetPort);
      const res = await gpmClient.listProfiles(
        input?.page || 1,
        input?.pageSize || 100,
        input?.search || ""
      );
      return res;
    }),

  // 3. Start Profile (Verified for assigned Staff, or Lead/Admin)
  startProfile: protectedProcedure
    .input(
      z.object({
        gpmProfileId: z.string(),
        url: z.string().optional(),
        port: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const account = await ctx.prisma.tiktokAccount.findFirst({
        where: { gpmProfileId: input.gpmProfileId },
        select: { id: true, assignedUserId: true, gpmPort: true },
      });

      if (ctx.session.user.role === "STAFF" && account) {
        if (account.assignedUserId !== ctx.session.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Bạn không có quyền khởi động profile này. Profile chưa được gán cho bạn.",
          });
        }
      }

      const targetPort = await getResolvedGpmPort(
        ctx.prisma,
        ctx.session.user.id,
        input.gpmProfileId,
        input.port
      );
      await syncGpmConfig(ctx.prisma, targetPort);

      const targetUrl = input.url || "https://www.tiktok.com/tiktokstudio";
      const res = await gpmClient.startProfile(input.gpmProfileId, {
        additionArgs: targetUrl,
        url: targetUrl,
        port: targetPort,
      });

      if (!res) {
        // Fallback flag for browser / client-agent to open locally on user PC
        return {
          success: false,
          fallbackToLocal: true,
          port: targetPort || 9495,
          gpmProfileId: input.gpmProfileId,
          targetUrl,
          message: `Không thể kết nối trực tiếp từ server tới GPMLogin (cổng ${targetPort || "9495"}). Sẽ mở qua Client Agent trên máy tính của bạn!`,
        };
      }

      return {
        success: true,
        fallbackToLocal: false,
        port: targetPort || (res as any)?.remote_debugging_port || null,
        ...res,
      };
    }),

  // 4. Stop Profile (Verified for assigned Staff, or Lead/Admin)
  stopProfile: protectedProcedure
    .input(
      z.object({
        gpmProfileId: z.string(),
        port: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.session.user.role === "STAFF") {
        const hasAccess = await ctx.prisma.tiktokAccount.findFirst({
          where: {
            gpmProfileId: input.gpmProfileId,
            assignedUserId: ctx.session.user.id,
          },
          select: { id: true },
        });
        if (!hasAccess) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Bạn không có quyền dừng profile này. Profile chưa được gán cho bạn.",
          });
        }
      }
      const targetPort = await getResolvedGpmPort(
        ctx.prisma,
        ctx.session.user.id,
        input.gpmProfileId,
        input.port
      );
      const res = await gpmClient.stopProfile(input.gpmProfileId, { port: targetPort });
      return {
        success: res,
        fallbackToLocal: !res,
        port: targetPort || 9495,
        gpmProfileId: input.gpmProfileId,
      };
    }),

  // 4b. Update Account Port
  updateAccountPort: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
        port: z.number().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const account = await ctx.prisma.tiktokAccount.update({
        where: { id: input.accountId },
        data: { gpmPort: input.port },
      });
      return serializeBigInt(account);
    }),

  // 5. Scan & Import Profiles into Fleet
  scanAndImport: protectedProcedure
    .input(
      z.object({
        autoAssignUserId: z.string().optional().nullable(),
      }).optional()
    )
    .mutation(async ({ ctx, input }) => {
      const health = await gpmClient.checkConnection();
      if (!health.isOnline) {
        // Remote VPS Mode: Web server is on cloud/VPS and cannot reach local GPM directly.
        const syncJob = await ctx.prisma.syncQueue.create({
          data: {
            requestedById: ctx.session.user.id,
            status: "PENDING",
            targetScope: input?.autoAssignUserId || ctx.session.user.id,
            requestedAt: new Date(),
          },
        });
        return {
          totalScanned: 0,
          newImportedCount: 0,
          updatedCount: 0,
          imported: [],
          isRemoteSignal: true,
          syncJobId: syncJob.id,
          message: "Đã tạo yêu cầu đồng bộ. Client Agent trên máy tính cá nhân sẽ tự động nhận và bắt đầu quét ngay!",
        };
      }

      const gpmResult = await gpmClient.listProfiles(1, 200);
      const profiles = gpmResult?.data || [];

      if (!profiles || profiles.length === 0) {
        return {
          totalScanned: 0,
          newImportedCount: 0,
          updatedCount: 0,
          imported: [],
          message: "Không tìm thấy profile nào trong phần mềm GPMLogin.",
        };
      }

      const imported: any[] = [];
      const updated: any[] = [];

      const currentUserId = ctx.session.user.id;
      const currentUserRole = ctx.session.user.role;
      const actorName = ctx.session.user.name || ctx.session.user.email || "GPM Auto-Scanner";

      // Parse handle from profile name (e.g. "@channel_name")
      const profileData = profiles.map((p) => {
        const cleanName = (p.name || "").trim();
        const handleMatch = cleanName.match(/@([a-zA-Z0-9_.]+)/);
        return {
          profile: p,
          realHandle: handleMatch ? handleMatch[1].toLowerCase() : null,
        };
      });

      const allProfileIds = profiles.map((p) => p.id);
      const allHandles = profileData
        .map((pd) => pd.realHandle)
        .filter((h): h is string => Boolean(h));

      const existingAccounts = await ctx.prisma.tiktokAccount.findMany({
        where: {
          OR: [
            { gpmProfileId: { in: allProfileIds } },
            ...(allHandles.length > 0 ? [{ username: { in: allHandles } }] : []),
          ],
        },
        include: {
          assignedUser: {
            select: { id: true, role: true, name: true, username: true },
          },
        },
      });

      const existingByGpmId = new Map<string, (typeof existingAccounts)[0]>();
      const existingByUsername = new Map<string, (typeof existingAccounts)[0]>();
      for (const acc of existingAccounts) {
        if (acc.gpmProfileId) existingByGpmId.set(acc.gpmProfileId, acc);
        if (acc.username) existingByUsername.set(acc.username.toLowerCase(), acc);
      }

      for (const { profile: p, realHandle } of profileData) {
        let existing: (typeof existingAccounts)[0] | null | undefined =
          existingByGpmId.get(p.id) ||
          (realHandle ? existingByUsername.get(realHandle.toLowerCase()) : undefined);

        // Strictly ignore profiles that have never opened / logged into TikTok
        if (!realHandle && !existing) {
          continue;
        }

        const extractedUsername = realHandle || existing?.username || `profile_${p.id.slice(0, 8)}`;

        let country = "US";
        if (p.name.includes("uk") || p.group_id?.includes("UK")) country = "UK";
        else if (p.name.includes("vn") || p.group_id?.includes("VN")) country = "VN";
        else if (p.name.includes("de")) country = "DE";
        else if (p.name.includes("fr")) country = "FR";

        // 1. ATTEMPT INSERT IF NEW
        if (!existing) {
          try {
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
            continue;
          } catch (err: any) {
            if (err?.code === "P2002") {
              existing = await ctx.prisma.tiktokAccount.findUnique({
                where: { username: extractedUsername },
                include: {
                  assignedUser: {
                    select: { id: true, role: true, name: true, username: true },
                  },
                },
              });
              if (!existing) throw err;
            } else {
              throw err;
            }
          }
        }

        // 2. ATOMIC CLAIM OR STATS UPDATE
        const claimWhereCondition: any = {
          id: existing.id,
          ...(currentUserRole === "STAFF"
            ? { assignedUserId: null } // Staff can ONLY claim unassigned accounts
            : {} // Admin/Lead can claim or override
          ),
        };

        const updateData: any = {
          gpmProfileId: p.id,
          groupName: p.group_id || existing.groupName,
          lastSyncedAt: new Date(),
        };
        if (input?.autoAssignUserId) {
          updateData.assignedUserId = input.autoAssignUserId;
        } else if (currentUserId && currentUserRole !== "STAFF") {
          updateData.assignedUserId = currentUserId;
        } else if (currentUserId && currentUserRole === "STAFF" && !existing.assignedUserId) {
          updateData.assignedUserId = currentUserId;
        }

        if (realHandle && existing.username !== realHandle) {
          updateData.username = realHandle;
        }

        const claimResult = await ctx.prisma.tiktokAccount.updateMany({
          where: claimWhereCondition,
          data: updateData,
        });

        if (claimResult.count === 1) {
          if (existing.assignedUserId && existing.assignedUserId !== currentUserId) {
            await ctx.prisma.accountLog.create({
              data: {
                accountId: existing.id,
                newStatus: existing.status,
                logType: "STATUS_CHANGE",
                message: `Admin override: Reassigned management from ${existing.assignedUser?.name || existing.assignedUserId} to ${actorName}`,
                actorName,
              },
            });
          } else if (!existing.assignedUserId && currentUserId) {
            await ctx.prisma.accountLog.create({
              data: {
                accountId: existing.id,
                newStatus: existing.status,
                logType: "STATUS_CHANGE",
                message: `User ${actorName} auto-claimed account from GPMLogin`,
                actorName,
              },
            });
          }
          updated.push({ id: existing.id, ...updateData });
        } else {
          // Claim blocked: Account is owned by another staff member.
          const statsUpdate: any = { lastSyncedAt: new Date() };
          if (realHandle && existing.username !== realHandle) {
            statsUpdate.username = realHandle;
          }
          const up = await ctx.prisma.tiktokAccount.update({
            where: { id: existing.id },
            data: statsUpdate,
          });
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
