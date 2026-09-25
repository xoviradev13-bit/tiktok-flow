import { EmailTemplate, EmailTheme } from "../types";

export interface WorkspaceInvitationEmailData {
  recipientName?: string;
  inviterName: string;
  workspaceName?: string;
  teamName?: string | null;
  groupName?: string | null;
  role?: string;
  invitationUrl: string;
  expiresAt?: Date;
}

const TIKTOKFLOW_THEME: EmailTheme = {
  brandColor: "#ec4899",
  buttonText: "#ffffff",
  backgroundColor: "#0f172a",
  textColor: "#334155",
  headerColor: "#020617",
};

export class InvitationEmailTemplates {
  /**
   * Invitation to join TIKTOKFLOW operations workspace
   */
  static getWorkspaceMemberInvite(
    data: WorkspaceInvitationEmailData,
    theme: EmailTheme = TIKTOKFLOW_THEME
  ): EmailTemplate {
    const diffHours = data.expiresAt
      ? Math.max(1, Math.round((new Date(data.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60)))
      : 24;
    const expiryLabel =
      diffHours <= 24
        ? `${diffHours} giờ (24h)`
        : `${Math.ceil(diffHours / 24)} ngày`;

    const roleName = data.role ? data.role.toUpperCase() : "STAFF";
    const roleBadgeText =
      roleName === "ADMIN"
        ? "Quản Trị Viên (Admin)"
        : roleName === "LEAD"
        ? "Trưởng Nhóm (Lead)"
        : "Nhân Viên Vận Hành (Staff)";

    const workspace = data.workspaceName || "TIKTOKFLOW";
    const displayTeam = data.teamName || data.groupName || null;

    return {
      subject: `[TIKTOKFLOW] ${data.inviterName} đã gửi thư mời bạn tham gia hệ thống (${roleBadgeText})`,
      html: `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Lời Mời Tham Gia TIKTOKFLOW</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
    <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc;">
        <tr>
            <td align="center" style="padding: 40px 16px;">
                <table role="presentation" style="width: 580px; max-width: 100%; background-color: #ffffff; border-radius: 20px; border: 1px solid #e2e8f0; box-shadow: 0 10px 30px rgba(0,0,0,0.06); overflow: hidden;">
                    <!-- Brand Header -->
                    <tr>
                        <td style="padding: 36px 40px 30px; text-align: center; background: linear-gradient(135deg, #020617 0%, #0f172a 100%); border-bottom: 3px solid #ec4899;">
                            <div style="display: inline-block; padding: 6px 16px; border-radius: 9999px; background: rgba(236, 72, 153, 0.15); border: 1px solid rgba(236, 72, 153, 0.4); color: #f43f5e; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 12px;">
                                Thư Mời Thành Viên
                            </div>
                            <div style="font-size: 26px; font-weight: 900; letter-spacing: -0.5px; color: #ffffff; margin-bottom: 4px;">
                                TIKTOK<span style="color: #ec4899;">FLOW</span>
                            </div>
                            <div style="font-size: 12px; color: #94a3b8; font-weight: 500;">
                                Nền tảng tự động hóa và quản trị dàn tài khoản TikTok
                            </div>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 36px 40px 24px;">
                            <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 800; color: #0f172a; line-height: 28px;">
                                Bạn được mời tham gia hệ thống!
                            </h2>
                            
                            <p style="margin: 0 0 20px; font-size: 14px; line-height: 24px; color: #475569;">
                                Xin chào <strong>${data.recipientName || "bạn"}</strong>,<br>
                                Quản trị viên <strong>${data.inviterName}</strong> vừa tạo thư mời để bạn tham gia vận hành tại không gian làm việc <strong>${workspace}</strong>.
                            </p>
                            
                            <!-- Detail Card -->
                            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #ec4899; padding: 18px 22px; margin: 24px 0; border-radius: 12px;">
                                <table role="presentation" style="width: 100%; border-collapse: collapse; font-size: 13px;">
                                    <tr>
                                        <td style="padding: 4px 0; color: #64748b; width: 140px;">Vai trò được gán:</td>
                                        <td style="padding: 4px 0; color: #0f172a; font-weight: 700;">${roleBadgeText}</td>
                                    </tr>
                                    ${displayTeam ? `
                                    <tr>
                                        <td style="padding: 4px 0; color: #64748b;">Đội ngũ / Team:</td>
                                        <td style="padding: 4px 0; color: #ec4899; font-weight: 700;">${displayTeam}</td>
                                    </tr>
                                    ` : ""}
                                    <tr>
                                        <td style="padding: 4px 0; color: #64748b;">Thời hạn hiệu lực:</td>
                                        <td style="padding: 4px 0; color: #e11d48; font-weight: 700;">${expiryLabel} (Khuyến nghị kích hoạt sớm)</td>
                                    </tr>
                                </table>
                            </div>
                            
                            <!-- CTA Button -->
                            <table role="presentation" style="width: 100%; margin: 30px 0 20px;">
                                <tr>
                                    <td align="center">
                                        <a href="${data.invitationUrl}" style="display: inline-block; padding: 15px 38px; background: linear-gradient(135deg, #ec4899 0%, #f43f5e 100%); color: #ffffff; text-decoration: none; border-radius: 12px; font-weight: 800; font-size: 14px; box-shadow: 0 6px 18px rgba(236, 72, 153, 0.35); text-transform: uppercase; letter-spacing: 0.5px;">
                                            Chấp Nhận Lời Mời & Tham Gia
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            
                            <p style="margin: 20px 0 0; font-size: 12px; line-height: 20px; color: #94a3b8; text-align: center;">
                                Hoặc sao chép liên kết này vào trình duyệt nếu nút không bấm được:<br>
                                <a href="${data.invitationUrl}" style="color: #ec4899; word-break: break-all; font-size: 12px; text-decoration: underline;">${data.invitationUrl}</a>
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 24px 40px; background-color: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center;">
                            <p style="margin: 0 0 6px; font-size: 12px; color: #94a3b8; line-height: 18px;">
                                Nếu bạn không nhận diện được người gửi hoặc không mong đợi thư mời này, bạn có thể an tâm bỏ qua email này.
                            </p>
                            <p style="margin: 0; font-size: 12px; color: #cbd5e1; font-weight: 600;">
                                © ${new Date().getFullYear()} TIKTOKFLOW. TikTok Fleet Automation & Creator Operations.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
      `,
      text: `[TIKTOKFLOW] Lời mời tham gia hệ thống

Xin chào ${data.recipientName || "bạn"},
${data.inviterName} đã mời bạn tham gia hệ thống TIKTOKFLOW với vai trò: ${roleBadgeText}.
${data.groupName ? `Nhóm/Team: ${data.groupName}\n` : ""}Thời hạn liên kết: ${expiryLabel}

Bấm vào liên kết bên dưới để hoàn tất đăng ký hoặc đăng nhập nhận quyền:
${data.invitationUrl}

Nếu bạn không mong đợi email này, vui lòng bỏ qua.`,
    };
  }
}

export default InvitationEmailTemplates;
