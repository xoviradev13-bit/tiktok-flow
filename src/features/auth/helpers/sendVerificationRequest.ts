 
import * as nodemailer from 'nodemailer';

type Theme = { brandColor?: string; buttonText?: string };

export async function sendVerificationRequest(params: {
  identifier: string;
  url: string;
  expires: Date;
  provider: any;
  token: string;
  theme: Theme;
  request: Request;
}) {
  const { identifier: to, url, theme } = params
  const { host } = new URL(url)

  console.log('Sending magic link to:', to); 
  
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const from = process.env.EMAIL_FROM;

  if (!smtpHost || !smtpUser || !smtpPass || !from) {
    console.error('Missing SMTP configuration:', {
      smtpHost: !!smtpHost,
      smtpUser: !!smtpUser,
      smtpPass: !!smtpPass,
      from: !!from
    });
    throw new Error("Missing SMTP or EMAIL_FROM env vars");
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });

  try {
    await transporter.verify();
    console.log('SMTP connection verified');
    
    const result = await transporter.sendMail({
      to,
      from,
      subject: `Sign in to ${host}`,
      html: html({ url, host, theme }),
      text: text({ url, host }),
    });

    console.log('Email sent successfully:', result.messageId);

    const failed = (result.rejected || []).concat(result.pending || []);
    if (failed.length) {
      throw new Error(`Nodemailer error: ${failed.join(", ")}`);
    }
  } catch (error) {
    console.error('SMTP Error:', error);
    throw error;
  }
}
 
function html(params: { url: string; host: string; theme: Theme }) {
  const { url, host, theme } = params
 
  const escapedHost = host.replace(/\./g, "&#8203;.")
 
  const brandColor = theme.brandColor || "#346df1"
  const color = {
    background: "#f9f9f9",
    text: "#444",
    mainBackground: "#fff",
    buttonBackground: brandColor,
    buttonBorder: brandColor,
    buttonText: theme.buttonText || "#fff",
  }
 
  return `
<body style="background: ${color.background};">
  <table width="100%" border="0" cellspacing="20" cellpadding="0"
    style="background: ${color.mainBackground}; max-width: 600px; margin: auto; border-radius: 10px;">
    <tr>
      <td align="center"
        style="padding: 10px 0px; font-size: 22px; font-family: Helvetica, Arial, sans-serif; color: ${color.text};">
        Sign in to <strong>${escapedHost}</strong>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td align="center" style="border-radius: 5px;" bgcolor="${color.buttonBackground}"><a href="${url}"
                target="_blank"
                style="font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${color.buttonText}; text-decoration: none; border-radius: 5px; padding: 10px 20px; border: 1px solid ${color.buttonBorder}; display: inline-block; font-weight: bold;">Sign
                in</a></td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td align="center"
        style="padding: 0px 0px 10px 0px; font-size: 16px; line-height: 22px; font-family: Helvetica, Arial, sans-serif; color: ${color.text};">
        If you did not request this email you can safely ignore it.
      </td>
    </tr>
  </table>
</body>
`
}
 
// Email Text body (fallback for email clients that don't render HTML, e.g. feature phones)
function text({ url, host }: { url: string; host: string }) {
  return `Sign in to ${host}\n${url}\n\n`
}

