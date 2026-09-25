import { router, adminProcedure, protectedProcedure, leadProcedure } from "@/trpc/init";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { clearUserCache } from "@/lib/auth";
import { resolveUserScope } from "@/lib/lead-scoping";
import {
  generatePersonalToken,
  persistPersonalTokenValue,
  revealPersonalToken,
  revokeExtensionCredentials,
  writeMachineBindingLog,
} from "@/lib/extension-auth";
import { recordBulkAccountTransfer } from "@/lib/account-assignment-history";

async function syncTeamLeaderRoles(
  prisma: any,
  options: {
    teamId: string;
    newLeaderId?: string | null;
    oldLeaderId?: string | null;
  }
) {
  const { teamId, newLeaderId, oldLeaderId } = options;

  if (oldLeaderId && oldLeaderId !== newLeaderId) {
    const remainingCount = await prisma.team.count({
      where: { leaderId: oldLeaderId, id: { not: teamId } },
    });
    if (remainingCount === 0) {
      const oldLeader = await prisma.user.findUnique({
        where: { id: oldLeaderId },
        select: { role: true },
      });
      if (oldLeader?.role === "LEAD") {
        await prisma.user.update({
          where: { id: oldLeaderId },
          data: { role: "STAFF" },
        });
      }
    }
  }

  if (newLeaderId) {
    const newLeader = await prisma.user.findUnique({
      where: { id: newLeaderId },
      select: { role: true, teamId: true },
    });
    if (newLeader) {
      const updateData: any = {};
      if (newLeader.role === "STAFF") {
        updateData.role = "LEAD";
      }
      if (!newLeader.teamId) {
        updateData.teamId = teamId;
      }
      if (Object.keys(updateData).length > 0) {
        await prisma.user.update({
          where: { id: newLeaderId },
          data: updateData,
        });
      }
    }
  }
}

async function onTeamDeleted(prisma: any, teamId: string, leaderId: string | null) {
  if (!leaderId) return;
  const remainingCount = await prisma.team.count({
    where: { leaderId, id: { not: teamId } },
  });
  if (remainingCount === 0) {
    const leader = await prisma.user.findUnique({
      where: { id: leaderId },
      select: { role: true },
    });
    if (leader?.role === "LEAD") {
      await prisma.user.update({
        where: { id: leaderId },
        data: { role: "STAFF" },
      });
    }
  }
}

