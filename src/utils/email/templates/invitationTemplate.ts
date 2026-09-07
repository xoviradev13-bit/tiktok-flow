import { EmailTemplate, EmailTheme } from "../types";

export interface WorkspaceInvitationEmailData {
  recipientName?: string;
  inviterName: string;
  workspaceName: string;
  role?: string;
  invitationUrl: string;
  expiresAt?: Date;
}

export interface OrganizationInvitationEmailData {
  recipientName?: string;
  inviterName: string;
  organizationName: string;
  role?: string;
  invitationUrl: string;
  expiresAt?: Date;
}

export interface ItemGuestInvitationEmailData {
  recipientName?: string;
  inviterName: string;
  workspaceName?: string;
  itemName: string;
  itemType: "space" | "project" | "team" | "doc" | "task" | "channel" | string;
  permission?: string;
  invitationUrl: string;
  expiresAt?: Date;
}

const DEFAULT_THEME: EmailTheme = {
  brandColor: "#4F46E5",
  buttonText: "#ffffff",
  backgroundColor: "#f9f9f9",
  textColor: "#334155",
  headerColor: "#0f172a",
};

export class InvitationEmailTemplates {
  /**
   * Invitation to join a workspace as a team member
   */
  static getWorkspaceMemberInvite(
    data: WorkspaceInvitationEmailData,
    theme: EmailTheme = DEFAULT_THEME
  ): EmailTemplate {
    const expiryDays = data.expiresAt
      ? Math.max(1, Math.ceil((new Date(data.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : 7;

    return {
      subject: `${data.inviterName} invited you to join ${data.workspaceName} on TIKTOKFLOW`,
      html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Workspace Invitation</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: ${theme.backgroundColor}; color: ${theme.textColor};">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 16px;">
                <table role="presentation" style="width: 580px; max-width: 100%; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 16px rgba(0,0,0,0.06); overflow: hidden;">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 36px 40px 24px; text-align: center; background: linear-gradient(135deg, ${theme.brandColor} 0%, #7c3aed 100%);">
                            <div style="display: inline-block; padding: 6px 12px; border-radius: 9999px; background: rgba(255, 255, 255, 0.2); color: #ffffff; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 12px;">
                                Workspace Invite
                            </div>
                            <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 800;">You're Invited!</h1>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 36px 40px;">
                            <p style="margin: 0 0 16px; font-size: 15px; line-height: 24px; color: ${theme.textColor};">
                                ${data.recipientName ? `Hi ${data.recipientName},` : "Hello,"}
                            </p>
                            
                            <p style="margin: 0 0 24px; font-size: 15px; line-height: 24px; color: ${theme.textColor};">
                                <strong>${data.inviterName}</strong> has invited you to collaborate in <strong>${data.workspaceName}</strong> on TIKTOKFLOW.
                            </p>
                            
                            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid ${theme.brandColor}; padding: 16px 20px; margin: 24px 0; border-radius: 8px;">
                                <p style="margin: 0 0 6px; font-size: 13px; color: #64748b;">
                                    <strong style="color: #334155;">Workspace:</strong> ${data.workspaceName}
                                </p>
                                <p style="margin: 0 0 6px; font-size: 13px; color: #64748b;">
                                    <strong style="color: #334155;">Role:</strong> ${data.role || "Member"}
                                </p>
                                <p style="margin: 0; font-size: 13px; color: #64748b;">
                                    <strong style="color: #334155;">Link Expires In:</strong> ${expiryDays} day${expiryDays !== 1 ? "s" : ""}
                                </p>
                            </div>
                            
                            <!-- CTA Button -->
                            <table role="presentation" style="width: 100%; margin: 32px 0 24px;">
                                <tr>
                                    <td align="center">
                                        <a href="${data.invitationUrl}" style="display: inline-block; padding: 14px 36px; background-color: ${theme.brandColor}; color: ${theme.buttonText}; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25); text-transform: uppercase; letter-spacing: 0.5px;">
                                            Accept Invitation & Join
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            
                            <p style="margin: 20px 0 0; font-size: 13px; line-height: 20px; color: #94a3b8; text-align: center;">
                                Or copy and paste this URL into your browser:<br>
                                <a href="${data.invitationUrl}" style="color: ${theme.brandColor}; word-break: break-all; font-size: 12px;">${data.invitationUrl}</a>
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 40px; background-color: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center;">
                            <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                                If you weren't expecting this invitation, you can safely ignore this email.
                            </p>
                            <p style="margin: 6px 0 0; font-size: 12px; color: #94a3b8;">
                                © ${new Date().getFullYear()} TIKTOKFLOW. All rights reserved.
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
      text: `You're invited to join ${data.workspaceName} on TIKTOKFLOW!

${data.inviterName} has invited you to join ${data.workspaceName} as a ${data.role || "Member"}.

Accept the invitation here:
${data.invitationUrl}

This link will expire in ${expiryDays} days.`,
    };
  }

  /**
   * Invitation to join an Organization
   */
  static getOrganizationMemberInvite(
    data: OrganizationInvitationEmailData,
    theme: EmailTheme = DEFAULT_THEME
  ): EmailTemplate {
    const expiryDays = data.expiresAt
      ? Math.max(1, Math.ceil((new Date(data.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : 7;

    return {
      subject: `${data.inviterName} invited you to join organization "${data.organizationName}" on TIKTOKFLOW`,
      html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Organization Invitation</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: ${theme.backgroundColor}; color: ${theme.textColor};">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 16px;">
                <table role="presentation" style="width: 580px; max-width: 100%; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 16px rgba(0,0,0,0.06); overflow: hidden;">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 36px 40px 24px; text-align: center; background: linear-gradient(135deg, ${theme.brandColor} 0%, #0ea5e9 100%);">
                            <div style="display: inline-block; padding: 6px 12px; border-radius: 9999px; background: rgba(255, 255, 255, 0.2); color: #ffffff; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 12px;">
                                Organization Invite
                            </div>
                            <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 800;">Join Organization</h1>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 36px 40px;">
                            <p style="margin: 0 0 16px; font-size: 15px; line-height: 24px; color: ${theme.textColor};">
                                ${data.recipientName ? `Hi ${data.recipientName},` : "Hello,"}
                            </p>
                            
                            <p style="margin: 0 0 24px; font-size: 15px; line-height: 24px; color: ${theme.textColor};">
                                <strong>${data.inviterName}</strong> has invited you to join the organization <strong>${data.organizationName}</strong> on TIKTOKFLOW.
                            </p>
                            
                            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid ${theme.brandColor}; padding: 16px 20px; margin: 24px 0; border-radius: 8px;">
                                <p style="margin: 0 0 6px; font-size: 13px; color: #64748b;">
                                    <strong style="color: #334155;">Organization:</strong> ${data.organizationName}
                                </p>
                                <p style="margin: 0 0 6px; font-size: 13px; color: #64748b;">
                                    <strong style="color: #334155;">Role:</strong> ${data.role || "Member"}
                                </p>
                                <p style="margin: 0; font-size: 13px; color: #64748b;">
                                    <strong style="color: #334155;">Link Expires In:</strong> ${expiryDays} day${expiryDays !== 1 ? "s" : ""}
                                </p>
                            </div>
                            
                            <!-- CTA Button -->
                            <table role="presentation" style="width: 100%; margin: 32px 0 24px;">
                                <tr>
                                    <td align="center">
                                        <a href="${data.invitationUrl}" style="display: inline-block; padding: 14px 36px; background-color: ${theme.brandColor}; color: ${theme.buttonText}; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25); text-transform: uppercase; letter-spacing: 0.5px;">
                                            Accept Invitation
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            
                            <p style="margin: 20px 0 0; font-size: 13px; line-height: 20px; color: #94a3b8; text-align: center;">
                                Or copy and paste this URL into your browser:<br>
                                <a href="${data.invitationUrl}" style="color: ${theme.brandColor}; word-break: break-all; font-size: 12px;">${data.invitationUrl}</a>
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 40px; background-color: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center;">
                            <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                                If you weren't expecting this invitation, you can safely ignore this email.
                            </p>
                            <p style="margin: 6px 0 0; font-size: 12px; color: #94a3b8;">
                                © ${new Date().getFullYear()} TIKTOKFLOW. All rights reserved.
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
      text: `You're invited to join organization "${data.organizationName}" on TIKTOKFLOW!

${data.inviterName} has invited you to join as a ${data.role || "Member"}.

Accept the invitation here:
${data.invitationUrl}

This link will expire in ${expiryDays} days.`,
    };
  }

  /**
   * Invitation to collaborate on a Space, Project, Team, Document, or Task
   */
  static getItemGuestInvite(
    data: ItemGuestInvitationEmailData,
    theme: EmailTheme = DEFAULT_THEME
  ): EmailTemplate {
    const expiryDays = data.expiresAt
      ? Math.max(1, Math.ceil((new Date(data.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : 30;
    const itemTypeLabel = data.itemType.charAt(0).toUpperCase() + data.itemType.slice(1);

    return {
      subject: `${data.inviterName} invited you to collaborate on ${itemTypeLabel} "${data.itemName}" on TIKTOKFLOW`,
      html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Collaboration Invitation</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: ${theme.backgroundColor}; color: ${theme.textColor};">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 16px;">
                <table role="presentation" style="width: 580px; max-width: 100%; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 16px rgba(0,0,0,0.06); overflow: hidden;">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 36px 40px 24px; text-align: center; background: linear-gradient(135deg, ${theme.brandColor} 0%, #10b981 100%);">
                            <div style="display: inline-block; padding: 6px 12px; border-radius: 9999px; background: rgba(255, 255, 255, 0.2); color: #ffffff; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 12px;">
                                ${itemTypeLabel} Collaboration
                            </div>
                            <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 800;">You're Invited to Collaborate</h1>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 36px 40px;">
                            <p style="margin: 0 0 16px; font-size: 15px; line-height: 24px; color: ${theme.textColor};">
                                ${data.recipientName ? `Hi ${data.recipientName},` : "Hello,"}
                            </p>
                            
                            <p style="margin: 0 0 24px; font-size: 15px; line-height: 24px; color: ${theme.textColor};">
                                <strong>${data.inviterName}</strong> wants to collaborate with you on the <strong>${itemTypeLabel}</strong> "${data.itemName}".
                            </p>
                            
                            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid ${theme.brandColor}; padding: 16px 20px; margin: 24px 0; border-radius: 8px;">
                                <p style="margin: 0 0 6px; font-size: 13px; color: #64748b;">
                                    <strong style="color: #334155;">${itemTypeLabel}:</strong> ${data.itemName}
                                </p>
                                ${data.workspaceName ? `<p style="margin: 0 0 6px; font-size: 13px; color: #64748b;"><strong style="color: #334155;">Workspace:</strong> ${data.workspaceName}</p>` : ""}
                                <p style="margin: 0 0 6px; font-size: 13px; color: #64748b;">
                                    <strong style="color: #334155;">Access Level:</strong> ${data.permission || "Full"}
                                </p>
                                <p style="margin: 0; font-size: 13px; color: #64748b;">
                                    <strong style="color: #334155;">Link Expires In:</strong> ${expiryDays} day${expiryDays !== 1 ? "s" : ""}
                                </p>
                            </div>
                            
                            <!-- CTA Button -->
                            <table role="presentation" style="width: 100%; margin: 32px 0 24px;">
                                <tr>
                                    <td align="center">
                                        <a href="${data.invitationUrl}" style="display: inline-block; padding: 14px 36px; background-color: ${theme.brandColor}; color: ${theme.buttonText}; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25); text-transform: uppercase; letter-spacing: 0.5px;">
                                            View & Accept Invitation
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            
                            <p style="margin: 20px 0 0; font-size: 13px; line-height: 20px; color: #94a3b8; text-align: center;">
                                Or copy and paste this URL into your browser:<br>
                                <a href="${data.invitationUrl}" style="color: ${theme.brandColor}; word-break: break-all; font-size: 12px;">${data.invitationUrl}</a>
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 40px; background-color: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center;">
                            <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                                If you weren't expecting this invitation, you can safely ignore this email.
                            </p>
                            <p style="margin: 6px 0 0; font-size: 12px; color: #94a3b8;">
                                © ${new Date().getFullYear()} TIKTOKFLOW. All rights reserved.
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
      text: `You're invited to collaborate on ${itemTypeLabel} "${data.itemName}" on TIKTOKFLOW!

${data.inviterName} has invited you to collaborate with ${data.permission || "Full"} permissions.

Accept the invitation here:
${data.invitationUrl}

This link will expire in ${expiryDays} days.`,
    };
  }
}

export default InvitationEmailTemplates;
