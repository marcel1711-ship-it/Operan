import { supabase } from '@/lib/supabase';

export type StatusLabel = {
  id: string;
  status_key: string;
  display_label: string;
  description: string | null;
  color: string;
  is_visible_to_customer: boolean;
  sort_order: number;
};

const DEFAULT_LABELS: Record<string, { display_label: string; color: string }> = {
  inquiry: { display_label: 'Inquiry', color: '#6b7280' },
  pending: { display_label: 'Pending', color: '#f59e0b' },
  awaiting_payment: { display_label: 'Awaiting Payment', color: '#3b82f6' },
  confirmed: { display_label: 'Confirmed', color: '#10b981' },
  in_progress: { display_label: 'In Progress', color: '#8b5cf6' },
  completed: { display_label: 'Completed', color: '#059669' },
  cancelled: { display_label: 'Cancelled', color: '#ef4444' },
  expired: { display_label: 'Expired', color: '#94a3b8' },
  no_show: { display_label: 'No Show', color: '#dc2626' },
};

export async function getStatusLabels(tenantId: string): Promise<StatusLabel[]> {
  const { data, error } = await supabase
    .from('reservation_status_labels')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('sort_order');

  if (error || !data) return [];
  return data as StatusLabel[];
}

export function getLabelForStatus(
  statusKey: string,
  labels: StatusLabel[]
): { display_label: string; color: string } {
  const found = labels.find(l => l.status_key === statusKey);
  if (found) return { display_label: found.display_label, color: found.color };
  return DEFAULT_LABELS[statusKey] || { display_label: statusKey, color: '#6b7280' };
}

export async function updateStatusLabel(
  tenantId: string,
  statusKey: string,
  updates: { display_label?: string; description?: string; color?: string; is_visible_to_customer?: boolean }
): Promise<boolean> {
  const { error } = await supabase
    .from('reservation_status_labels')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('status_key', statusKey);
  return !error;
}
