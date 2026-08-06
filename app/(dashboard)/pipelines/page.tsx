'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2, GitBranch, Plus, Save, Trash2, GripVertical,
  ChevronUp, ChevronDown, Check, AlertCircle, Archive,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { Pipeline, PipelineStage, PipelineStageType } from '@/lib/types';

const STAGE_TYPES: { value: PipelineStageType; label: string; color: string }[] = [
  { value: 'open', label: 'Open', color: '#3b82f6' },
  { value: 'ready', label: 'Ready', color: '#f59e0b' },
  { value: 'in_progress', label: 'In Progress', color: '#8b5cf6' },
  { value: 'completed', label: 'Completed', color: '#10b981' },
  { value: 'cancelled', label: 'Cancelled', color: '#ef4444' },
  { value: 'won', label: 'Won', color: '#10b981' },
  { value: 'lost', label: 'Lost', color: '#ef4444' },
  { value: 'custom', label: 'Custom', color: '#6b7280' },
];

const SYSTEM_KEY_MAP: Record<string, string> = {
  open: 'new_booking',
  ready: 'ready_for_operation',
  in_progress: 'service_started',
  completed: 'service_completed',
  cancelled: 'cancelled',
  won: 'won',
  lost: 'lost',
  custom: 'custom',
};

export default function PipelinesPage() {
  const router = useRouter();
  const { user, role, tenant, loading: authLoading } = useAuth();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stagesByPipeline, setStagesByPipeline] = useState<Record<string, PipelineStage[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const load = useCallback(async (tenantId: string) => {
    setLoading(true);
    setError(null);
    const [{ data: pRes, error: pErr }, { data: sRes, error: sErr }] = await Promise.all([
      supabase
        .from('pipelines')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('is_default', { ascending: false }),
      supabase
        .from('pipeline_stages')
        .select('*')
        .eq('tenant_id', tenantId)
        .is('archived_at', null)
        .order('stage_order', { ascending: true }),
    ]);
    if (pErr || sErr) {
      setError(pErr?.message || sErr?.message || 'Failed to load');
    } else {
      const pList = (pRes as Pipeline[]) || [];
      const sList = (sRes as PipelineStage[]) || [];
      const map: Record<string, PipelineStage[]> = {};
      for (const s of sList) {
        if (!map[s.pipeline_id]) map[s.pipeline_id] = [];
        map[s.pipeline_id].push(s);
      }
      setPipelines(pList);
      setStagesByPipeline(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authLoading) {
      if (!user) { router.push('/login'); return; }
      if (role === 'super_admin') { router.push('/super-admin'); return; }
      if (tenant) load(tenant.id);
    }
  }, [authLoading, user, role, tenant, router, load]);

  async function createPipeline() {
    if (!tenant?.id || !newName.trim()) return;
    setSaving(true);
    setError(null);
    const isFirst = pipelines.length === 0;
    const { data, error: err } = await supabase
      .from('pipelines')
      .insert({
        tenant_id: tenant.id,
        name: newName.trim(),
        description: newDesc.trim() || null,
        is_default: isFirst,
        is_active: true,
      })
      .select()
      .single();
    if (err) {
      setError(err.message);
      setSaving(false);
      return;
    }
    const newPipeline = data as Pipeline;
    setPipelines([...pipelines, newPipeline]);
    setStagesByPipeline({ ...stagesByPipeline, [newPipeline.id]: [] });
    setShowCreate(false);
    setNewName('');
    setNewDesc('');
    setSaving(false);
  }

  async function updateStageName(stageId: string, name: string) {
    if (!tenant?.id) return;
    const { error: err } = await supabase
      .from('pipeline_stages')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', stageId)
      .eq('tenant_id', tenant.id);
    if (err) setError(err.message);
  }

  async function updateStageColor(stageId: string, color: string) {
    if (!tenant?.id) return;
    const { error: err } = await supabase
      .from('pipeline_stages')
      .update({ color, updated_at: new Date().toISOString() })
      .eq('id', stageId)
      .eq('tenant_id', tenant.id);
    if (err) setError(err.message);
  }

  async function updateStageType(stageId: string, stageType: PipelineStageType) {
    if (!tenant?.id) return;
    const systemKey = SYSTEM_KEY_MAP[stageType] || 'custom';
    const { error: err } = await supabase
      .from('pipeline_stages')
      .update({ stage_type: stageType, system_key: systemKey, updated_at: new Date().toISOString() })
      .eq('id', stageId)
      .eq('tenant_id', tenant.id);
    if (err) setError(err.message);
  }

  async function addStage(pipelineId: string) {
    if (!tenant?.id) return;
    const existing = stagesByPipeline[pipelineId] || [];
    const { data, error: err } = await supabase
      .from('pipeline_stages')
      .insert({
        tenant_id: tenant.id,
        pipeline_id: pipelineId,
        name: 'New Stage',
        system_key: 'custom',
        stage_type: 'custom',
        stage_order: existing.length,
        color: '#6b7280',
        is_active: true,
      })
      .select()
      .single();
    if (err) {
      setError(err.message);
      return;
    }
    const newStage = data as PipelineStage;
    setStagesByPipeline({
      ...stagesByPipeline,
      [pipelineId]: [...(stagesByPipeline[pipelineId] || []), newStage],
    });
  }

  async function moveStage(pipelineId: string, stageId: string, direction: 'up' | 'down') {
    const stages = stagesByPipeline[pipelineId] || [];
    const idx = stages.findIndex((s) => s.id === stageId);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= stages.length) return;

    const updated = [...stages];
    [updated[idx], updated[targetIdx]] = [updated[targetIdx], updated[idx]];

    updated[idx].stage_order = idx;
    updated[targetIdx].stage_order = targetIdx;

    setStagesByPipeline({ ...stagesByPipeline, [pipelineId]: updated });

    const updates = [
      supabase.from('pipeline_stages').update({ stage_order: idx, updated_at: new Date().toISOString() }).eq('id', updated[idx].id).eq('tenant_id', tenant!.id),
      supabase.from('pipeline_stages').update({ stage_order: targetIdx, updated_at: new Date().toISOString() }).eq('id', updated[targetIdx].id).eq('tenant_id', tenant!.id),
    ];
    await Promise.all(updates);
  }

  async function archiveStage(pipelineId: string, stageId: string) {
    if (!confirm('Archive this stage? Opportunities in this stage will need to be reassigned.')) return;
    const { error: err } = await supabase
      .from('pipeline_stages')
      .update({ archived_at: new Date().toISOString(), is_active: false, updated_at: new Date().toISOString() })
      .eq('id', stageId)
      .eq('tenant_id', tenant!.id);
    if (err) {
      setError(err.message);
      return;
    }
    setStagesByPipeline({
      ...stagesByPipeline,
      [pipelineId]: (stagesByPipeline[pipelineId] || []).filter((s) => s.id !== stageId),
    });
  }

  async function setDefault(pipelineId: string) {
    if (!tenant?.id) return;
    setSaving(true);
    setError(null);

    await supabase
      .from('pipelines')
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenant.id)
      .neq('id', pipelineId);

    const { error: err } = await supabase
      .from('pipelines')
      .update({ is_default: true, updated_at: new Date().toISOString() })
      .eq('id', pipelineId)
      .eq('tenant_id', tenant.id);

    if (err) {
      setError(err.message);
    } else {
      setPipelines(pipelines.map((p) => ({ ...p, is_default: p.id === pipelineId })));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  async function renamePipeline(pipelineId: string, name: string) {
    if (!tenant?.id) return;
    const { error: err } = await supabase
      .from('pipelines')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', pipelineId)
      .eq('tenant_id', tenant.id);
    if (err) setError(err.message);
    else setPipelines(pipelines.map((p) => p.id === pipelineId ? { ...p, name } : p));
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (role !== 'tenant_admin') return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-[var(--card-bg)] px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-dark shadow-md shadow-teal/20">
              <GitBranch className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-foreground">Pipelines</h1>
              <p className="text-xs text-muted-foreground">Customize your sales pipeline and stages</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {saved && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-[#86EFAC]">
                <Check className="h-4 w-4" /> Saved
              </span>
            )}
            <Button onClick={() => setShowCreate(true)} className="bg-[var(--brand-primary)] text-primary-foreground hover:bg-primary/90">
              <Plus className="mr-2 h-4 w-4" /> New Pipeline
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        {error && (
          <div className="flex items-center gap-2 rounded-[18px] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-[#FB7185]">
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        )}

        {pipelines.map((pipeline) => {
          const stages = stagesByPipeline[pipeline.id] || [];
          return (
            <section key={pipeline.id} className="rounded-2xl border border-border bg-[var(--card-bg)] p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Input
                      defaultValue={pipeline.name}
                      onBlur={(e) => renamePipeline(pipeline.id, e.target.value)}
                      className="bg-[var(--card-bg)] text-base font-semibold border-0 px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                    {pipeline.is_default && (
                      <Badge className="bg-[rgba(99,119,255,0.10)] text-[var(--brand-primary)] border-primary/30">Default</Badge>
                    )}
                  </div>
                  {pipeline.description && (
                    <p className="text-xs text-muted-foreground px-0">{pipeline.description}</p>
                  )}
                </div>
                {!pipeline.is_default && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDefault(pipeline.id)}
                    disabled={saving}
                    className="border-border bg-[var(--card-bg)]"
                  >
                    Set as Default
                  </Button>
                )}
              </div>

              <div className="mt-5 space-y-2">
                {stages.map((stage, idx) => (
                  <div
                    key={stage.id}
                    className="flex items-center gap-2 rounded-lg border border-border bg-[var(--card-bg)] p-2"
                  >
                    <div className="flex flex-col">
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => moveStage(pipeline.id, stage.id, 'up')}
                        className="h-5 w-6 p-0"
                        disabled={idx === 0}
                      >
                        <ChevronUp className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => moveStage(pipeline.id, stage.id, 'down')}
                        className="h-5 w-6 p-0"
                        disabled={idx === stages.length - 1}
                      >
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </div>

                    <div className="h-8 w-2 rounded-full" style={{ backgroundColor: stage.color }} />

                    <Input
                      defaultValue={stage.name}
                      onBlur={(e) => updateStageName(stage.id, e.target.value)}
                      className="bg-[var(--card-bg)] flex-1 h-8 text-sm"
                    />

                    <Select
                      value={stage.stage_type}
                      onValueChange={(v) => updateStageType(stage.id, v as PipelineStageType)}
                    >
                      <SelectTrigger className="h-8 w-32 bg-[var(--card-bg)] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STAGE_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value} className="text-xs">
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <input
                      type="color"
                      value={stage.color}
                      onChange={(e) => updateStageColor(stage.id, e.target.value)}
                      className="h-8 w-8 rounded-lg border border-border cursor-pointer"
                    />

                    <Button
                      size="sm" variant="ghost"
                      onClick={() => archiveStage(pipeline.id, stage.id)}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}

                {stages.length === 0 && (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    No stages. Add one to get started.
                  </p>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addStage(pipeline.id)}
                  className="mt-2 border-border bg-[var(--card-bg)]"
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add Stage
                </Button>
              </div>
            </section>
          );
        })}

        {pipelines.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-[var(--card-bg)] py-20 shadow-sm">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary">
              <GitBranch className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="text-center">
              <h3 className="text-sm font-semibold text-foreground">No pipelines yet</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Create your first pipeline to start managing your sales process.
              </p>
            </div>
            <Button onClick={() => setShowCreate(true)} variant="outline" className="border-border bg-[var(--card-bg)]">
              <Plus className="mr-2 h-4 w-4" /> Create pipeline
            </Button>
          </div>
        )}
      </main>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Pipeline</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Pipeline Name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Charter Operations"
                className="bg-[var(--card-bg)]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Description (optional)</Label>
              <Textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Pipeline for booking operations"
                rows={2}
                className="resize-none bg-[var(--card-bg)]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} className="border-border bg-[var(--card-bg)]">
              Cancel
            </Button>
            <Button onClick={createPipeline} disabled={saving || !newName.trim()} className="bg-[var(--brand-primary)] text-primary-foreground hover:bg-primary/90">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
