import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { toInternationalDigits } from '../../../common/utils/phone';

@Injectable()
export class TermiiProvider {
  private readonly logger = new Logger(TermiiProvider.name);

  constructor(private readonly config: ConfigService) {}

  get isConfigured(): boolean {
    return !!(this.config.get('app.termiiApiKey') && this.config.get('app.termiiSenderId'));
  }

  private async send(to: string, message: string, channel: 'generic' | 'whatsapp'): Promise<string> {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException('SMS gateway is not configured.');
    }
    try {
      const { data } = await axios.post(
        `${this.config.get('app.termiiBaseUrl')}/sms/send`,
        {
          to: toInternationalDigits(to), // Termii wants digits only, e.g. 2348031234567
          from: this.config.get('app.termiiSenderId'),
          sms: message,
          type: 'plain',
          api_key: this.config.get('app.termiiApiKey'),
          channel,
        },
        { timeout: 10000 },
      );
      return data.message_id;
    } catch (err: any) {
      // Log the gateway's reason, but never the request (it contains the API key).
      this.logger.error(`Termii ${channel} send failed: ${JSON.stringify(err?.response?.data ?? err?.message)}`);
      throw new ServiceUnavailableException('Could not send the message right now.');
    }
  }

  sendSms(to: string, message: string): Promise<string> {
    return this.send(to, message, 'generic');
  }

  sendWhatsApp(to: string, message: string): Promise<string> {
    return this.send(to, message, 'whatsapp');
  }
}
