import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { toInternationalDigits } from '../../../common/utils/phone';

/**
 * SMS delivery through BulkSMS Nigeria (v2 API).
 *   POST {BULKSMS_BASE_URL}/sms   Authorization: Bearer <token>   { from, to, body }
 *   success → { status: 'success', data: { message_id } }
 *   failure → { status: 'error', code: 'BSNG-xxxx', error: { message } }
 *
 * This is the promotional route: carriers filter all-numeric "OTP-looking" messages, which is
 * why login codes sent through here are alphanumeric (see AuthService).
 */
@Injectable()
export class BulkSmsProvider {
  private readonly logger = new Logger(BulkSmsProvider.name);

  constructor(private readonly config: ConfigService) {}

  get isConfigured(): boolean {
    // Hard stop: automated tests must never be able to spend SMS credit or text real people.
    if (process.env.NODE_ENV === 'test') return false;
    return (
      this.config.get<string>('app.smsProvider') === 'bulksms' &&
      !!this.config.get('app.bulksmsApiToken') &&
      !!this.config.get('app.bulksmsSenderId')
    );
  }

  /** Returns the provider's message id. Throws ServiceUnavailable on any failure. */
  async sendSms(to: string, message: string): Promise<string> {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException('SMS gateway is not configured.');
    }
    try {
      const { data } = await axios.post(
        `${this.config.get<string>('app.bulksmsBaseUrl')}/sms`,
        {
          from: this.config.get<string>('app.bulksmsSenderId'),
          to: toInternationalDigits(to), // digits only, e.g. 2348031234567
          body: message,
        },
        {
          headers: {
            Authorization: `Bearer ${this.config.get<string>('app.bulksmsApiToken')}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          timeout: 15000,
        },
      );
      if (data?.status !== 'success') {
        throw new Error(`BulkSMS: ${data?.code ?? 'unknown'} ${data?.error?.message ?? data?.message ?? ''}`.trim());
      }
      return data?.data?.message_id as string;
    } catch (err: any) {
      // Log the gateway's reason, never the request (it carries the API token).
      const reason = err?.response?.data
        ? `${err.response.data.code ?? ''} ${err.response.data.error?.message ?? err.response.data.message ?? ''}`.trim()
        : err?.message;
      this.logger.error(`BulkSMS send failed: ${reason}`);
      // The reason (e.g. "Insufficient balance", "Sender ID not approved") is safe to show to church
      // admins and is exactly what they need to fix the problem. It never contains credentials.
      throw new ServiceUnavailableException(
        reason ? `SMS gateway: ${reason}`.slice(0, 200) : 'Could not send the message right now.',
      );
    }
  }
}
