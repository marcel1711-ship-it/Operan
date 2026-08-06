import type { Reservation } from '@/lib/types';

/**
 * Normalizes a reservation record by preferring modern columns
 * over legacy GHL columns. This is the single place where legacy
 * fallback mapping occurs — all components should use the output
 * of this function rather than accessing legacy fields directly.
 *
 * Legacy fields still present: charter_date, charter_end, vessel,
 * status, monetary_value, notes, ghl_opportunity_id, ghl_stage_id,
 * ghl_contact_id
 *
 * Conditions for future removal:
 * - All reservations have non-null start_at and end_at
 * - All reservations have non-null booking_status (not 'status')
 * - All reservations have total_amount populated
 * - No active code references charter_date, charter_end, vessel, status
 */

export type NormalizedReservation = {
  id: string;
  tenant_id: string;
  listing_id: string | null;
  customer_id: string | null;
  opportunity_id: string | null;
  booking_reference: string | null;
  source: string;
  title: string;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  start_at: string | null;
  end_at: string | null;
  timezone: string;
  duration_minutes: number | null;
  guest_count: number | null;
  total_amount: number;
  deposit_amount: number;
  amount_paid: number;
  balance_due: number;
  currency: string;
  booking_status: string;
  payment_status: string;
  expires_at: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  vessel: string | null;
  customer?: unknown;
  listing?: unknown;
};

export function normalizeReservation(r: Reservation): NormalizedReservation {
  return {
    id: r.id,
    tenant_id: r.tenant_id,
    listing_id: r.listing_id,
    customer_id: r.customer_id,
    opportunity_id: r.opportunity_id,
    booking_reference: r.booking_reference,
    source: r.source,
    title: r.title || (r as Record<string, unknown>).vessel as string || r.client_name,
    client_name: r.client_name,
    client_email: r.client_email,
    client_phone: r.client_phone,
    start_at: r.start_at || r.charter_date,
    end_at: r.end_at || r.charter_end,
    timezone: r.timezone || 'America/New_York',
    duration_minutes: r.duration_minutes,
    guest_count: r.guest_count,
    total_amount: r.total_amount || r.monetary_value || 0,
    deposit_amount: r.deposit_amount || 0,
    amount_paid: r.amount_paid || 0,
    balance_due: r.balance_due || 0,
    currency: r.currency || 'USD',
    booking_status: r.booking_status || r.status || 'confirmed',
    payment_status: r.payment_status || 'unpaid',
    expires_at: r.expires_at,
    confirmed_at: r.confirmed_at,
    cancelled_at: r.cancelled_at,
    cancellation_reason: r.cancellation_reason,
    completed_at: r.completed_at,
    created_at: r.created_at,
    updated_at: r.updated_at,
    vessel: r.vessel || r.title || null,
    customer: (r as Record<string, unknown>).customer,
    listing: (r as Record<string, unknown>).listing,
  };
}

export function normalizeReservations(reservations: Reservation[]): NormalizedReservation[] {
  return reservations.map(normalizeReservation);
}

export function getReservationStartDate(r: Reservation | NormalizedReservation): Date | null {
  const iso = r.start_at || (r as Record<string, unknown>).charter_date as string | null;
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function getReservationEndDate(r: Reservation | NormalizedReservation): Date | null {
  const iso = r.end_at || (r as Record<string, unknown>).charter_end as string | null;
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function getReservationVessel(r: Reservation | NormalizedReservation): string | null {
  return r.vessel || r.title || null;
}
