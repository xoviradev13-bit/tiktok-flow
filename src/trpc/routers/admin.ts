import { router, adminProcedure } from "@/trpc/init";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { clearUserCache } from "@/lib/auth";

export const adminRouter = router({
  // 1. List all users with fleet stats & Group info (ADMIN)
  listUsers: adminProcedure.query(async ({ ctx }) => {
    const users = await ctx.prisma.user.findMany({
      where: { deletedAt: null },
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
        groupId: true,
        extensionToken: true,
        group: {
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
      groupName: u.group?.name || null,
      groupId: u.groupId || u.group?.id || null,
      hasExtensionToken: !!u.extensionToken,
    }));
  }),

  // List all Groups with Leader, Creator, Members, and Account Stats (ADMIN)
  listGroups: adminProcedure.query(async ({ ctx }) => {
    let dbGroups: any[] = [];
    try {
      dbGroups = await ctx.prisma.group.findMany({
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
      console.warn("[listGroups] query error:", e);
    }

    // Default seeded groups if empty
    if (dbGroups.length === 0) {
      const defaultNames = ["Team US #1", "Team EU #1", "Team VN #1"];
      for (const name of defaultNames) {
        try {
          const created = await ctx.prisma.group.upsert({
            where: { name },
            create: { name, createdById: ctx.session.user.id },
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
          dbGroups.push(created);
        } catch {}
      }
    }

    return {
      groups: dbGroups.map((g) => g.name),
      groupsDetails: dbGroups.map((g) => {
        const totalAccounts = g.members?.reduce((acc: number, m: any) => acc + (m._count?.tiktokAccounts || 0), 0) || 0;
        return {
          id: g.id,
          name: g.name,
          color: g.color || "pink",
          description: g.description,
          createdAt: g.createdAt,
          updatedAt: g.updatedAt,
          leader: g.leader
            ? {
                id: g.leader.id,
                name: g.leader.name || g.leader.fullName || g.leader.username || g.leader.email,
                username: g.leader.username,
                email: g.leader.email,
                avatar: g.leader.avatar,
                role: g.leader.role,
              }
            : null,
          createdBy: g.createdBy
            ? {
                id: g.createdBy.id,
                name: g.createdBy.name || g.createdBy.fullName || g.createdBy.username || g.createdBy.email,
                username: g.createdBy.username,
                email: g.createdBy.email,
                avatar: g.createdBy.avatar,
                role: g.createdBy.role,
              }
            : null,
          membersCount: g._count?.members || 0,
          totalAccounts,
          members: (g.members || []).map((m: any) => ({
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
      }),
    };
  }),

  // Create a new Group in Group table (ADMIN)
  createGroup: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(50),
        description: z.string().optional(),
        color: z.string().optional().default("pink"),
        leaderId: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const cleanName = input.name.trim();
      const existing = await ctx.prisma.group.findUnique({
        where: { name: cleanName },
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Nhóm với tên này đã tồn tại trong hệ thống.",
        });
      }

      const group = await ctx.prisma.group.create({
        data: {
          name: cleanName,
          description: input.description,
          color: input.color,
          leaderId: input.leaderId || null,
          createdById: ctx.session.user.id,
        },
      });

      return group;
    }),

  // Update Group details (ADMIN)
  updateGroup: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(50),
        description: z.string().optional().nullable(),
        color: z.string().optional().default("pink"),
        leaderId: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const cleanName = input.name.trim();
      const existing = await ctx.prisma.group.findFirst({
        where: { name: cleanName, id: { not: input.id } },
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Tên nhóm đã bị trùng với một nhóm khác.",
        });
      }

      const group = await ctx.prisma.group.update({
        where: { id: input.id },
        data: {
          name: cleanName,
          description: input.description,
          color: input.color,
          leaderId: input.leaderId || null,
        },
      });

      return group;
    }),

  // Delete a Group from Group table (ADMIN)
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
          message: "Vui lòng cung cấp ID hoặc tên nhóm cần xóa.",
        });
      }

      const group = input.id
        ? await ctx.prisma.group.findUnique({ where: { id: input.id } })
        : await ctx.prisma.group.findUnique({ where: { name: input.name } });

      if (!group) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Không tìm thấy nhóm cần xóa.",
        });
      }

      // Unassign all users from this group
      await ctx.prisma.user.updateMany({
        where: { groupId: group.id },
        data: { groupId: null },
      });

      await ctx.prisma.group.delete({
        where: { id: group.id },
      });

      return { success: true };
    }),

  // Update user's Group assignment in Group table (ADMIN)
  updateUserGroup: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        groupName: z.string().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let targetGroupId: string | null = null;

      if (input.groupName && input.groupName.trim()) {
        const cleanName = input.groupName.trim();
        let group = await ctx.prisma.group.findUnique({
          where: { name: cleanName },
        });

        if (!group) {
          group = await ctx.prisma.group.create({
            data: { name: cleanName },
          });
        }
        targetGroupId = group.id;
      }

      const updated = await ctx.prisma.user.update({
        where: { id: input.userId },
        data: { groupId: targetGroupId },
        include: { group: true },
      });

      return {
        success: true,
        userId: updated.id,
        groupName: updated.group?.name || null,
        groupId: updated.groupId,
      };
    }),

  // Bulk Delete Groups (ADMIN)
  bulkDeleteGroups: adminProcedure
    .input(
      z.object({
        groupIds: z.array(z.string()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.groupIds.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Danh sách nhóm cần xóa không được rỗng.",
        });
      }

      // Unassign all users from these groups
      await ctx.prisma.user.updateMany({
        where: { groupId: { in: input.groupIds } },
        data: { groupId: null },
      });

      const res = await ctx.prisma.group.deleteMany({
        where: { id: { in: input.groupIds } },
      });

      return { count: res.count };
    }),

  // Bulk Assign Groups Leader (ADMIN)
  bulkAssignGroupsLeader: adminProcedure
    .input(
      z.object({
        groupIds: z.array(z.string()),
        leaderId: z.string().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.groupIds.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Danh sách nhóm không được rỗng.",
        });
      }

      const res = await ctx.prisma.group.updateMany({
        where: { id: { in: input.groupIds } },
        data: { leaderId: input.leaderId || null },
      });

      return { count: res.count };
    }),

  // Bulk Change Groups Color (ADMIN)
  bulkChangeGroupsColor: adminProcedure
    .input(
      z.object({
        groupIds: z.array(z.string()),
        color: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.groupIds.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Danh sách nhóm không được rỗng.",
        });
      }

      const res = await ctx.prisma.group.updateMany({
        where: { id: { in: input.groupIds } },
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

      let groupId: string | null = null;
      if (input.groupName && input.groupName.trim()) {
        const cleanName = input.groupName.trim();
        let group = await ctx.prisma.group.findUnique({ where: { name: cleanName } });
        if (!group) {
          group = await ctx.prisma.group.create({ data: { name: cleanName } });
        }
        groupId = group.id;
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
          groupId,
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

      const updated = await ctx.prisma.user.update({
        where: { id: input.userId },
        data: { isActive: input.isActive },
      });

      // Clear cached user so JWT callbacks reflect this change immediately
      clearUserCache(input.userId);

      // Invalidate active database sessions if any
      await ctx.prisma.session.deleteMany({
        where: { userId: input.userId },
      }).catch(() => {});

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
        where: { id: { in: input.accountIds } },
        data: { assignedUserId: input.targetUserId },
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

      // Unassign accounts assigned to this user
      await ctx.prisma.tiktokAccount.updateMany({
        where: { assignedUserId: input.userId },
        data: { assignedUserId: null },
      });

      // Soft delete by setting deletedAt and disabling
      const updated = await ctx.prisma.user.update({
        where: { id: input.userId },
        data: {
          deletedAt: new Date(),
          isActive: false,
        },
      });

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

      // Unassign accounts
      await ctx.prisma.tiktokAccount.updateMany({
        where: { assignedUserId: { in: targetIds } },
        data: { assignedUserId: null },
      });

      // Soft delete users
      const res = await ctx.prisma.user.updateMany({
        where: { id: { in: targetIds } },
        data: {
          deletedAt: new Date(),
          isActive: false,
        },
      });

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
        group: {
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
      groupName: inv.group?.name || null,
      groupId: inv.groupId,
      groupColor: inv.group?.color || "pink",
      invitedByName: inv.invitedBy?.name || inv.invitedBy?.username || inv.invitedBy?.email || "Admin",
    }));
  }),

  // 9. Create a new Invitation (ADMIN)
  createInvitation: adminProcedure
    .input(
      z.object({
        email: z.string().email(),
        role: z.enum(["ADMIN", "LEAD", "STAFF"]).default("STAFF"),
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

      let groupId: string | null = null;
      if (input.groupName && input.groupName.trim()) {
        const cleanName = input.groupName.trim();
        let group = await ctx.prisma.group.findUnique({ where: { name: cleanName } });
        if (!group) {
          group = await ctx.prisma.group.create({ data: { name: cleanName } });
        }
        groupId = group.id;
      }

      const crypto = await import("crypto");
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours (1 day)

      const invitation = await ctx.prisma.invitation.create({
        data: {
          email: cleanEmail,
          role: input.role,
          groupId,
          invitedById: ctx.session.user.id,
          token,
          expiresAt,
          status: "PENDING",
        },
        include: {
          group: true,
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
          groupName: input.groupName || null,
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
        groupName: invitation.group?.name || null,
        expiresAt: invitation.expiresAt,
      };
    }),

  // 9b. Create Bulk Invitations (ADMIN)
  createBulkInvitations: adminProcedure
    .input(
      z.object({
        emails: z.array(z.string().email()).min(1),
        role: z.enum(["ADMIN", "LEAD", "STAFF"]).default("STAFF"),
        groupName: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const uniqueEmails = Array.from(
        new Set(input.emails.map((e) => e.trim().toLowerCase()).filter(Boolean))
      );

      let groupId: string | null = null;
      if (input.groupName && input.groupName.trim()) {
        const cleanName = input.groupName.trim();
        let group = await ctx.prisma.group.findUnique({ where: { name: cleanName } });
        if (!group) {
          group = await ctx.prisma.group.create({ data: { name: cleanName } });
        }
        groupId = group.id;
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
                groupId,
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
                groupId,
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
              groupName: input.groupName || null,
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
        include: { group: true },
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
          groupName: invite.group?.name || null,
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
          token: user.extensionToken,
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
      const newToken = `ttf_sec_${crypto.randomBytes(16).toString("hex")}`;
      await ctx.prisma.user.update({
        where: { id: user.id },
        data: { extensionToken: newToken, extensionAccessEnabled: true },
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
      const newToken = `ttf_sec_${crypto.randomBytes(16).toString("hex")}`;
      await ctx.prisma.user.update({
        where: { id: user.id },
        data: {
          extensionToken: newToken,
          extensionAccessEnabled: true,
          extensionRevokedAt: null,
        },
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

      await ctx.prisma.user.update({
        where: { id: user.id },
        data: {
          extensionToken: null,
          extensionAccessEnabled: false,
          extensionRevokedAt: new Date(),
        },
      });

      return {
        userId: user.id,
        revoked: true,
      };
    }),
});
