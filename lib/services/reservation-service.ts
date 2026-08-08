import { supabase } from '@/lib/supabase';
import type { Reservation } from '@/lib/types';
import { normalizeReservation, normalizeReservations, type NormalizedReservation } from '@/lib/reservation-utils';

/**
 * Reservation service — centralized data access and business logic
 * for reservation operations. All tenant-scoped queries filter by
 * tenant_id explicitly.
 */

export async function fetchReservationsByTenant(
  tenantId: string,
  opts?: { status?: string; search?: string; page?: number; pageSize?: number }
): Promise<{ data: NormalizedReservation[]; total: number }> {
  const page = opts?.page ?? 0;
  const pageSize = opts?.pageSize ?? 50;
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('reservations')
    .select('*, listing:listings(name)', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('start_at', { ascending: true, nullsFirst: false });

  if (opts?.status && opts.status !== 'all') {
    query = query.eq('booking_status', opts.status);
  }

  if (opts?.search) {
    const q = opts.search.trim();
    query = query.or(`client_name.ilike.%${q}%,client_email.ilike.%${q}%,vessel.ilike.%${q}%,booking_reference.ilike.%${q}%`);
  }

  const { data, error, count } = await query.range(from, to);
  if (error) throw new Error(error.message);

  return {
    data: normalizeReservations((data as Reservation[]) || []),
    total: count || 0,
  };
}

export async function fetchReservationById(
  tenantId: string,
  reservationId: string
): Promise<NormalizedReservation | null> {
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('id', reservationId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? normalizeReservation(data as Reservation) : null;
}

export async function fetchUpcomingReservations(
  tenantId: string,
  limit: number = 10
): Promise<NormalizedReservation[]> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('tenant_id', tenantId)
    .or(`start_at.gte.${now},charter_date.gte.${now}`)
    .not('booking_status', 'in', '("cancelled","expired","no_show")')
    .order('start_at', { ascending: true, nullsFirst: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return normalizeReservations((data as Reservation[]) || []);
}

export async function cancelReservation(
  reservationId: string,
  cancellationReason: string | null,
  actingUserId: string | null,
  actorName: string | null,
  targetCancelledStageId?: string | null
): Promise<{ success: boolean; error?: string }> {
  const params: Record<string, unknown> = {
    p_reservation_id: reservationId,
    p_cancellation_reason: cancellationReason,
    p_acting_user_id: actingUserId,
    p_actor_name: actorName,
  };
  if (targetCancelledStageId) {
    params.p_target_cancelled_stage_id = targetCancelledStageId;
  }

  const { data, error } = await supabase.rpc('cancel_reservation', params);
  if (error) return { success: false, error: error.message };

  const result = data as { error?: string; success?: boolean };
  if (result?.error) return { success: false, error: result.error };
  return { success: true };
}

export async function reactivateReservation(
  reservationId: string,
  actingUserId: string | null,
  actorName: string | null,
  targetStageId?: string | null
): Promise<{ success: boolean; error?: string }> {
  const params: Record<string, unknown> = {
    p_reservation_id: reservationId,
    p_acting_user_id: actingUserId,
    p_actor_name: actorName,
  };
  if (targetStageId) {
    params.p_target_stage_id = targetStageId;
  }

  const { data, error } = await supabase.rpc('reactivate_reservation', params);
  if (error) return { success: false, error: error.message };

  const result = data as { error?: string; success?: boolean };
  if (result?.error) return { success: false, error: result.error };
  return { success: true };
}

export type CreateReservationParams = {
  listingId: string;
  clientName: string;
  startAt: string;
  endAt: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
  guestCount?: number | null;
  totalAmount?: number;
  depositAmount?: number;
  source?: string;
  notes?: string | null;
  customerId?: string | null;
  opportunityId?: string | null;
  bookingStatus?: string;
  paymentStatus?: string;
  actingUserId?: string | null;
  actorName?: string | null;
};

export async function createReservation(
  params: CreateReservationParams
): Promise<{ success: boolean; reservationId?: string; bookingReference?: string; error?: string }> {
  const rpcParams: Record<string, unknown> = {
    p_listing_id: params.listingId,
    p_client_name: params.clientName,
    p_start_at: params.startAt,
    p_end_at: params.endAt,
    p_client_email: params.clientEmail ?? null,
    p_client_phone: params.clientPhone ?? null,
    p_guest_count: params.guestCount ?? null,
    p_total_amount: params.totalAmount ?? 0,
    p_deposit_amount: params.depositAmount ?? 0,
    p_source: params.source ?? 'manual',
    p_notes: params.notes ?? null,
    p_customer_id: params.customerId ?? null,
    p_opportunity_id: params.opportunityId ?? null,
    p_booking_status: params.bookingStatus ?? 'confirmed',
    p_payment_status: params.paymentStatus ?? 'unpaid',
    p_acting_user_id: params.actingUserId ?? null,
    p_actor_name: params.actorName ?? null,
  };

  const { data, error } = await supabase.rpc('create_manual_reservation', rpcParams);
  if (error) return { success: false, error: error.message };

  const result = data as { error?: string; success?: boolean; reservation_id?: string; booking_reference?: string };
  if (result?.error) return { success: false, error: result.error };
  return {
    success: true,
    reservationId: result.reservation_id,
    bookingReference: result.booking_reference,
  };
}
