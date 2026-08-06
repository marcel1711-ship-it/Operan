import { supabase } from '@/lib/supabase';

export type TimelineItem = {
  id: string;
  type: 'event' | 'activity' | 'payment';
  label: string;
  description: string;
  timestamp: string;
  actor: string;
  amount?: number;
  currency?: string;
  status?: string;
  source: string;
};

const EVENT_LABELS: Record<string, { label: string; description: string }> = {
  'reservation.created': { label: 'Booking Created', description: 'Reservation was created' },
  'reservation.hold_created': { label: 'Booking Hold Created', description: 'A temporary hold was placed on this booking' },
  'reservation.requested': { label: 'Booking Requested', description: 'Booking request was submitted' },
  'reservation.confirmed': { label: 'Reservation Confirmed', description: 'Reservation was confirmed' },
  'reservation.cancelled': { label: 'Reservation Cancelled', description: 'Reservation was cancelled' },
  'reservation.expired': { label: 'Reservation Expired', description: 'Booking hold expired without payment' },
  'reservation.reactivated': { label: 'Reservation Reactivated', description: 'Reservation was reactivated' },
  'reservation.rescheduled': { label: 'Reservation Rescheduled', description: 'Reservation was rescheduled' },
  'reservation.started': { label: 'Reservation Started', description: 'Service has started' },
  'reservation.completed': { label: 'Reservation Completed', description: 'Service has been completed' },
  'payment.checkout_created': { label: 'Checkout Created', description: 'Payment checkout session was created' },
  'payment.processing': { label: 'Payment Processing', description: 'Payment is being processed' },
  'payment.succeeded': { label: 'Payment Received', description: 'Payment was successfully received' },
  'payment.failed': { label: 'Payment Failed', description: 'Payment attempt failed' },
  'payment.refund_requested': { label: 'Refund Requested', description: 'A refund was requested' },
  'payment.partially_refunded': { label: 'Partial Refund', description: 'A partial refund was processed' },
  'payment.refunded': { label: 'Refund Completed', description: 'A full refund was processed' },
  'opportunity.created': { label: 'Opportunity Created', description: 'A pipeline opportunity was created' },
  'opportunity.stage_changed': { label: 'Stage Changed', description: 'Opportunity moved to a new pipeline stage' },
  'waiver.signed': { label: 'Waiver Signed', description: 'A waiver was signed' },
  'customer.created': { label: 'Customer Created', description: 'A new customer was created' },
};

const ACTIVITY_LABELS: Record<string, string> = {
  created: 'Booking Created',
  approved: 'Booking Approved',
  checkout_created: 'Checkout Created',
  payment_succeeded: 'Payment Received',
  payment_failed: 'Payment Failed',
  reservation_confirmed: 'Reservation Confirmed',
  reservation_cancelled: 'Reservation Cancelled',
  refund_processed: 'Refund Processed',
  declined: 'Booking Declined',
  reactivated: 'Reservation Reactivated',
};

export async function getReservationTimeline(reservationId: string): Promise<TimelineItem[]> {
  const { data, error } = await supabase.rpc('get_reservation_timeline', {
    p_reservation_id: reservationId,
  });

  if (error || !data) return [];

  const items: TimelineItem[] = [];

  // Process domain events
  for (const evt of (data.events || []) as any[]) {
    const labelCfg = EVENT_LABELS[evt.event_type] || { label: evt.event_type, description: '' };
    const payload = evt.payload || {};
    items.push({
      id: evt.id,
      type: 'event',
      label: labelCfg.label,
      description: labelCfg.description,
      timestamp: evt.occurred_at,
      actor: 'system',
      amount: payload.amount ? Number(payload.amount) : undefined,
      currency: payload.currency ? String(payload.currency) : undefined,
      status: payload.payment_status ? String(payload.payment_status) : undefined,
      source: 'event',
    });
  }

  // Process activity logs
  for (const act of (data.activities || []) as any[]) {
    items.push({
      id: act.id,
      type: 'activity',
      label: ACTIVITY_LABELS[act.action] || act.action,
      description: '',
      timestamp: act.created_at,
      actor: act.actor_name || 'system',
      source: 'activity',
    });
  }

  // Process payments
  for (const pmt of (data.payments || []) as any[]) {
    items.push({
      id: pmt.id,
      type: 'payment',
      label: `${pmt.payment_type === 'full_payment' ? 'Full Payment' : 'Deposit'} — ${pmt.status}`,
      description: pmt.failure_reason || '',
      timestamp: pmt.paid_at || pmt.failed_at || pmt.created_at,
      actor: pmt.provider,
      amount: Number(pmt.amount),
      currency: pmt.currency,
      status: pmt.status,
      source: 'payment',
    });
  }

  // Sort by timestamp descending
  items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return items;
}
