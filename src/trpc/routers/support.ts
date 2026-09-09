import { z } from "zod";
import { router, publicProcedure, protectedProcedure, leadProcedure, adminProcedure } from "@/trpc/init";
import { TRPCError } from "@trpc/server";

export interface BugReportItem {
  id: string;
  title: string;
  description: string;
  category: "GPM_SYNC" | "EXTENSION" | "CLIENT_AGENT" | "REVENUE_DATA" | "UI_UX" | "SECURITY" | "OTHER";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  reporterId?: string;
  reporterName?: string;
  reporterEmail?: string;
  systemInfo?: {
    url?: string;
    userAgent?: string;
    screen?: string;
    timestamp?: string;
  };
  screenshotUrl?: string;
  screenshotUrls?: string[];
  adminNotes?: string;
  createdAt: string;
  updatedAt: string;
}

const BUG_REPORTS_KEY = "system_bug_reports_log";
const BUG_REPORTS_EMAILS_KEY = "bug_report_alert_emails";

export const supportRouter = router({
  // 1. Submit a Bug Report (Any logged-in user or authenticated session)
  createBugReport: protectedProcedure
    .input(
      z.object({
        title: z.string().min(3, "Tiêu đề lỗi tối thiểu 3 ký tự").max(200),
        description: z.string().min(5, "Mô tả chi tiết tối thiểu 5 ký tự").max(5000),
        category: z.enum([
          "GPM_SYNC",
          "EXTENSION",
          "CLIENT_AGENT",
          "REVENUE_DATA",
          "UI_UX",
          "SECURITY",
          "OTHER",
        ]),
        severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
        systemInfo: z
          .object({
            url: z.string().optional(),
            userAgent: z.string().optional(),
            screen: z.string().optional(),
            timestamp: z.string().optional(),
          })
          .optional(),
        screenshotUrl: z.string().optional(),
        screenshotUrls: z.array(z.string()).max(5).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = ctx.session.user;
      const now = new Date().toISOString();
      const reportId = `bug_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      const urls = input.screenshotUrls || (input.screenshotUrl ? [input.screenshotUrl] : []);

      const newReport: BugReportItem = {
        id: reportId,
        title: input.title,
        description: input.description,
        category: input.category,
        severity: input.severity,
        status: "OPEN",
        reporterId: user.id,
        reporterName: user.name || "Thành viên",
        reporterEmail: user.email || undefined,
        systemInfo: input.systemInfo,
        screenshotUrl: urls[0] || undefined,
        screenshotUrls: urls,
        createdAt: now,
        updatedAt: now,
      };

      // Retrieve existing reports list
      let existingReports: BugReportItem[] = [];
      try {
        const configRecord = await ctx.prisma.systemConfig.findUnique({
          where: { key: BUG_REPORTS_KEY },
        });
        if (configRecord?.value) {
          existingReports = JSON.parse(configRecord.value);
        }
      } catch {
        existingReports = [];
      }

      // Prepend newest report and limit to latest 500 reports
      const updatedReports = [newReport, ...existingReports].slice(0, 500);

      await ctx.prisma.systemConfig.upsert({
        where: { key: BUG_REPORTS_KEY },
        update: {
          value: JSON.stringify(updatedReports),
          updatedAt: new Date(),
        },
        create: {
          key: BUG_REPORTS_KEY,
          value: JSON.stringify(updatedReports),
          description: "Danh sách báo cáo sự cố & feedback từ người dùng",
        },
      });

      // Also record into AccountLog as SYSTEM alert if security/critical
      if (input.severity === "CRITICAL" || input.category === "SECURITY") {
        try {
          const firstAccount = await ctx.prisma.tiktokAccount.findFirst({
            select: { id: true },
          });
          if (firstAccount) {
            await ctx.prisma.accountLog.create({
              data: {
                accountId: firstAccount.id,
                oldStatus: "HEALTHY",
                newStatus: "ALERT",
                logType: "ALERT",
                message: `[BÁO CÁO KHẨN CẤP] ${input.title} - bởi ${user.email}`,
                actorName: user.name || "System",
              },
            });
          }
        } catch {
          // Non-blocking
        }
      }

      // Sentry Feedback & Error Capture
      try {
        const Sentry = await import("@sentry/nextjs");
        Sentry.captureMessage(`[USER BUG REPORT] [${input.category}] [${input.severity}] ${input.title}`, {
          level: input.severity === "CRITICAL" ? "fatal" : input.severity === "HIGH" ? "error" : "warning",
          extra: {
            reportId,
            description: input.description,
            category: input.category,
            severity: input.severity,
            reporterEmail: user.email,
            systemInfo: input.systemInfo,
          },
        });
      } catch {
        // Sentry is non-blocking if offline
      }

      // Send Email Notification to configured Admin Alert Emails
      try {
        const alertConfig = await ctx.prisma.systemConfig.findUnique({
          where: { key: BUG_REPORTS_EMAILS_KEY },
        });

        let targetEmails: string[] = [];
        if (alertConfig?.value) {
          try {
            const parsed = JSON.parse(alertConfig.value);
            if (Array.isArray(parsed)) targetEmails = parsed;
            else if (typeof parsed === "string") {
              targetEmails = parsed.split(/[,;\s]+/).filter(Boolean);
            }
          } catch {
            targetEmails = String(alertConfig.value).split(/[,;\s]+/).filter(Boolean);
          }
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        targetEmails = targetEmails.map((e) => e.trim()).filter((e) => emailRegex.test(e));

        if (targetEmails.length > 0) {
          const { emailService } = await import("@/utils/email/emailService");
          const siteUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
          const severityColor =
            input.severity === "CRITICAL"
              ? "#ef4444"
              : input.severity === "HIGH"
              ? "#f97316"
              : input.severity === "MEDIUM"
              ? "#f59e0b"
              : "#3b82f6";

          const imagesHtml =
            urls.length > 0
              ? `
              <div style="margin-top: 18px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
                <strong style="color: #1e293b; font-size: 13px;">Ảnh chụp màn hình đính kèm (${urls.length}):</strong>
                <div style="margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px;">
                  ${urls
                    .map((u, idx) => {
                      const fullImgUrl = u.startsWith("http") ? u : `${siteUrl}${u}`;
                      return `
                        <div style="display: inline-block; margin-right: 8px; margin-bottom: 8px;">
                          <a href="${fullImgUrl}" target="_blank" style="text-decoration: none;">
                            <img src="${fullImgUrl}" alt="Ảnh ${idx + 1}" style="width: 140px; height: 90px; object-fit: cover; border-radius: 8px; border: 1px solid #cbd5e1;" />
                          </a>
                          <div style="font-size: 11px; text-align: center; color: #64748b; margin-top: 2px;">Ảnh ${idx + 1}</div>
                        </div>
                      `;
                    })
                    .join("")}
                </div>
              </div>
            `
              : "";

          const emailHtml = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 620px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06);">
              <div style="background: linear-gradient(135deg, #0f172a, #1e293b); padding: 24px; color: #ffffff;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                  <span style="font-weight: 900; font-size: 18px; letter-spacing: -0.5px;">TIKTOK<span style="color: #ec4899;">FLOW</span></span>
                  <span style="background: ${severityColor}; color: #ffffff; font-size: 10px; font-weight: 800; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase;">
                    ${input.severity}
                  </span>
                </div>
                <h1 style="font-size: 20px; font-weight: 800; margin: 0; color: #ffffff; line-height: 1.3;">
                  ${input.title}
                </h1>
              </div>

              <div style="padding: 24px; color: #334155; line-height: 1.6;">
                <div style="background: #f8fafc; border-radius: 12px; padding: 14px 16px; margin-bottom: 20px; border: 1px solid #f1f5f9; font-size: 13px;">
                  <div style="margin-bottom: 6px;"><strong>Người gửi:</strong> ${user.name || "Thành viên"} (${user.email || "Không có email"})</div>
                  <div style="margin-bottom: 6px;"><strong>Danh mục:</strong> <span style="font-family: monospace; background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-weight: bold;">${input.category}</span></div>
                  <div style="margin-bottom: 6px;"><strong>Mã sự cố:</strong> <code style="color: #ec4899;">${reportId}</code></div>
                  <div><strong>Thời gian gửi:</strong> ${new Date(now).toLocaleString("vi-VN")}</div>
                </div>

                <h3 style="font-size: 14px; font-weight: 700; color: #0f172a; margin: 0 0 8px 0;">Nội dung mô tả sự cố:</h3>
                <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; font-size: 13.5px; white-space: pre-wrap; color: #1e293b;">${input.description}</div>

                ${imagesHtml}

                ${
                  input.systemInfo
                    ? `
                  <div style="margin-top: 20px; font-size: 11px; color: #64748b; background: #f8fafc; padding: 12px; border-radius: 8px;">
                    <strong>Thông tin môi trường:</strong><br />
                    • Trang gặp lỗi: ${input.systemInfo.url || "N/A"}<br />
                    • Độ phân giải: ${input.systemInfo.screen || "N/A"}<br />
                    • Trình duyệt: ${input.systemInfo.userAgent || "N/A"}
                  </div>
                `
                    : ""
                }

                <div style="margin-top: 28px; text-align: center;">
                  <a href="${siteUrl}/settings?tab=bugs" style="display: inline-block; background: #ec4899; color: #ffffff; font-weight: 700; font-size: 13px; padding: 12px 28px; border-radius: 12px; text-decoration: none; box-shadow: 0 4px 10px rgba(236,72,153,0.25);">
                    Mở Bảng Điều Khiển Admin để Xử Lý
                  </a>
                </div>
              </div>
            </div>
          `;

          for (const email of targetEmails) {
            await emailService.sendNodemailerEmail(
              email,
              `[TIKTOKFLOW BÁO CÁO SỰ CỐ] [${input.severity}] ${input.title}`,
              emailHtml
            );
          }
        }
      } catch (emailErr: any) {
        console.warn("[BugReport Alert Email Error]:", emailErr?.message);
      }

      return {
        success: true,
        reportId,
        message: "Cảm ơn bạn! Báo cáo sự cố đã được gửi tới đội ngũ kỹ thuật thành công.",
      };
    }),

  // 2. List Bug Reports (Team Lead or Admin, or self reports for Staff)
  listBugReports: protectedProcedure
    .input(
      z
        .object({
          status: z.enum(["ALL", "OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
          category: z.string().optional(),
          severity: z.string().optional(),
          limit: z.number().min(1).max(200).default(50),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const role = ctx.session.user.role;
      const isAdminOrLead = role === "ADMIN" || role === "LEAD";
      const userId = ctx.session.user.id;

      let reports: BugReportItem[] = [];
      try {
        const record = await ctx.prisma.systemConfig.findUnique({
          where: { key: BUG_REPORTS_KEY },
        });
        if (record?.value) {
          reports = JSON.parse(record.value);
        }
      } catch {
        reports = [];
      }

      // If regular staff, only show their own submitted reports
      if (!isAdminOrLead) {
        reports = reports.filter((r) => r.reporterId === userId);
      }

      // Filter by status if specified
      if (input?.status && input.status !== "ALL") {
        reports = reports.filter((r) => r.status === input.status);
      }

      // Filter by category if specified
      if (input?.category && input.category !== "ALL") {
        reports = reports.filter((r) => r.category === input.category);
      }

      // Filter by severity if specified
      if (input?.severity && input.severity !== "ALL") {
        reports = reports.filter((r) => r.severity === input.severity);
      }

      return {
        items: reports.slice(0, input?.limit || 50),
        total: reports.length,
        openCount: reports.filter((r) => r.status === "OPEN").length,
        inProgressCount: reports.filter((r) => r.status === "IN_PROGRESS").length,
        resolvedCount: reports.filter((r) => r.status === "RESOLVED").length,
        closedCount: reports.filter((r) => r.status === "CLOSED").length,
      };
    }),

  // 3. Update Bug Report Status (Lead or Admin only)
  updateBugReportStatus: leadProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
        adminNotes: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let reports: BugReportItem[] = [];
      const record = await ctx.prisma.systemConfig.findUnique({
        where: { key: BUG_REPORTS_KEY },
      });
      if (record?.value) {
        reports = JSON.parse(record.value);
      }

      const index = reports.findIndex((r) => r.id === input.id);
      if (index === -1) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Không tìm thấy báo cáo sự cố yêu cầu.",
        });
      }

      reports[index] = {
        ...reports[index],
        status: input.status,
        adminNotes: input.adminNotes !== undefined ? input.adminNotes : reports[index].adminNotes,
        updatedAt: new Date().toISOString(),
      };

      await ctx.prisma.systemConfig.upsert({
        where: { key: BUG_REPORTS_KEY },
        update: {
          value: JSON.stringify(reports),
          updatedAt: new Date(),
        },
        create: {
          key: BUG_REPORTS_KEY,
          value: JSON.stringify(reports),
          description: "Danh sách báo cáo sự cố & feedback từ người dùng",
        },
      });

      return {
        success: true,
        report: reports[index],
      };
    }),

  // 4. Get Configured Alert Emails (Admin only)
  getAlertEmails: adminProcedure.query(async ({ ctx }) => {
    const config = await ctx.prisma.systemConfig.findUnique({
      where: { key: BUG_REPORTS_EMAILS_KEY },
    });
    if (!config?.value) return [];
    try {
      const parsed = JSON.parse(config.value);
      return Array.isArray(parsed) ? parsed : [String(parsed)];
    } catch {
      return config.value.split(/[,;\s]+/).filter(Boolean);
    }
  }),

  // 5. Set Configured Alert Emails (Admin only)
  setAlertEmails: adminProcedure
    .input(z.object({ emails: z.array(z.string().email("Email không hợp lệ")) }))
    .mutation(async ({ ctx, input }) => {
      const saved = await ctx.prisma.systemConfig.upsert({
        where: { key: BUG_REPORTS_EMAILS_KEY },
        update: {
          value: JSON.stringify(input.emails),
          updatedAt: new Date(),
        },
        create: {
          key: BUG_REPORTS_EMAILS_KEY,
          value: JSON.stringify(input.emails),
          description: "Danh sách email nhận thông báo báo cáo sự cố từ người dùng",
        },
      });

      return {
        success: true,
        emails: input.emails,
      };
    }),

  // 6. Audit & System Activity Logs Query
  getAuditLogs: protectedProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(5).max(100).default(20),
        logType: z.string().optional(),
        search: z.string().optional(),
        accountId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize, logType, search, accountId } = input;
      const skip = (page - 1) * pageSize;

      const where: any = {};

      if (logType && logType !== "ALL") {
        where.logType = logType;
      }

      if (accountId && accountId !== "ALL") {
        where.accountId = accountId;
      }

      if (search && search.trim()) {
        const query = search.trim();
        where.OR = [
          { message: { contains: query, mode: "insensitive" } },
          { actorName: { contains: query, mode: "insensitive" } },
          { account: { username: { contains: query, mode: "insensitive" } } },
        ];
      }

      // If user is regular staff, restrict to their assigned accounts
      if (ctx.session.user.role === "STAFF") {
        where.account = {
          assignedUserId: ctx.session.user.id,
        };
      }

      const [logs, totalCount, statsTypes] = await Promise.all([
        ctx.prisma.accountLog.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: { createdAt: "desc" },
          include: {
            account: {
              select: {
                id: true,
                username: true,
                country: true,
                status: true,
                gpmProfileId: true,
              },
            },
          },
        }),
        ctx.prisma.accountLog.count({ where }),
        ctx.prisma.accountLog.groupBy({
          by: ["logType"],
          _count: { _all: true },
        }),
      ]);

      const typeCounts: Record<string, number> = {};
      statsTypes.forEach((st) => {
        typeCounts[st.logType] = st._count._all;
      });

      return {
        items: logs,
        total: totalCount,
        page,
        pageSize,
        totalPages: Math.ceil(totalCount / pageSize),
        stats: {
          total: totalCount,
          statusChanges: typeCounts["STATUS_CHANGE"] || 0,
          syncEvents: (typeCounts["REVENUE_UPDATE"] || 0) + (typeCounts["SYNC_ERROR"] || 0),
          alerts: typeCounts["ALERT"] || 0,
        },
      };
    }),
});
