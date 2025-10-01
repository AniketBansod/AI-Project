// src/utils/email.ts
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export const sendEmail = async (options: EmailOptions) => {
  const mailOptions = {
    from: `"AI Classroom" <${process.env.EMAIL_USER}>`,
    to: options.to,
    subject: options.subject,
    html: options.html,
  };

  await transporter.sendMail(mailOptions);
};

// src/utils/email.ts

// ... (keep the existing transporter and sendEmail function)

export const generateVerificationEmailHtml = (name: string, verificationUrl: string) => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email Verification</title>
    </head>
    <body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f4;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <tr>
                <td style="padding: 40px; text-align: center;">
                    <h1 style="color: #333333; margin-bottom: 24px;">Welcome to AI Classroom!</h1>
                    <p style="color: #555555; font-size: 16px; line-height: 1.5;">
                        Hi ${name},
                    </p>
                    <p style="color: #555555; font-size: 16px; line-height: 1.5;">
                        Thank you for registering. Please click the button below to verify your email address and complete your registration.
                    </p>
                    <a href="${verificationUrl}"
                       style="display: inline-block; padding: 12px 24px; margin: 20px 0; font-size: 16px; color: #ffffff; background-color: #007bff; text-decoration: none; border-radius: 5px;">
                        Verify Email Address
                    </a>
                    <p style="color: #777777; font-size: 14px;">
                        If you did not create this account, you can safely ignore this email.
                    </p>
                </td>
            </tr>
        </table>
    </body>
    </html>
  `;
};