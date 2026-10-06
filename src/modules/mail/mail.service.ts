import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  get isConfigured(): boolean {
    return !!this.config.get<string>('app.brevoApiKey') || !!this.config.get<boolean>('app.allowDevOtp');
  }

  async sendOtp(email: string, code: string): Promise<void> {
    // Hard stop: automated tests must never send real email.
    const apiKey = process.env.NODE_ENV === 'test' ? undefined : this.config.get<string>('app.brevoApiKey');

    if (!apiKey) {
      // Only ever print the code for local development — production logs are not a safe place for OTPs.
      if (this.config.get<boolean>('app.allowDevOtp')) {
        this.logger.warn(`[DEV] OTP for ${email}: ${code}  (set BREVO_API_KEY to send real emails)`);
        return;
      }
      throw new Error('Email delivery is not configured (BREVO_API_KEY missing).');
    }

    const from = this.config.get<string>('app.mailFrom', 'Kingdom Portal <noreply@kingdomportal.app>');
    const senderName = from.replace(/<.*>/, '').trim() || 'Kingdom Portal';
    const senderEmail = (from.match(/<(.+)>/) ?? [])[1] ?? 'noreply@kingdomportal.app';

    try {
      await axios.post(
        'https://api.brevo.com/v3/smtp/email',
        {
          sender: { name: senderName, email: senderEmail },
          to: [{ email }],
          subject: 'Your Kingdom Portal Verification Code',
          htmlContent: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#f9f9f9;border-radius:12px;">
              <h2 style="color:#120D2E;margin-bottom:8px;">Verify your email</h2>
              <p style="color:#555;margin-bottom:24px;">Enter the code below in the Kingdom Portal app to complete your registration.</p>
              <div style="background:#120D2E;border-radius:10px;padding:24px;text-align:center;margin-bottom:24px;">
                <span style="font-size:40px;font-weight:900;letter-spacing:16px;color:#F5C518;">${code}</span>
              </div>
              <p style="color:#888;font-size:13px;">This code expires in <strong>10 minutes</strong>. If you didn't request this, you can safely ignore this email.</p>
            </div>
          `,
        },
        {
          headers: {
            'api-key': apiKey,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );
      this.logger.log(`OTP sent to ${email} via ${senderEmail}`);
    } catch (err: any) {
      const detail = err?.response?.data ?? err?.message;
      this.logger.error(`Brevo rejected email to ${email}: ${JSON.stringify(detail)}`);
      throw new Error(`Email delivery failed: ${JSON.stringify(detail)}`);
    }
  }
}
