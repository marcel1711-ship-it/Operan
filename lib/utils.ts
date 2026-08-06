import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns the canonical application base URL.
 * Uses NEXT_PUBLIC_APP_URL in production/staging.
 * Falls back to window.location.origin on the client, or http://localhost:3000 on the server.
 */
export function getAppUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return 'http://localhost:3000';
}

/**
 * Builds a public listing URL: /r/{tenantSlug}/{listingSlug}
 */
export function buildListingUrl(tenantSlug: string, listingSlug: string): string {
  return `${getAppUrl()}/r/${tenantSlug}/${listingSlug}`;
}

/**
 * Builds a public tenant URL: /r/{tenantSlug}
 */
export function buildTenantUrl(tenantSlug: string): string {
  return `${getAppUrl()}/r/${tenantSlug}`;
}

/**
 * Builds a public waiver URL: /w/{tenantSlug}/{waiverSlug}
 */
export function buildWaiverUrl(tenantSlug: string, waiverSlug: string): string {
  return `${getAppUrl()}/w/${tenantSlug}/${waiverSlug}`;
}

/**
 * Builds a direct booking URL: /booking/{tenantSlug}/{listingSlug}
 */
export function buildBookingUrl(tenantSlug: string, listingSlug: string): string {
  return `${getAppUrl()}/booking/${tenantSlug}/${listingSlug}`;
}

/**
 * Builds an embeddable booking URL: /booking/{tenantSlug}/{listingSlug}?embed=1
 */
export function buildEmbedBookingUrl(tenantSlug: string, listingSlug: string): string {
  return `${getAppUrl()}/booking/${tenantSlug}/${listingSlug}?embed=1`;
}
