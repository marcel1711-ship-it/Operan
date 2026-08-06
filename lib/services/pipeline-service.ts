import { supabase } from '@/lib/supabase';
import type { Pipeline, PipelineStage } from '@/lib/types';

/**
 * Pipeline service — centralized data access for pipelines and stages.
 */

export async function fetchPipelinesByTenant(tenantId: string): Promise<Pipeline[]> {
  const { data, error } = await supabase
    .from('pipelines')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('is_default', { ascending: false });

  if (error) throw new Error(error.message);
  return (data as Pipeline[]) || [];
}

export async function fetchDefaultPipeline(tenantId: string): Promise<Pipeline | null> {
  const { data, error } = await supabase
    .from('pipelines')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_default', true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as Pipeline) || null;
}

export async function fetchStagesByPipeline(pipelineId: string): Promise<PipelineStage[]> {
  const { data, error } = await supabase
    .from('pipeline_stages')
    .select('*')
    .eq('pipeline_id', pipelineId)
    .eq('is_active', true)
    .is('archived_at', null)
    .order('stage_order', { ascending: true });

  if (error) throw new Error(error.message);
  return (data as PipelineStage[]) || [];
}

export async function fetchStagesByTenant(tenantId: string): Promise<PipelineStage[]> {
  const { data, error } = await supabase
    .from('pipeline_stages')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .is('archived_at', null)
    .order('stage_order', { ascending: true });

  if (error) throw new Error(error.message);
  return (data as PipelineStage[]) || [];
}

export async function createPipeline(
  tenantId: string,
  name: string,
  description?: string | null
): Promise<Pipeline | null> {
  const { data, error } = await supabase
    .from('pipelines')
    .insert({
      tenant_id: tenantId,
      name,
      description: description || null,
      is_default: false,
      is_active: true,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as Pipeline;
}

export async function setDefaultPipeline(
  tenantId: string,
  pipelineId: string
): Promise<{ success: boolean; error?: string }> {
  const { error: clearErr } = await supabase
    .from('pipelines')
    .update({ is_default: false })
    .eq('tenant_id', tenantId)
    .neq('id', pipelineId);

  if (clearErr) return { success: false, error: clearErr.message };

  const { error: setErr } = await supabase
    .from('pipelines')
    .update({ is_default: true })
    .eq('id', pipelineId)
    .eq('tenant_id', tenantId);

  if (setErr) return { success: false, error: setErr.message };
  return { success: true };
}

export async function addStage(
  tenantId: string,
  pipelineId: string,
  name: string,
  stageType: string,
  color: string,
  stageOrder: number
): Promise<PipelineStage | null> {
  const systemKeyMap: Record<string, string> = {
    open: 'new_booking',
    ready: 'ready_for_operation',
    in_progress: 'service_started',
    completed: 'service_completed',
    cancelled: 'cancelled',
    won: 'won',
    lost: 'lost',
    custom: 'custom',
  };

  const { data, error } = await supabase
    .from('pipeline_stages')
    .insert({
      tenant_id: tenantId,
      pipeline_id: pipelineId,
      name,
      system_key: systemKeyMap[stageType] || 'custom',
      stage_type: stageType,
      stage_order: stageOrder,
      color,
      is_active: true,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as PipelineStage;
}

export async function archiveStage(
  tenantId: string,
  stageId: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('pipeline_stages')
    .update({
      archived_at: new Date().toISOString(),
      is_active: false,
    })
    .eq('id', stageId)
    .eq('tenant_id', tenantId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