async function fetchTeamsData(prisma: any, fallbackUserId?: string) {
  let dbTeams: any[] = [];
  try {
    dbTeams = await prisma.team.findMany({
      include: {
        leader: {
          select: {
            id: true,
            name: true,
            fullName: true,
            username: true,
            email: true,
            avatar: true,
            role: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            fullName: true,
            username: true,
            email: true,
            avatar: true,
            role: true,
          },
        },
        members: {
          select: {
            id: true,
            name: true,
            fullName: true,
            username: true,
            email: true,
            avatar: true,
            role: true,
            isActive: true,
            _count: {
              select: { tiktokAccounts: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        _count: {
          select: { members: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  } catch (e) {
    console.warn("[fetchTeamsData] query error:", e);
  }

  if (dbTeams.length === 0 && fallbackUserId) {
    const defaultNames = ["Team US #1", "Team EU #1", "Team VN #1"];
    for (const name of defaultNames) {
      try {
        const created = await prisma.team.upsert({
          where: { name },
          create: { name, createdById: fallbackUserId },
          update: {},
          include: {
            leader: { select: { id: true, name: true, fullName: true, username: true, email: true, avatar: true, role: true } },
            createdBy: { select: { id: true, name: true, fullName: true, username: true, email: true, avatar: true, role: true } },
            members: {
              select: {
                id: true,
                name: true,
                fullName: true,
                username: true,
                email: true,
                avatar: true,
                role: true,
                isActive: true,
                _count: { select: { tiktokAccounts: true } },
              },
            },
            _count: { select: { members: true } },
          },
        });
        dbTeams.push(created);
      } catch {}
    }
  }

  const teamsDetails = dbTeams.map((t) => {
    const totalAccounts = t.members?.reduce((acc: number, m: any) => acc + (m._count?.tiktokAccounts || 0), 0) || 0;
    return {
      id: t.id,
      name: t.name,
      color: t.color || "pink",
      description: t.description,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      leader: t.leader
        ? {
            id: t.leader.id,
            name: t.leader.name || t.leader.fullName || t.leader.username || t.leader.email,
            username: t.leader.username,
            email: t.leader.email,
            avatar: t.leader.avatar,
            role: t.leader.role,
          }
        : null,
      createdBy: t.createdBy
        ? {
            id: t.createdBy.id,
            name: t.createdBy.name || t.createdBy.fullName || t.createdBy.username || t.createdBy.email,
            username: t.createdBy.username,
            email: t.createdBy.email,
            avatar: t.createdBy.avatar,
            role: t.createdBy.role,
          }
        : null,
      membersCount: t._count?.members || 0,
      totalAccounts,
      members: (t.members || []).map((m: any) => ({
        id: m.id,
        name: m.name || m.fullName || m.username || m.email,
        username: m.username,
        email: m.email,
        avatar: m.avatar,
        role: m.role,
        isActive: m.isActive,
        accountsCount: m._count?.tiktokAccounts || 0,
      })),
    };
  });

  return {
    teams: dbTeams.map((t) => t.name),
    teamsDetails,
    groups: dbTeams.map((t) => t.name),
    groupsDetails: teamsDetails,
  };
}

export const adminRouter = router({
  // 1. List all users with fleet stats & Team info (ADMIN / LEAD)
  listUsers: leadProcedure.query(async ({ ctx }) => {
    const scope = await resolveUserScope(ctx.prisma, ctx.session.user);
    const where: any = { deletedAt: null };
    if (scope.isLead) {
      where.id = { in: scope.memberUserIds };
    }

    const users = await ctx.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        firstName: true,
        lastName: true,
        avatar: true,
        role: true,
        isActive: true,
        isVerified: true,
        createdAt: true,
        lastActiveAt: true,
        teamId: true,
        extensionToken: true,
        extensionAccessEnabled: true,
        boundMachineId: true,
        boundMachineName: true,
        boundOsUser: true,
        boundMachineAt: true,
        team: {
          select: { id: true, name: true, color: true },
        },
        _count: {
          select: {
            tiktokAccounts: true,
            dailyChecklists: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return users.map((u) => ({
      ...u,
      fullName: u.name || [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || u.email,
      accountsCount: u._count.tiktokAccounts,
      checklistsCount: u._count.dailyChecklists,
      teamName: u.team?.name || null,
      teamId: u.teamId || u.team?.id || null,
      team: u.team,
      // Backward compatibility aliases
      groupName: u.team?.name || null,
      groupId: u.teamId || u.team?.id || null,
      group: u.team,
      hasExtensionToken: !!u.extensionToken,
    }));
  }),

  // List all Teams with Leader, Creator, Members, and Account Stats (ADMIN)
  listTeams: adminProcedure.query(async ({ ctx }) => {
    return fetchTeamsData(ctx.prisma, ctx.session.user.id);
  }),

  // Alias for backward compatibility
  listGroups: adminProcedure.query(async ({ ctx }) => {
    return fetchTeamsData(ctx.prisma, ctx.session.user.id);
  }),

  // Create a new Team in Team table (ADMIN)
  createTeam: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(50),
        description: z.string().optional().nullable(),
        color: z.string().optional().default("pink"),
        leaderId: z.string().optional().nullable(),
        memberIds: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const cleanName = input.name.trim();
      const existing = await ctx.prisma.team.findUnique({
        where: { name: cleanName },
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Đội nhóm với tên này đã tồn tại trong hệ thống.",
        });
      }

      const team = await ctx.prisma.team.create({
        data: {
          name: cleanName,
          description: input.description,
          color: input.color,
          leaderId: input.leaderId || null,
          createdById: ctx.session.user.id,
        },
      });

      if (input.memberIds && input.memberIds.length > 0) {
        await ctx.prisma.user.updateMany({
          where: { id: { in: input.memberIds } },
          data: { teamId: team.id },
        });
      }

      // Auto-sync: promote assigned leader to LEAD role and add to team
      if (input.leaderId) {
        await syncTeamLeaderRoles(ctx.prisma, {
          teamId: team.id,
          newLeaderId: input.leaderId,
        });
      }

      return team;
    }),

  createGroup: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(50),
        description: z.string().optional().nullable(),
        color: z.string().optional().default("pink"),
        leaderId: z.string().optional().nullable(),
        memberIds: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const cleanName = input.name.trim();
      const existing = await ctx.prisma.team.findUnique({
        where: { name: cleanName },
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Đội nhóm với tên này đã tồn tại trong hệ thống.",
        });
      }

      const team = await ctx.prisma.team.create({
        data: {
          name: cleanName,
          description: input.description,
          color: input.color,
          leaderId: input.leaderId || null,
          createdById: ctx.session.user.id,
        },
      });

      if (input.memberIds && input.memberIds.length > 0) {
        await ctx.prisma.user.updateMany({
          where: { id: { in: input.memberIds } },
          data: { teamId: team.id },
        });
      }

      if (input.leaderId) {
        await syncTeamLeaderRoles(ctx.prisma, {
          teamId: team.id,
          newLeaderId: input.leaderId,
        });
      }

      return team;
    }),

  // Update Team details (ADMIN)
  updateTeam: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(50),
        description: z.string().optional().nullable(),
        color: z.string().optional().default("pink"),
        leaderId: z.string().optional().nullable(),
        memberIds: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const cleanName = input.name.trim();
      const existing = await ctx.prisma.team.findFirst({
        where: { name: cleanName, id: { not: input.id } },
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Tên đội nhóm đã bị trùng với một đội nhóm khác.",
        });
      }

      const oldTeam = await ctx.prisma.team.findUnique({
        where: { id: input.id },
        select: { leaderId: true },
      });

      const team = await ctx.prisma.team.update({
        where: { id: input.id },
        data: {
          name: cleanName,
          description: input.description,
          color: input.color,
          leaderId: input.leaderId || null,
        },
      });

      if (input.memberIds !== undefined) {
        // Unassign users previously in this team that are not in memberIds
        await ctx.prisma.user.updateMany({
          where: { teamId: team.id, id: { notIn: input.memberIds } },
          data: { teamId: null },
        });
        // Assign new users to this team
        if (input.memberIds.length > 0) {
          await ctx.prisma.user.updateMany({
            where: { id: { in: input.memberIds } },
            data: { teamId: team.id },
          });
        }
      }

      // Auto-sync leader roles (promote new, demote old if not leading other teams)
      await syncTeamLeaderRoles(ctx.prisma, {
        teamId: team.id,
        newLeaderId: input.leaderId || null,
        oldLeaderId: oldTeam?.leaderId || null,
      });

      return team;
    }),

  updateGroup: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(50),
        description: z.string().optional().nullable(),
        color: z.string().optional().default("pink"),
        leaderId: z.string().optional().nullable(),
        memberIds: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const cleanName = input.name.trim();
      const existing = await ctx.prisma.team.findFirst({
        where: { name: cleanName, id: { not: input.id } },
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Tên đội nhóm đã bị trùng với một đội nhóm khác.",
        });
      }

      const oldTeam = await ctx.prisma.team.findUnique({
        where: { id: input.id },
        select: { leaderId: true },
      });

      const team = await ctx.prisma.team.update({
        where: { id: input.id },
        data: {
          name: cleanName,
          description: input.description,
          color: input.color,
          leaderId: input.leaderId || null,
        },
      });

      if (input.memberIds !== undefined) {
        await ctx.prisma.user.updateMany({
          where: { teamId: team.id, id: { notIn: input.memberIds } },
          data: { teamId: null },
        });
        if (input.memberIds.length > 0) {
          await ctx.prisma.user.updateMany({
            where: { id: { in: input.memberIds } },
            data: { teamId: team.id },
          });
        }
      }

      await syncTeamLeaderRoles(ctx.prisma, {
        teamId: team.id,
        newLeaderId: input.leaderId || null,
        oldLeaderId: oldTeam?.leaderId || null,
      });

      return team;
    }),

  // Get Comprehensive Team Details with Leader, Members, Fleet Stats (ADMIN, TEAM LEADER, MEMBERS)
  getTeamDetail: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const userRole = ctx.session.user.role;
      const isAdmin = userRole === "ADMIN";

      const team = await ctx.prisma.team.findUnique({
        where: { id: input.id },
        include: {
          leader: {
            select: {
              id: true,
              name: true,
              fullName: true,
              username: true,
              email: true,
              avatar: true,
              role: true,
              isActive: true,
              lastActiveAt: true,
              phone: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              username: true,
            },
          },
          members: {
            where: { deletedAt: null },
            select: {
              id: true,
              name: true,
              fullName: true,
              username: true,
              email: true,
              avatar: true,
              role: true,
              isActive: true,
              isVerified: true,
              lastActiveAt: true,
              boundMachineName: true,
              boundOsUser: true,
              gpmIsOnline: true,
              gpmPort: true,
              createdAt: true,
              tiktokAccounts: {
                where: { deletedAt: null },
                select: {
                  id: true,
                  username: true,
                  country: true,
                  status: true,
                  totalRevenue: true,
                  totalViews: true,
                  totalFollowers: true,
                },
              },
            },
            orderBy: { name: "asc" },
          },
        },
      });

      if (!team) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Không tìm thấy thông tin đội nhóm yêu cầu.",
        });
      }

      const isLeader = team.leaderId === userId;
      const isMember = team.members.some((m) => m.id === userId);
      if (!isAdmin && !isLeader && !isMember) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Bạn không có quyền truy cập dữ liệu đội nhóm này.",
        });
      }

      const enrichedMembers = team.members.map((m) => {
        const accountsCount = m.tiktokAccounts.length;
        const totalRevenue = m.tiktokAccounts.reduce(
          (acc, a) => acc + Number(a.totalRevenue || 0),
          0
        );
        const totalViews = m.tiktokAccounts.reduce(
          (acc, a) => acc + Number(a.totalViews || 0),
          0
        );
        const totalFollowers = m.tiktokAccounts.reduce(
          (acc, a) => acc + Number(a.totalFollowers || 0),
          0
        );

        return {
          id: m.id,
          name: m.name,
          fullName:
            m.fullName ||
            m.name ||
            m.username ||
            "Nhân sự",
          username: m.username,
          email: m.email,
          avatar: m.avatar,
          role: m.role,
          isActive: m.isActive,
          isVerified: m.isVerified,
          lastActiveAt: m.lastActiveAt,
          boundMachineName: m.boundMachineName,
          boundOsUser: m.boundOsUser,
          gpmIsOnline: m.gpmIsOnline,
          gpmPort: m.gpmPort,
          createdAt: m.createdAt,
          isLeader: m.id === team.leaderId,
          accountsCount,
          accounts: m.tiktokAccounts.slice(0, 15),
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          totalViews,
          totalFollowers,
        };
      });

      const totalMembers = enrichedMembers.length;
      const activeMembers = enrichedMembers.filter((m) => m.isActive).length;
      const totalAccounts = enrichedMembers.reduce(
        (acc, m) => acc + m.accountsCount,
        0
      );
      const totalRevenue = enrichedMembers.reduce(
        (acc, m) => acc + m.totalRevenue,
        0
      );
      const totalViews = enrichedMembers.reduce(
        (acc, m) => acc + m.totalViews,
        0
      );
      const totalFollowers = enrichedMembers.reduce(
        (acc, m) => acc + m.totalFollowers,
        0
      );

      const allTeamAccounts = team.members.flatMap((m) => m.tiktokAccounts);
      const activeAccounts = allTeamAccounts.filter(
        (a) => a.status === "ACTIVE" || a.status === "WARMING"
      ).length;
      const bannedAccounts = allTeamAccounts.filter(
        (a) => a.status === "BANNED" || a.status === "RESTRICTED"
      ).length;

      return {
        team: {
          id: team.id,
          name: team.name,
          description: team.description,
          color: team.color || "pink",
          createdAt: team.createdAt,
          updatedAt: team.updatedAt,
          leader: team.leader,
          createdBy: team.createdBy,
        },
        members: enrichedMembers,
        stats: {
          totalMembers,
          activeMembers,
          totalAccounts,
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          totalViews,
          totalFollowers,
          activeAccounts,
          bannedAccounts,
        },
        permissions: {
          canManage: isAdmin || isLeader,
          canTransfer: isAdmin || isLeader,
          canDelete: isAdmin,
        },
      };
    }),

  // Add members to team (ADMIN or TEAM LEADER)
  addTeamMembers: protectedProcedure
    .input(
      z.object({
        teamId: z.string(),
        userIds: z.array(z.string()).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      const isAdmin = ctx.session.user.role === "ADMIN";

      const team = await ctx.prisma.team.findUnique({
        where: { id: input.teamId },
        select: { id: true, leaderId: true },
      });

      if (!team) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Đội nhóm không tồn tại.",
        });
      }

      if (!isAdmin && team.leaderId !== currentUserId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Chỉ Quản trị viên hoặc Trưởng nhóm mới có quyền thêm thành viên vào đội.",
        });
      }

      await ctx.prisma.user.updateMany({
        where: { id: { in: input.userIds } },
        data: { teamId: input.teamId },
      });

      return { success: true, count: input.userIds.length };
    }),

  // Remove member from team (ADMIN or TEAM LEADER)
  removeTeamMember: protectedProcedure
    .input(
      z.object({
        teamId: z.string(),
        userId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      const isAdmin = ctx.session.user.role === "ADMIN";

      const team = await ctx.prisma.team.findUnique({
        where: { id: input.teamId },
        select: { id: true, leaderId: true },
      });

      if (!team) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Đội nhóm không tồn tại.",
        });
      }

      if (!isAdmin && team.leaderId !== currentUserId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Chỉ Quản trị viên hoặc Trưởng nhóm mới có quyền xóa thành viên khỏi đội.",
        });
      }

      if (team.leaderId === input.userId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Không thể xóa Trưởng nhóm khỏi đội. Vui lòng chuyển giao quyền Trưởng nhóm cho thành viên khác trước khi rời đội.",
        });
      }

      await ctx.prisma.user.update({
        where: { id: input.userId },
        data: { teamId: null },
      });

      return { success: true };
    }),

  // Transfer Team Leadership to a new leader (ADMIN or CURRENT TEAM LEADER)
  transferTeamLeader: protectedProcedure
    .input(
      z.object({
        teamId: z.string(),
        newLeaderId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      const isAdmin = ctx.session.user.role === "ADMIN";

      const team = await ctx.prisma.team.findUnique({
        where: { id: input.teamId },
        select: { id: true, leaderId: true },
      });

      if (!team) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Đội nhóm không tồn tại.",
        });
      }

      if (!isAdmin && team.leaderId !== currentUserId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Chỉ Quản trị viên hoặc Trưởng nhóm hiện tại mới có quyền chuyển giao đội nhóm.",
        });
      }

      const newLeader = await ctx.prisma.user.findUnique({
        where: { id: input.newLeaderId },
        select: { id: true, role: true, isActive: true },
      });

      if (!newLeader || !newLeader.isActive) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Nhân sự được chỉ định làm Trưởng nhóm không tồn tại hoặc đã bị khóa quyền truy cập.",
        });
      }

      // Update team's leaderId
      await ctx.prisma.team.update({
        where: { id: input.teamId },
        data: { leaderId: input.newLeaderId },
      });

      // Auto-sync leader roles (promotes new leader, demotes old leader if no other team led)
      await syncTeamLeaderRoles(ctx.prisma, {
        teamId: input.teamId,
        newLeaderId: input.newLeaderId,
        oldLeaderId: team.leaderId,
      });

      return { success: true, newLeaderId: input.newLeaderId };
    }),

  // Update team metadata (ADMIN or TEAM LEADER)
  updateTeamMetadata: protectedProcedure
    .input(
      z.object({
        teamId: z.string(),
        name: z.string().min(1).max(50),
        description: z.string().optional().nullable(),
        color: z.string().optional().default("pink"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const currentUserId = ctx.session.user.id;
      const isAdmin = ctx.session.user.role === "ADMIN";

      const team = await ctx.prisma.team.findUnique({
        where: { id: input.teamId },
        select: { id: true, leaderId: true },
      });

      if (!team) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Đội nhóm không tồn tại.",
        });
      }

      if (!isAdmin && team.leaderId !== currentUserId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Chỉ Quản trị viên hoặc Trưởng nhóm mới có quyền sửa thông tin đội nhóm.",
        });
      }

      const cleanName = input.name.trim();
      const existing = await ctx.prisma.team.findFirst({
        where: { name: cleanName, id: { not: input.teamId } },
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Tên đội nhóm đã bị trùng với một đội nhóm khác.",
        });
      }

      const updated = await ctx.prisma.team.update({
        where: { id: input.teamId },
        data: {
          name: cleanName,
          description: input.description,
          color: input.color,
        },
      });

      return updated;
    }),

  // List staff that can be assigned to a team (ADMIN or TEAM LEADER)
  listAssignableStaff: protectedProcedure
    .input(z.object({ teamId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const users = await ctx.prisma.user.findMany({
        where: {
          isActive: true,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          fullName: true,
          username: true,
          email: true,
          avatar: true,
          role: true,
          teamId: true,
          team: { select: { id: true, name: true, color: true } },
          _count: {
            select: { tiktokAccounts: { where: { deletedAt: null } } },
          },
        },
        orderBy: { name: "asc" },
      });

      return users.map((u) => ({
        id: u.id,
        name: u.name,
        fullName:
          u.fullName ||
          u.name ||
          u.username ||
          "Nhân sự",
        username: u.username,
        email: u.email,
        avatar: u.avatar,
        role: u.role,
        teamId: u.teamId,
        teamName: u.team?.name || null,
        teamColor: u.team?.color || null,
        accountsCount: u._count.tiktokAccounts,
        isInCurrentTeam: input?.teamId ? u.teamId === input.teamId : false,
      }));
    }),

  // Delete a Team from Team table (ADMIN)
  deleteTeam: adminProcedure
    .input(
      z.object({
        name: z.string().optional(),
        id: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.name && !input.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Vui lòng cung cấp ID hoặc tên đội nhóm cần xóa.",
        });
      }

      const team = input.id
        ? await ctx.prisma.team.findUnique({ where: { id: input.id } })
        : await ctx.prisma.team.findUnique({ where: { name: input.name } });

      if (!team) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Không tìm thấy đội nhóm cần xóa.",
        });
      }

      // Unassign all users from this team
      await ctx.prisma.user.updateMany({
        where: { teamId: team.id },
        data: { teamId: null },
      });

      await ctx.prisma.team.delete({
        where: { id: team.id },
      });

      if (team.leaderId) {
        await onTeamDeleted(ctx.prisma, team.id, team.leaderId);
      }

      return { success: true };
    }),

  deleteGroup: adminProcedure
    .input(
      z.object({
        name: z.string().optional(),
        id: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.name && !input.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Vui lòng cung cấp ID hoặc tên đội nhóm cần xóa.",
        });
      }

      const team = input.id
        ? await ctx.prisma.team.findUnique({ where: { id: input.id } })
        : await ctx.prisma.team.findUnique({ where: { name: input.name } });

      if (!team) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Không tìm thấy đội nhóm cần xóa.",
        });
      }

      await ctx.prisma.user.updateMany({
        where: { teamId: team.id },
        data: { teamId: null },
      });

      await ctx.prisma.team.delete({
        where: { id: team.id },
      });

      if (team.leaderId) {
        await onTeamDeleted(ctx.prisma, team.id, team.leaderId);
      }

      return { success: true };
    }),

  // Update user's Team assignment in Team table (ADMIN)
  updateUserTeam: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        teamName: z.string().optional().nullable(),
        groupName: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let targetTeamId: string | null = null;
      const targetName = (input.teamName || input.groupName || "").trim();

      if (targetName) {
        let team = await ctx.prisma.team.findUnique({
          where: { name: targetName },
        });

        if (!team) {
          team = await ctx.prisma.team.create({
            data: { name: targetName },
          });
        }
        targetTeamId = team.id;
      }

      const updated = await ctx.prisma.user.update({
        where: { id: input.userId },
        data: { teamId: targetTeamId },
        include: { team: true },
      });

      return {
        success: true,
        userId: updated.id,
        teamName: updated.team?.name || null,
        teamId: updated.teamId,
        groupName: updated.team?.name || null,
        groupId: updated.teamId,
      };
    }),

  updateUserGroup: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        teamName: z.string().optional().nullable(),
        groupName: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let targetTeamId: string | null = null;
      const targetName = (input.teamName || input.groupName || "").trim();

      if (targetName) {
        let team = await ctx.prisma.team.findUnique({
          where: { name: targetName },
        });

        if (!team) {
          team = await ctx.prisma.team.create({
            data: { name: targetName },
          });
        }
        targetTeamId = team.id;
      }

      const updated = await ctx.prisma.user.update({
        where: { id: input.userId },
        data: { teamId: targetTeamId },
        include: { team: true },
      });

      return {
        success: true,
        userId: updated.id,
        teamName: updated.team?.name || null,
        teamId: updated.teamId,
        groupName: updated.team?.name || null,
        groupId: updated.teamId,
      };
    }),

  // Bulk Delete Teams (ADMIN)
  bulkDeleteTeams: adminProcedure
    .input(
      z.object({
        teamIds: z.array(z.string()).optional(),
        groupIds: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const ids = input.teamIds || input.groupIds || [];
      if (!ids.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Danh sách đội nhóm cần xóa không được rỗng.",
        });
      }

      const teamsToDelete = await ctx.prisma.team.findMany({
        where: { id: { in: ids } },
        select: { id: true, leaderId: true },
      });

      await ctx.prisma.user.updateMany({
        where: { teamId: { in: ids } },
        data: { teamId: null },
      });

      const res = await ctx.prisma.team.deleteMany({
        where: { id: { in: ids } },
      });

      for (const t of teamsToDelete) {
        if (t.leaderId) {
          await onTeamDeleted(ctx.prisma, t.id, t.leaderId);
        }
      }

      return { count: res.count };
    }),

  bulkDeleteGroups: adminProcedure
    .input(
      z.object({
        teamIds: z.array(z.string()).optional(),
        groupIds: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const ids = input.teamIds || input.groupIds || [];
      if (!ids.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Danh sách đội nhóm cần xóa không được rỗng.",
        });
      }

      const teamsToDelete = await ctx.prisma.team.findMany({
        where: { id: { in: ids } },
        select: { id: true, leaderId: true },
      });

      await ctx.prisma.user.updateMany({
        where: { teamId: { in: ids } },
        data: { teamId: null },
      });

      const res = await ctx.prisma.team.deleteMany({
        where: { id: { in: ids } },
      });

      for (const t of teamsToDelete) {
        if (t.leaderId) {
          await onTeamDeleted(ctx.prisma, t.id, t.leaderId);
        }
      }

      return { count: res.count };
    }),

  // Bulk Assign Teams Leader (ADMIN)
  bulkAssignTeamsLeader: adminProcedure
    .input(
      z.object({
        teamIds: z.array(z.string()).optional(),
        groupIds: z.array(z.string()).optional(),
        leaderId: z.string().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const ids = input.teamIds || input.groupIds || [];
      if (!ids.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Danh sách đội nhóm không được rỗng.",
        });
      }

      const prevTeams = await ctx.prisma.team.findMany({
        where: { id: { in: ids } },
        select: { id: true, leaderId: true },
      });

      const res = await ctx.prisma.team.updateMany({
        where: { id: { in: ids } },
        data: { leaderId: input.leaderId || null },
      });

      for (const t of prevTeams) {
        if (t.leaderId && t.leaderId !== input.leaderId) {
          await onTeamDeleted(ctx.prisma, t.id, t.leaderId);
        }
      }

      if (input.leaderId) {
        const newLeader = await ctx.prisma.user.findUnique({
          where: { id: input.leaderId },
          select: { role: true },
        });
        if (newLeader && newLeader.role === "STAFF") {
          await ctx.prisma.user.update({
            where: { id: input.leaderId },
            data: { role: "LEAD" },
          });
        }
      }

      return { count: res.count };
    }),

  bulkAssignGroupsLeader: adminProcedure
    .input(
      z.object({
        teamIds: z.array(z.string()).optional(),
        groupIds: z.array(z.string()).optional(),
        leaderId: z.string().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const ids = input.teamIds || input.groupIds || [];
      if (!ids.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Danh sách đội nhóm không được rỗng.",
        });
      }

      const prevTeams = await ctx.prisma.team.findMany({
        where: { id: { in: ids } },
        select: { id: true, leaderId: true },
      });

      const res = await ctx.prisma.team.updateMany({
        where: { id: { in: ids } },
        data: { leaderId: input.leaderId || null },
      });

      for (const t of prevTeams) {
        if (t.leaderId && t.leaderId !== input.leaderId) {
          await onTeamDeleted(ctx.prisma, t.id, t.leaderId);
        }
      }

      if (input.leaderId) {
        const newLeader = await ctx.prisma.user.findUnique({
          where: { id: input.leaderId },
          select: { role: true },
        });
        if (newLeader && newLeader.role === "STAFF") {
          await ctx.prisma.user.update({
            where: { id: input.leaderId },
            data: { role: "LEAD" },
          });
        }
      }

      return { count: res.count };
    }),

  // Bulk Change Teams Color (ADMIN)
  bulkChangeTeamsColor: adminProcedure
    .input(
      z.object({
        teamIds: z.array(z.string()).optional(),
        groupIds: z.array(z.string()).optional(),
        color: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const ids = input.teamIds || input.groupIds || [];
      if (!ids.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Danh sách đội nhóm không được rỗng.",
        });
      }

      const res = await ctx.prisma.team.updateMany({
        where: { id: { in: ids } },
        data: { color: input.color },
      });

      return { count: res.count };
    }),

  bulkChangeGroupsColor: adminProcedure
    .input(
      z.object({
        teamIds: z.array(z.string()).optional(),
        groupIds: z.array(z.string()).optional(),
        color: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const ids = input.teamIds || input.groupIds || [];
      if (!ids.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Danh sách đội nhóm không được rỗng.",
        });
      }

      const res = await ctx.prisma.team.updateMany({
        where: { id: { in: ids } },
        data: { color: input.color },
      });

      return { count: res.count };
    }),

  // 2. Create user (ADMIN)
  createUser: adminProcedure
    .input(
      z.object({
        username: z.string(),
        name: z.string().optional(),
        email: z.string().email(),
        role: z.enum(["ADMIN", "LEAD", "STAFF"]).default("STAFF"),
        teamName: z.string().optional().nullable(),
        groupName: z.string().optional().nullable(),
        password: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.user.findFirst({
        where: {
          OR: [{ email: input.email }, { username: input.username }],
        },
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "User with this email or username already exists",
        });
      }

      let teamId: string | null = null;
      const targetName = (input.teamName || input.groupName || "").trim();
      if (targetName) {
        let team = await ctx.prisma.team.findUnique({ where: { name: targetName } });
        if (!team) {
          team = await ctx.prisma.team.create({ data: { name: targetName } });
        }
        teamId = team.id;
      }

      let hashedPassword: string | null = null;
      if (input.password && input.password.trim()) {
        hashedPassword = await bcrypt.hash(input.password.trim(), 10);
      }

      const user = await ctx.prisma.user.create({
        data: {
          username: input.username,
          name: input.name,
          email: input.email,
          role: input.role,
          teamId,
          password: hashedPassword,
          isVerified: true,
          isActive: true,
        },
      });

      return user;
    }),

  // 3. Update user role (ADMIN)
  updateUserRole: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        role: z.enum(["ADMIN", "LEAD", "STAFF"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.session.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot change your own admin role.",
        });
      }

      const updated = await ctx.prisma.user.update({
        where: { id: input.userId },
        data: { role: input.role },
      });

      // If user is demoted to STAFF, unassign them from being leader of any teams
      if (input.role === "STAFF") {
        await ctx.prisma.team.updateMany({
          where: { leaderId: input.userId },
          data: { leaderId: null },
        });
      }

      return updated;
    }),

  // 4. Toggle user active status (ADMIN)
  toggleUserStatus: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        isActive: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.session.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Bạn không thể tự chặn quyền truy cập của chính mình.",
        });
      }

      const updated = await ctx.prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id: input.userId },
          data: { isActive: input.isActive },
        });

        if (input.isActive === false) {
          await revokeExtensionCredentials(input.userId, "toggle_user_inactive", tx);
        }

        await tx.session.deleteMany({
          where: { userId: input.userId },
        });

        return user;
      });

      clearUserCache(input.userId);

      return updated;
    }),

  // 5. Bulk Reassign Fleet (ADMIN)
  reassignFleet: adminProcedure
    .input(
      z.object({
        accountIds: z.array(z.string()),
        targetUserId: z.string().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const res = await ctx.prisma.tiktokAccount.updateMany({
        where: { id: { in: input.accountIds }, deletedAt: null },
        data: { assignedUserId: input.targetUserId },
      });

      await recordBulkAccountTransfer(ctx.prismaRaw, {
        accountIds: input.accountIds,
        newUserId: input.targetUserId,
        transferredBy: ctx.session.user.name || ctx.session.user.email || "Admin",
        reason: "Admin reassignFleet",
      });

      return { updatedCount: res.count };
    }),

  // 6. Delete User (ADMIN)
  deleteUser: adminProcedure
    .input(
      z.object({
        userId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.session.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Bạn không thể tự xóa tài khoản của chính mình.",
        });
      }

      const updated = await ctx.prisma.$transaction(async (tx) => {
        await tx.tiktokAccount.updateMany({
          where: { assignedUserId: input.userId },
          data: { assignedUserId: null },
        });

        const user = await tx.user.update({
          where: { id: input.userId },
          data: {
            deletedAt: new Date(),
            isActive: false,
          },
        });

        await revokeExtensionCredentials(input.userId, "delete_user", tx);

        return user;
      });

      clearUserCache(input.userId);
      return updated;
    }),

  // 7. Bulk Delete Users (ADMIN)
  bulkDeleteUsers: adminProcedure
    .input(
      z.object({
        userIds: z.array(z.string()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const targetIds = input.userIds.filter((id) => id !== ctx.session.user.id);

      if (targetIds.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Không thể xóa tài khoản của chính bạn.",
        });
      }

      const res = await ctx.prisma.$transaction(async (tx) => {
        await tx.tiktokAccount.updateMany({
          where: { assignedUserId: { in: targetIds } },
          data: { assignedUserId: null },
        });

        const updated = await tx.user.updateMany({
          where: { id: { in: targetIds } },
          data: {
            deletedAt: new Date(),
            isActive: false,
          },
        });

        for (const userId of targetIds) {
          await revokeExtensionCredentials(userId, "bulk_delete_users", tx);
        }

        return updated;
      });

      for (const userId of targetIds) {
        clearUserCache(userId);
      }

      return { count: res.count };
    }),

  // 8. List all invitations (ADMIN)
  listInvitations: adminProcedure.query(async ({ ctx }) => {
    const invitations = await ctx.prisma.invitation.findMany({
      include: {
        invitedBy: {
          select: {
            id: true,
            name: true,
            username: true,
            email: true,
            avatar: true,
          },
        },
        team: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return invitations.map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      status: inv.status,
      token: inv.token,
      expiresAt: inv.expiresAt,
      acceptedAt: inv.acceptedAt,
      createdAt: inv.createdAt,
      teamName: inv.team?.name || null,
      teamId: inv.teamId,
      teamColor: inv.team?.color || "pink",
      groupName: inv.team?.name || null,
      groupId: inv.teamId,
      groupColor: inv.team?.color || "pink",
      invitedByName: inv.invitedBy?.name || inv.invitedBy?.username || inv.invitedBy?.email || "Admin",
    }));
  }),

  // 9. Create a new Invitation (ADMIN)
  createInvitation: adminProcedure
    .input(
      z.object({
        email: z.string().email(),
        role: z.enum(["ADMIN", "LEAD", "STAFF"]).default("STAFF"),
        teamName: z.string().optional().nullable(),
        groupName: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const cleanEmail = input.email.trim().toLowerCase();

      // Check if user already exists
      const existingUser = await ctx.prisma.user.findUnique({
        where: { email: cleanEmail },
      });

      if (existingUser && existingUser.isActive) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Tài khoản với email này đã tồn tại và đang hoạt động.",
        });
      }

      // Check if a pending invite already exists
      const existingInvite = await ctx.prisma.invitation.findFirst({
        where: {
          email: cleanEmail,
          status: "PENDING",
          expiresAt: { gt: new Date() },
        },
      });

      if (existingInvite) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Đã có một lời mời đang chờ gửi tới email này. Bạn có thể chọn gửi lại email.",
        });
      }

      let teamId: string | null = null;
      const targetName = (input.teamName || input.groupName || "").trim();
      if (targetName) {
        let team = await ctx.prisma.team.findUnique({ where: { name: targetName } });
        if (!team) {
          team = await ctx.prisma.team.create({ data: { name: targetName } });
        }
        teamId = team.id;
      }

      const crypto = await import("crypto");
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours (1 day)

      const invitation = await ctx.prisma.invitation.create({
        data: {
          email: cleanEmail,
          role: input.role,
          teamId,
          invitedById: ctx.session.user.id,
          token,
          expiresAt,
          status: "PENDING",
        },
        include: {
          team: true,
          invitedBy: true,
        },
      });

      // Send email
      try {
        const { default: emailService } = await import("@/utils/email/emailService");
        const { InvitationEmailTemplates } = await import("@/utils/email/templates/invitationTemplate");
        const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const inviteUrl = `${APP_URL}/invite/accept?token=${token}`;

        const inviterName = ctx.session.user.name || ctx.session.user.email?.split("@")[0] || "Admin";
        const emailContent = InvitationEmailTemplates.getWorkspaceMemberInvite({
          inviterName,
          workspaceName: "TIKTOKFLOW",
          role: input.role,
          groupName: invitation.team?.name || null,
          invitationUrl: inviteUrl,
          expiresAt,
        });

        await emailService.sendNodemailerEmail(
          cleanEmail,
          emailContent.subject,
          emailContent.html,
          emailContent.text
        );
      } catch (mailErr) {
        console.error("Failed to send invitation email:", mailErr);
        // Do not fail the transaction, invite record is created and link can be copied manually
      }

      return {
        id: invitation.id,
        email: invitation.email,
        token: invitation.token,
        role: invitation.role,
        teamName: invitation.team?.name || null,
        groupName: invitation.team?.name || null,
        expiresAt: invitation.expiresAt,
      };
    }),

  // 9b. Create Bulk Invitations (ADMIN)
  createBulkInvitations: adminProcedure
    .input(
      z.object({
        emails: z.array(z.string().email()).min(1),
        role: z.enum(["ADMIN", "LEAD", "STAFF"]).default("STAFF"),
        teamName: z.string().optional().nullable(),
        groupName: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const uniqueEmails = Array.from(
        new Set(input.emails.map((e) => e.trim().toLowerCase()).filter(Boolean))
      );

      let teamId: string | null = null;
      const targetName = (input.teamName || input.groupName || "").trim();
      if (targetName) {
        let team = await ctx.prisma.team.findUnique({ where: { name: targetName } });
        if (!team) {
          team = await ctx.prisma.team.create({ data: { name: targetName } });
        }
        teamId = team.id;
      }

      const crypto = await import("crypto");
      const { default: emailService } = await import("@/utils/email/emailService");
      const { InvitationEmailTemplates } = await import("@/utils/email/templates/invitationTemplate");
      const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const inviterName = ctx.session.user.name || ctx.session.user.email?.split("@")[0] || "Admin";

      const results: { email: string; success: boolean; message: string }[] = [];
      let successCount = 0;

      for (const cleanEmail of uniqueEmails) {
        try {
          // Check if user already exists and is active
          const existingUser = await ctx.prisma.user.findUnique({
            where: { email: cleanEmail },
          });
          if (existingUser && existingUser.isActive) {
            results.push({ email: cleanEmail, success: false, message: "Tài khoản đã tồn tại và đang hoạt động" });
            continue;
          }

          // Check if an invitation already exists for this email
          const existingInvite = await ctx.prisma.invitation.findFirst({
            where: { email: cleanEmail, status: { in: ["PENDING", "EXPIRED", "REVOKED"] } },
            orderBy: { createdAt: "desc" },
          });

          // Option 1 (Industry Best Practice):
          // If already PENDING, preserve the existing token so earlier email links remain 100% valid!
          // Only generate a new token if creating from scratch or reviving an EXPIRED/REVOKED invite.
          const isPending = existingInvite?.status === "PENDING";
          const token = isPending && existingInvite?.token
            ? existingInvite.token
            : crypto.randomBytes(32).toString("hex");

          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // refresh 24 hours

          if (existingInvite) {
            await ctx.prisma.invitation.update({
              where: { id: existingInvite.id },
              data: {
                role: input.role,
                teamId,
                invitedById: ctx.session.user.id,
                token,
                status: "PENDING",
                expiresAt,
              },
            });
          } else {
            await ctx.prisma.invitation.create({
              data: {
                email: cleanEmail,
                role: input.role,
                teamId,
                invitedById: ctx.session.user.id,
                token,
                expiresAt,
                status: "PENDING",
              },
            });
          }

          // Send email
          try {
            const inviteUrl = `${APP_URL}/invite/accept?token=${token}`;
            const emailContent = InvitationEmailTemplates.getWorkspaceMemberInvite({
              inviterName,
              workspaceName: "TIKTOKFLOW",
              role: input.role,
              groupName: input.teamName || input.groupName || null,
              invitationUrl: inviteUrl,
              expiresAt,
            });

            await emailService.sendNodemailerEmail(
              cleanEmail,
              emailContent.subject,
              emailContent.html,
              emailContent.text
            );
          } catch (mailErr) {
            console.error(`Failed to send invitation email to ${cleanEmail}:`, mailErr);
          }

          successCount++;
          results.push({ email: cleanEmail, success: true, message: "Đã gửi thư mời" });
        } catch (itemErr: any) {
          results.push({ email: cleanEmail, success: false, message: itemErr.message || "Lỗi xử lý" });
        }
      }

      return {
        total: uniqueEmails.length,
        successCount,
        failedCount: uniqueEmails.length - successCount,
        results,
      };
    }),

  // 10. Resend Invitation (ADMIN)
  resendInvitation: adminProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const invite = await ctx.prisma.invitation.findUnique({
        where: { id: input.id },
        include: { team: true },
      });

      if (!invite) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Không tìm thấy lời mời.",
        });
      }

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // refresh 24 hours (1 day)
      const updated = await ctx.prisma.invitation.update({
        where: { id: input.id },
        data: {
          expiresAt,
          status: "PENDING",
        },
      });

      // Send email
      try {
        const { default: emailService } = await import("@/utils/email/emailService");
        const { InvitationEmailTemplates } = await import("@/utils/email/templates/invitationTemplate");
        const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const inviteUrl = `${APP_URL}/invite/accept?token=${updated.token}`;

        const inviterName = ctx.session.user.name || ctx.session.user.email?.split("@")[0] || "Admin";
        const emailContent = InvitationEmailTemplates.getWorkspaceMemberInvite({
          inviterName,
          workspaceName: "TIKTOKFLOW",
          role: updated.role,
          groupName: invite.team?.name || null,
          invitationUrl: inviteUrl,
          expiresAt,
        });

        await emailService.sendNodemailerEmail(
          updated.email,
          emailContent.subject,
          emailContent.html,
          emailContent.text
        );
      } catch (mailErr) {
        console.error("Failed to resend invitation email:", mailErr);
      }

      return { success: true, expiresAt: updated.expiresAt };
    }),

  // 11. Revoke Invitation (ADMIN)
  revokeInvitation: adminProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.prisma.invitation.update({
        where: { id: input.id },
        data: { status: "REVOKED" },
      });

      return { success: true, id: updated.id };
    }),

  // 12. Delete Invitation Record (ADMIN)
  deleteInvitation: adminProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.invitation.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),

  // 13. Get or generate Extension Token for a user (ADMIN)
  getExtensionToken: adminProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          extensionToken: true,
          extensionAccessEnabled: true,
          extensionRevokedAt: true,
        },
      });
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      if (user.extensionToken) {
        return {
          userId: user.id,
          token: revealPersonalToken(user.extensionToken),
          accessEnabled: user.extensionAccessEnabled,
          revokedAt: user.extensionRevokedAt,
          isNew: false,
        };
      }

      // If access is explicitly revoked, do NOT auto-generate
      if (user.extensionAccessEnabled === false) {
        return {
          userId: user.id,
          token: null,
          accessEnabled: false,
          revokedAt: user.extensionRevokedAt,
          isNew: false,
        };
      }

      // Generate new token
      const newToken = generatePersonalToken();
      await ctx.prisma.user.update({
        where: { id: user.id },
        data: {
          extensionToken: persistPersonalTokenValue(newToken),
          extensionAccessEnabled: true,
        },
      });

      return {
        userId: user.id,
        token: newToken,
        accessEnabled: true,
        revokedAt: null,
        isNew: true,
      };
    }),

  // 14. Regenerate Extension Token for a user (ADMIN)
  regenerateExtensionToken: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: input.userId },
      });
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      // If access was previously revoked, re-enable it when Admin regenerates
      const newToken = generatePersonalToken();
      await ctx.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: {
            extensionToken: persistPersonalTokenValue(newToken),
            extensionAccessEnabled: true,
            extensionRevokedAt: null,
            extensionSessionVersion: { increment: 1 },
          },
        });
        await tx.extensionRefreshToken.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.extensionPairingCode.deleteMany({
          where: { userId: user.id, usedAt: null },
        });
      });

      return {
        userId: user.id,
        token: newToken,
      };
    }),

  // 15. Revoke Extension Token & Access (ADMIN)
  revokeExtensionToken: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: input.userId },
      });
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      await revokeExtensionCredentials(user.id, "admin_revoke_extension_token");
      clearUserCache(user.id);

      return {
        userId: user.id,
        revoked: true,
      };
    }),

  unlinkUserMachine: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        reason: z.string().min(3).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          boundMachineId: true,
          boundMachineName: true,
          boundOsUser: true,
        },
      });
      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Không tìm thấy người dùng.",
        });
      }
      if (!user.boundMachineId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Người dùng chưa liên kết thiết bị nào.",
        });
      }

      const prevMachineId = user.boundMachineId;
      await ctx.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: input.userId },
          data: {
            boundMachineId: null,
            boundMachineName: null,
            boundOsUser: null,
            boundMachineAt: null,
            extensionSessionVersion: { increment: 1 },
          },
        });
        await tx.extensionRefreshToken.updateMany({
          where: { userId: input.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await writeMachineBindingLog(tx, {
          userId: input.userId,
          action: "UNLINK",
          machineId: prevMachineId,
          machineName: user.boundMachineName,
          osUsername: user.boundOsUser,
          reason: input.reason ?? "admin_unlink",
          actorUserId: ctx.session.user.id,
          actorName:
            ctx.session.user.name ?? ctx.session.user.email ?? null,
        });
      });

      clearUserCache(input.userId);
      return { success: true };
    }),

  listPendingMachineChangeRequests: adminProcedure.query(async ({ ctx }) => {
    return ctx.prisma.machineChangeRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            name: true,
            boundMachineId: true,
            boundMachineName: true,
            boundOsUser: true,
          },
        },
      },
    });
  }),

  reviewMachineChangeRequest: adminProcedure
    .input(
      z.object({
        requestId: z.string(),
        decision: z.enum(["APPROVED", "REJECTED"]),
        note: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const reqRow = await ctx.prisma.machineChangeRequest.findUnique({
        where: { id: input.requestId },
      });
      if (!reqRow || reqRow.status !== "PENDING") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Yêu cầu không hợp lệ.",
        });
      }

      const user = await ctx.prisma.user.findUnique({
        where: { id: reqRow.userId },
        select: {
          boundMachineId: true,
          boundMachineName: true,
          boundOsUser: true,
        },
      });
      const stillMatches =
        Boolean(user?.boundMachineId) &&
        user!.boundMachineId === reqRow.fromMachineId;

      if (input.decision === "APPROVED" && !stillMatches) {
        await ctx.prisma.machineChangeRequest.update({
          where: { id: reqRow.id },
          data: {
            status: "REJECTED",
            reviewedById: ctx.session.user.id,
            reviewedAt: new Date(),
            reviewNote:
              input.note ??
              "auto_stale: boundMachineId no longer matches fromMachineId",
          },
        });
        await writeMachineBindingLog(ctx.prisma, {
          userId: reqRow.userId,
          action: "CHANGE_DENIED",
          machineId: reqRow.fromMachineId,
          machineName: reqRow.fromMachineName,
          osUsername: reqRow.fromOsUsername,
          reason: "stale_request_machine_mismatch",
          actorUserId: ctx.session.user.id,
          actorName: ctx.session.user.name ?? ctx.session.user.email ?? null,
          metadata: {
            requestId: reqRow.id,
            currentBoundMachineId: user?.boundMachineId ?? null,
          },
        });
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Yêu cầu đã lỗi thời (máy hiện tại không còn khớp). Đã đánh dấu từ chối.",
        });
      }

      await ctx.prisma.$transaction(async (tx) => {
        await tx.machineChangeRequest.update({
          where: { id: reqRow.id },
          data: {
            status: input.decision,
            reviewedById: ctx.session.user.id,
            reviewedAt: new Date(),
            reviewNote: input.note ?? null,
          },
        });
        if (input.decision === "APPROVED") {
          await tx.user.update({
            where: { id: reqRow.userId },
            data: {
              boundMachineId: null,
              boundMachineName: null,
              boundOsUser: null,
              boundMachineAt: null,
              extensionSessionVersion: { increment: 1 },
            },
          });
          await tx.extensionRefreshToken.updateMany({
            where: { userId: reqRow.userId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
        await writeMachineBindingLog(tx, {
          userId: reqRow.userId,
          action:
            input.decision === "APPROVED"
              ? "CHANGE_APPROVED"
              : "CHANGE_DENIED",
          machineId: reqRow.fromMachineId,
          machineName: reqRow.fromMachineName,
          osUsername: reqRow.fromOsUsername,
          reason: input.note ?? reqRow.reason,
          actorUserId: ctx.session.user.id,
          actorName: ctx.session.user.name ?? ctx.session.user.email ?? null,
          metadata: { requestId: reqRow.id },
        });
      });
      clearUserCache(reqRow.userId);
      return { success: true };
    }),

  listPendingExtensionAccessRequests: adminProcedure.query(async ({ ctx }) => {
    return ctx.prisma.extensionAccessRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            name: true,
            boundMachineId: true,
            boundMachineName: true,
            extensionAccessEnabled: true,
            extensionRevokedAt: true,
          },
        },
      },
    });
  }),

  reviewExtensionAccessRequest: adminProcedure
    .input(
      z.object({
        requestId: z.string(),
        decision: z.enum(["APPROVED", "REJECTED"]),
        note: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const reqRow = await ctx.prisma.extensionAccessRequest.findUnique({
        where: { id: input.requestId },
      });
      if (!reqRow || reqRow.status !== "PENDING") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Yêu cầu không hợp lệ.",
        });
      }

      if (input.decision === "REJECTED") {
        await ctx.prisma.extensionAccessRequest.update({
          where: { id: reqRow.id },
          data: {
            status: "REJECTED",
            reviewedById: ctx.session.user.id,
            reviewedAt: new Date(),
            reviewNote: input.note ?? null,
          },
        });
        return { success: true, token: null };
      }

      // APPROVED → re-enable access + issue new personal token
      const newToken = generatePersonalToken();
      await ctx.prisma.$transaction(async (tx) => {
        await tx.extensionAccessRequest.update({
          where: { id: reqRow.id },
          data: {
            status: "APPROVED",
            reviewedById: ctx.session.user.id,
            reviewedAt: new Date(),
            reviewNote: input.note ?? null,
          },
        });
        await tx.user.update({
          where: { id: reqRow.userId },
          data: {
            extensionToken: persistPersonalTokenValue(newToken),
            extensionAccessEnabled: true,
            extensionRevokedAt: null,
            extensionSessionVersion: { increment: 1 },
          },
        });
        await tx.extensionRefreshToken.updateMany({
          where: { userId: reqRow.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.extensionPairingCode.deleteMany({
          where: { userId: reqRow.userId, usedAt: null },
        });
      });

      clearUserCache(reqRow.userId);
      return { success: true, token: newToken };
    }),

  /** All machine + extension requests (any status) for Settings admin view. */
  listAllAccessRequests: adminProcedure.query(async ({ ctx }) => {
    const userSelect = {
      id: true,
      email: true,
      username: true,
      name: true,
      avatar: true,
      image: true,
      boundMachineId: true,
      boundMachineName: true,
    } as const;

    const [machineChangeRequests, extensionAccessRequests] = await Promise.all([
      ctx.prisma.machineChangeRequest.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
        include: { user: { select: userSelect } },
      }),
      ctx.prisma.extensionAccessRequest.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
        include: { user: { select: userSelect } },
      }),
    ]);

    return { machineChangeRequests, extensionAccessRequests };
  }),
});
