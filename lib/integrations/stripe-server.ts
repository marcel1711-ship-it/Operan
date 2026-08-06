// Server-only Stripe client factory.
// This file must NEVER be imported from client-side code.
// Credentials are resolved in this order:
// 1. Platform Secrets Vault (database, AES-256-GCM encrypted)
// 2. Environment variable fallback (backward compatibility)

import type { Stripe } from 'stripe';
import { resolveCredential, hasCredential } from './credential-resolver';

let cachedClient: Stripe | null = null;
let cachedSecretKey: string | null = null;

async function resolveStripeSecretKey(): Promise<string | null> {
  // Try vault first — check both test and live environments
  const env = process.env.NODE_ENV === 'production' ? 'production' : 'test';
  let key = await resolveCredential('stripe', 'STRIPE_SECRET_KEY', env);
  if (!key) {
    // Fallback to the other environment
    key = await resolveCredential('stripe', 'STRIPE_SECRET_KEY', env === 'production' ? 'test' : 'production');
  }
  // Env fallback is built into resolveCredential
  return key;
}

export async function getStripeClientAsync(): Promise<Stripe | null> {
  const secretKey = await resolveStripeSecretKey();

  if (!secretKey) {
    return null;
  }

  if (cachedClient && cachedSecretKey === secretKey) {
    return cachedClient;
  }

  // Dynamically import to keep it out of client bundles
  // eslint-disable-next-line @typescript-eslint/no-require-require
  const Stripe = require('stripe');
  cachedClient = new Stripe(secretKey, {
    apiVersion: '2025-08-27.basil' as Stripe.LatestApiVersion,
    typescript: true,
    appInfo: {
      name: 'Charter Booking Platform',
      version: '1.0.0',
    },
  });
  cachedSecretKey = secretKey;
  return cachedClient;
}

// Synchronous version — uses env var only (for backward compat in routes that can't be async)
export function getStripeClient(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    return null;
  }

  if (cachedClient && cachedSecretKey === secretKey) {
    return cachedClient;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-require
  const Stripe = require('stripe');
  cachedClient = new Stripe(secretKey, {
    apiVersion: '2025-08-27.basil' as Stripe.LatestApiVersion,
    typescript: true,
    appInfo: {
      name: 'Charter Booking Platform',
      version: '1.0.0',
    },
  });
  cachedSecretKey = secretKey;
  return cachedClient;
}

export async function isStripeConfiguredAsync(): Promise<boolean> {
  return await hasCredential('stripe', 'STRIPE_SECRET_KEY', 'production') ||
         await hasCredential('stripe', 'STRIPE_SECRET_KEY', 'test');
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export async function getStripeWebhookSecretAsync(): Promise<string | null> {
  return await resolveCredential('stripe', 'STRIPE_WEBHOOK_SECRET', 'production') ||
         await resolveCredential('stripe', 'STRIPE_WEBHOOK_SECRET', 'test');
}

export function getStripeWebhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET || null;
}

export async function getStripePublishableKeyAsync(): Promise<string | null> {
  return await resolveCredential('stripe', 'STRIPE_PUBLISHABLE_KEY', 'production') ||
         await resolveCredential('stripe', 'STRIPE_PUBLISHABLE_KEY', 'test');
}

export function getStripePublishableKey(): string | null {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || null;
}

export function getStripeEnvironment(): 'test' | 'live' {
  const key = process.env.STRIPE_SECRET_KEY || '';
  return key.startsWith('sk_live') ? 'live' : 'test';
}

export function getAppBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
}
