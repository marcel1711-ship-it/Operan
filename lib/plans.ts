export type PlanId = 'starter' | 'growth' | 'enterprise';

export type PlanConfig = {
  name: string;
  maxListings: number;
  price: number;
  features: string[];
};

export const PLANS: Record<PlanId, PlanConfig> = {
  starter: {
    name: 'Starter',
    maxListings: 3,
    price: 149,
    features: ['Email automations', 'Digital waivers', 'Stripe payments'],
  },
  growth: {
    name: 'Growth',
    maxListings: 10,
    price: 299,
    features: ['SMS & WhatsApp', 'Pipeline CRM', 'Captain panel', 'Priority support'],
  },
  enterprise: {
    name: 'Enterprise',
    maxListings: Infinity,
    price: 0,
    features: ['Unlimited vessels', 'API access', 'SSO', 'Dedicated account manager'],
  },
};

export function getPlanConfig(plan: string): PlanConfig {
  return PLANS[plan as PlanId] ?? PLANS.starter;
}

export function isTrialActive(trialEndsAt: string | null): boolean {
  if (!trialEndsAt) return false;
  return new Date(trialEndsAt) > new Date();
}

export function trialDaysRemaining(trialEndsAt: string | null): number {
  if (!trialEndsAt) return 0;
  const diff = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}
