import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly paystackBase = 'https://api.paystack.co';

  constructor(private readonly config: ConfigService) {}

  private get headers() {
    return {
      Authorization: `Bearer ${this.config.get('PAYSTACK_SECRET_KEY')}`,
      'Content-Type': 'application/json',
    };
  }

  async initializeTransaction(email: string, amountKobo: number, metadata: Record<string, unknown>) {
    const { data } = await axios.post(
      `${this.paystackBase}/transaction/initialize`,
      { email, amount: amountKobo, metadata },
      { headers: this.headers },
    );
    return data.data;
  }

  async verifyTransaction(reference: string) {
    const { data } = await axios.get(
      `${this.paystackBase}/transaction/verify/${reference}`,
      { headers: this.headers },
    );
    return data.data;
  }

  async createSubscription(customerCode: string, planCode: string) {
    const { data } = await axios.post(
      `${this.paystackBase}/subscription`,
      { customer: customerCode, plan: planCode },
      { headers: this.headers },
    );
    return data.data;
  }
}
