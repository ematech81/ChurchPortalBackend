import { SubscriptionPlan, SubscriptionStatus } from './enums';

export interface IChurch {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  denomination?: string;
  phone?: string;
  email?: string;
  website?: string;
  settings: Record<string, unknown>;
  subscriptionPlan?: SubscriptionPlan;
  subscriptionStatus?: SubscriptionStatus;
  trialEndsAt?: string;
  isActive: boolean;
  createdAt: string;
}
