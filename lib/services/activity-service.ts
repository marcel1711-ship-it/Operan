import { supabase } from '@/lib/supabase';

/**
 * Activity service — centralized activity logging.
 * In most cases, activity logging is handled by the RPC functions
 * (cancel_reservation, reactivate_reservation, move_opportunity_stage).
 * This service provides a fallback for manual logging.
 */

export async function logActivity(
  tenantId: string,
  entityType: string,
  entityId: string | null,
  action: string,
  actorUserId?: string | null,
  actorName?: string | null,
  metadata?: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.from('activity_log').insert({
    tenant_id: tenantId,
    entity_type: entityType,
    entity_id: entityId,
    action,
    actor_user_id: actorUserId,
    actor_name: actorName,
    metadata: metadata || {},
  });

  if (error) console.error('Failed to log activity:', error.message);
}
