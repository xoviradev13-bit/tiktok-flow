import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

dotenv.config();

console.log('ENV CONFIG:', {
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  user: process.env.SMTP_USER,
  from: process.env.EMAIL_FROM,
  service: process.env.DEFAULT_EMAIL_SERVICE
});

const isGmail =
  process.env.DEFAULT_EMAIL_SERVICE === 'google' ||
  process.env.DEFAULT_EMAIL_SERVICE === 'gmail' ||
  process.env.SMTP_SERVICE === 'gmail' ||
  process.env.SMTP_HOST === 'smtp.gmail.com';

const config = isGmail
  ? {
    service: 'gmail',
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  }
  : {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: true,
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  };

const transporter = nodemailer.createTransport(config);

try {
  console.log('Step 1: Verifying SMTP connection...');
  await transporter.verify();
  console.log('SMTP connection verification: SUCCESSFUL!');

  console.log('Step 2: Sending test email to', process.env.SMTP_USER, '...');
  const info = await transporter.sendMail({
    from: `StreamDash <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`,
    to: process.env.SMTP_USER,
    subject: 'StreamDash - Gmail Integration Test',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #4f46e5; margin-top: 0;">StreamDash Email Service</h2>
        <p>This email confirms that the Gmail service integration is working properly.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 15px 0;" />
        <ul style="color: #555; line-height: 1.6;">
          <li><strong>Service:</strong> Gmail SMTP</li>
          <li><strong>Account:</strong> ${process.env.SMTP_USER}</li>
          <li><strong>Status:</strong> Active &amp; Verified</li>
          <li><strong>Timestamp:</strong> ${new Date().toISOString()}</li>
        </ul>
      </div>
    `,
    text: 'This email confirms that the Gmail service integration is working properly in StreamDash.'
  });

  console.log('Send test email: SUCCESSFUL!');
  console.log('Message ID:', info.messageId);
  console.log('Response:', info.response);
} catch (err) {
  console.error('Email test failed with error:', err);
  process.exit(1);
}
