import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    const host = config.get<string>('app.smtpHost');
    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: config.get<number>('app.smtpPort', 587),
        secure: config.get<number>('app.smtpPort', 587) === 465,
        auth: {
          user: config.get<string>('app.smtpUser'),
          pass: config.get<string>('app.smtpPass'),
        },
      });
    }
  }

  async sendOtp(email: string, code: string): Promise<void> {
    const from = this.config.get<string>('app.mailFrom', 'Kingdom Portal <noreply@kingdomportal.app>');

    if (!this.transporter) {
      this.logger.warn(`[DEV] OTP for ${email}: ${code}  (configure SMTP_HOST to send real emails)`);
      return;
    }

    await this.transporter.sendMail({
      from,
      to: email,
      subject: 'Your Kingdom Portal Verification Code',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#f9f9f9;border-radius:12px;">
          <h2 style="color:#120D2E;margin-bottom:8px;">Verify your email</h2>
          <p style="color:#555;margin-bottom:24px;">Enter the code below in the Kingdom Portal app to complete your registration.</p>
          <div style="background:#120D2E;border-radius:10px;padding:24px;text-align:center;margin-bottom:24px;">
            <span style="font-size:40px;font-weight:900;letter-spacing:16px;color:#F5C518;">${code}</span>
          </div>
          <p style="color:#888;font-size:13px;">This code expires in <strong>10 minutes</strong>. If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    });
  }
}
