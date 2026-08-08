import { supabase } from '@/lib/supabase';
import type { Opportunity, PipelineStage } from '@/lib/types';

function mapOpportunity(row: Record<string, unknown>): Opportunity {
  return {
    ...row,
    name: (row.title || row.name || '') as string,
    monetary_value: (row.value ?? row.monetary_value ?? 0) as number,
    listing_id: (row.listing_id ?? null) as string | null,
    reservation_id: (row.reservation_id ?? null) as string | null,
    assigned_to: (row.assigned_to ?? null) as string | null,
    expected_service_date: (row.expected_service_date ?? null) as string | null,
    last_status_change_at: (row.last_status_change_at ?? null) as string | null,
    legacy_ghl_opportunity_id: (row.legacy_ghl_opportunity_id ?? null) as string | null,
  } as Opportunity;
}

export async function fetchOpportunitiesByPipeline(
  tenantId: string,
  pipelineId: string,
  opts?: { page?: number; pageSize?: number }
): Promise<{ data: Opportunity[]; total: number }> {
  const page = opts?.page ?? 0;
  const pageSize = opts?.pageSize ?? 200;
  const from = page * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('opportunities')
    .select('*, customer:customers(*)', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .eq('pipeline_id', pipelineId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);
  return { data: (data || []).map((d: Record<string, unknown>) => mapOpportunity(d)), total: count || 0 };
}

export async function fetchOpportunitiesByTenant(
  tenantId: string,
  opts?: { page?: number; pageSize?: number }
): Promise<{ data: Opportunity[]; total: number }> {
  const page = opts?.page ?? 0;
  const pageSize = opts?.pageSize ?? 200;
  const from = page * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('opportunities')
    .select('*, customer:customers(*)', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);
  return { data: (data || []).map((d: Record<string, unknown>) => mapOpportunity(d)), total: count || 0 };
}

export async function moveOpportunityStage(
  opportunityId: string,
  newStageId: string,
  actingUserId?: string | null,
  actorName?: string | null
): Promise<{ success: boolean; error?: string }> {
  const params: Record<string, unknown> = {
    p_opportunity_id: opportunityId,
    p_new_stage_id: newStageId,
  };
  if (actingUserId) params.p_actor_user_id = actingUserId;
  if (actorName) params.p_actor_name = actorName;

  const { data, error } = await supabase.rpc('move_opportunity_stage', params);
  if (error) return { success: false, error: error.message };

  const result = data as { error?: string; success?: boolean };
  if (result?.error) return { success: false, error: result.error };
  return { success: true };
}

export async function deleteOpportunity(
  tenantId: string,
  opportunityId: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('opportunities')
    .delete()
    .eq('id', opportunityId)
    .eq('tenant_id', tenantId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
