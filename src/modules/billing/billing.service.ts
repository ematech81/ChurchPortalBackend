import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { SubscriptionPlan } from '@/types';
import { UsersService } from '../users/users.service';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly paystackBase = 'https://api.paystack.co';

  constructor(
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  private get headers() {
    const key = this.config.get<string>('PAYSTACK_SECRET_KEY');
    if (!key) throw new ServiceUnavailableException('Billing is not configured.');
    return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  }

  /**
   * Plan prices live on the server, set per environment as PLAN_PRICE_<PLAN>=<naira>
   * (e.g. PLAN_PRICE_GROWTH=15000). A plan with no price configured cannot be bought.
   */
  priceKoboFor(plan: SubscriptionPlan): number {
    const raw = this.config.get<string>(`PLAN_PRICE_${plan.toUpperCase()}`);
    const naira = raw ? Number(raw) : NaN;
    if (!Number.isFinite(naira) || naira <= 0) {
      throw new ServiceUnavailableException('This plan is not available for purchase yet.');
    }
    return Math.round(naira * 100);
  }

  async initializeForChurch(userId: string, churchId: string, plan: SubscriptionPlan) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    return this.initializeTransaction(user.email, this.priceKoboFor(plan), { plan, churchId, userId });
  }

  async initializeTransaction(email: string, amountKobo: number, metadata: Record<string, unknown>) {
    const { data } = await axios.post(
      `${this.paystackBase}/transaction/initialize`,
      { email, amount: amountKobo, metadata },
      { headers: this.headers, timeout: 15000 },
    );
    return data.data;
  }

  async verifyTransaction(reference: string) {
    const { data } = await axios.get(
      `${this.paystackBase}/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: this.headers, timeout: 15000 },
    );
    return data.data;
  }

  async createSubscription(customerCode: string, planCode: string) {
    const { data } = await axios.post(
      `${this.paystackBase}/subscription`,
      { customer: customerCode, plan: planCode },
      { headers: this.headers, timeout: 15000 },
    );
    return data.data;
  }
}
