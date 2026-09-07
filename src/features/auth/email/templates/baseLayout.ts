export const baseEmailLayout = (content: string, actionButton?: { url: string; text: string }) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1e293b; margin: 0; padding: 0; background-color: #f8fafc; }
    .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0; }
    .header { padding: 32px 40px; text-align: center; background: #0f172a; }
    .logo { color: #ffffff; font-size: 22px; font-weight: 900; text-decoration: none; letter-spacing: -0.5px; }
    .content { padding: 40px; }
    .h1 { font-size: 22px; font-weight: 800; color: #0f172a; margin-bottom: 20px; letter-spacing: -0.5px; }
    .p { font-size: 15px; color: #475569; margin-bottom: 20px; line-height: 26px; }
    .btn-container { text-align: center; margin: 32px 0; }
    .btn { display: inline-block; background: linear-gradient(135deg, #ec4899, #f43f5e); color: #ffffff !important; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-size: 15px; box-shadow: 0 4px 12px rgba(236, 72, 153, 0.3); }
    .footer { padding: 32px 40px; background-color: #f8fafc; text-align: center; border-top: 1px solid #e2e8f0; }
    .footer-text { font-size: 12px; color: #94a3b8; line-height: 20px; margin: 0; }
    .link { color: #ec4899; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <a href="{{app_url}}" class="logo">TIKTOKFLOW</a>
    </div>
    <div class="content">
      ${content}
      
      ${actionButton ? `
        <div class="btn-container">
          <a href="${actionButton.url}" class="btn">${actionButton.text}</a>
        </div>
      ` : ''}
      
      <p class="p" style="font-size: 13px; color: #94a3b8; margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 20px;">
        Mã phiên: ${new Date().getTime()}
      </p>
    </div>
    <div class="footer">
      <p class="footer-text">
        &copy; ${new Date().getFullYear()} TIKTOKFLOW Inc. Bảo lưu mọi quyền.
      </p>
      <p class="footer-text" style="margin-top: 8px;">
        <a href="{{app_url}}/privacy" class="link">Chính Sách Bảo Mật</a> • <a href="{{app_url}}/terms" class="link">Điều Khoản Dịch Vụ</a>
      </p>
    </div>
  </div>
</body>
</html>
`;
