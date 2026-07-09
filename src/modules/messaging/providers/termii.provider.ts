import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class TermiiProvider {
  private readonly logger = new Logger(TermiiProvider.name);

  constructor(private readonly config: ConfigService) {}

  async sendSms(to: string, message: string): Promise<string> {
    const { data } = await axios.post(
      `${this.config.get('TERMII_BASE_URL')}/sms/send`,
      {
        to,
        from: this.config.get('TERMII_SENDER_ID'),
        sms: message,
        type: 'plain',
        api_key: this.config.get('TERMII_API_KEY'),
        channel: 'generic',
      },
    );
    return data.message_id;
  }

  async sendWhatsApp(to: string, message: string): Promise<string> {
    const { data } = await axios.post(
      `${this.config.get('TERMII_BASE_URL')}/sms/send`,
      {
        to,
        from: this.config.get('TERMII_SENDER_ID'),
        sms: message,
        type: 'plain',
        api_key: this.config.get('TERMII_API_KEY'),
        channel: 'whatsapp',
      },
    );
    return data.message_id;
  }
}
