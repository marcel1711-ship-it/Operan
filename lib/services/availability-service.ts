import { supabase } from '@/lib/supabase';

/**
 * Availability service — shared server-side availability validation.
 * Uses the check_listing_availability RPC for authoritative checks.
 */

export type AvailabilityResult = {
  available: boolean;
  error?: string;
  conflict_type?: string;
  conflict_id?: string;
  conflict_reference?: string;
};

export async function checkListingAvailability(
  listingId: string,
  startAt: string,
  endAt: string,
  reservationIdToExclude?: string | null,
  tenantId?: string
): Promise<AvailabilityResult> {
  const params: Record<string, unknown> = {
    p_listing_id: listingId,
    p_start_at: startAt,
    p_end_at: endAt,
  };
  if (reservationIdToExclude) {
    params.p_reservation_id_to_exclude = reservationIdToExclude;
  }
  if (tenantId) {
    params.p_tenant_id = tenantId;
  }

  const { data, error } = await supabase.rpc('check_listing_availability', params);
  if (error) {
    return { available: false, error: error.message };
  }

  return data as AvailabilityResult;
}
