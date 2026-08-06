import { supabase } from '@/lib/supabase';

export type NotificationType =
  | 'new_booking_request'
  | 'payment_received'
  | 'payment_failed'
  | 'reservation_confirmed'
  | 'reservation_cancelled'
  | 'refund_completed'
  | 'stripe_action_required'
  | 'stripe_payouts_disabled'
  | 'webhook_processing_failed'
  | 'system';

const NOTIFICATION_TITLES: Record<string, string> = {
  new_booking_request: 'New Booking Request',
  payment_received: 'Payment Received',
  payment_failed: 'Payment Failed',
  reservation_confirmed: 'Reservation Confirmed',
  reservation_cancelled: 'Reservation Cancelled',
  refund_completed: 'Refund Completed',
  stripe_action_required: 'Stripe Action Required',
  stripe_payouts_disabled: 'Stripe Payouts Disabled',
  webhook_processing_failed: 'Webhook Processing Failed',
  system: 'System Notification',
};

export async function createNotification(params: {
  tenant_id: string;
  type: string;
  title?: string;
  message?: string;
  entity_type?: string;
  entity_id?: string;
  user_id?: string;
  priority?: 'low' | 'normal' | 'high';
}): Promise<boolean> {
  const { error } = await supabase.from('notifications').insert({
    tenant_id: params.tenant_id,
    type: params.type,
    title: params.title || NOTIFICATION_TITLES[params.type] || 'Notification',
    message: params.message || '',
    entity_type: params.entity_type || 'reservation',
    entity_id: params.entity_id || null,
    user_id: params.user_id || null,
    priority: params.priority || 'normal',
  });

  return !error;
}

export async function fetchNotifications(tenantId: string, unreadOnly = false): Promise<any[]> {
  let query = supabase
    .from('notifications')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (unreadOnly) {
    query = query.is('read_at', null);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return data;
}

export async function markNotificationRead(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id);
  return !error;
}

export async function markAllNotificationsRead(tenantId: string): Promise<boolean> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .is('read_at', null);
  return !error;
}
