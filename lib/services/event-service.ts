import { supabase } from '@/lib/supabase';

export type DomainEventInput = {
  tenant_id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  payload?: Record<string, unknown>;
  reservation_id?: string;
  customer_id?: string;
  opportunity_id?: string;
  payment_id?: string;
  idempotency_key?: string;
  causation_id?: string;
};

export async function emitEvent(params: DomainEventInput): Promise<string | null> {
  const { data, error } = await supabase.rpc('emit_domain_event', {
    p_tenant_id: params.tenant_id,
    p_event_type: params.event_type,
    p_entity_type: params.entity_type,
    p_entity_id: params.entity_id,
    p_payload: params.payload || {},
    p_reservation_id: params.reservation_id || null,
    p_customer_id: params.customer_id || null,
    p_opportunity_id: params.opportunity_id || null,
    p_payment_id: params.payment_id || null,
    p_idempotency_key: params.idempotency_key || null,
    p_causation_id: params.causation_id || null,
  });

  if (error || !data) return null;
  return data as string;
}

export async function emitOutbox(
  tenantId: string,
  domainEventId: string,
  topic: string,
  payload?: Record<string, unknown>
): Promise<string | null> {
  const { data, error } = await supabase.rpc('emit_outbox_entry', {
    p_tenant_id: tenantId,
    p_domain_event_id: domainEventId,
    p_topic: topic,
    p_payload: payload || {},
  });

  if (error || !data) return null;
  return data as string;
}

export async function fetchReservationTimeline(reservationId: string): Promise<{
  events: TimelineEntry[];
  activities: TimelineEntry[];
  payments: TimelineEntry[];
}> {
  const { data, error } = await supabase.rpc('get_reservation_timeline', {
    p_reservation_id: reservationId,
  });

  if (error || !data) return { events: [], activities: [], payments: [] };
  return data as { events: TimelineEntry[]; activities: TimelineEntry[]; payments: TimelineEntry[] };
}

export type TimelineEntry = {
  id: string;
  event_type?: string;
  action?: string;
  entity_type?: string;
  occurred_at?: string;
  created_at?: string;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  actor_name?: string;
  amount?: number;
  currency?: string;
  status?: string;
  payment_type?: string;
  provider?: string;
  provider_payment_id?: string;
  paid_at?: string;
  failed_at?: string;
  failure_reason?: string;
  refunded_amount?: number;
  source: string;
};
