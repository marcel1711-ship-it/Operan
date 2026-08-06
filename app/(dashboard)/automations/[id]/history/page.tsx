'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import {
  Zap, Loader2, ArrowLeft, Clock, CheckCircle2, XCircle,
  AlertCircle, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

type Run = {
  id: string;
  status: string;
  entity_type: string | null;
  entity_id: string | null;
  reservation_id: string | null;
  started_at: string;
  completed_at: string | null;
  failed_at: string | null;
  error_message: string | null;
  current_node_id: string | null;
};

type StepRun = {
  id: string;
  node_id: string;
  action_type: string;
  status: string;
  scheduled_for: string | null;
  started_at: string | null;
  completed_at: string | null;
  attempt_count: number;
  error_message: string | null;
  output: Record<string, unknown> | null;
};

const STATUS_STYLES: Record<string, string> = {
  running: 'text-[var(--brand-primary)] bg-[rgba(99,119,255,0.10)] border-primary/20',
  completed: 'text-[#86EFAC] bg-[rgba(74,222,128,0.12)] border-success/20',
  failed: 'text-[#FB7185] bg-[rgba(251,113,133,0.12)] border-destructive/20',
  cancelled: 'text-muted-foreground bg-secondary/30 border-border',
  pending: 'text-[#FCD34D] bg-[rgba(251,191,36,0.12)] border-warning/20',
  scheduled: 'text-accent bg-accent/10 border-accent/20',
  dead_letter: 'text-[#FB7185] bg-[rgba(251,113,133,0.12)] border-red-300',
  skipped: 'text-muted-foreground bg-secondary/30 border-border',
};

const STATUS_ICONS: Record<string, any> = {
  running: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
  cancelled: XCircle,
  pending: Clock,
  scheduled: Clock,
  dead_letter: AlertCircle,
  skipped: AlertCircle,
};

export default function WorkflowHistoryPage() {
  const params = useParams();
  const router = useRouter();
  const { user, role, tenant, loading: authLoading } = useAuth();
  const workflowId = params.id as string;

  const [workflow, setWorkflow] = useState<{ name: string; status: string } | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [stepRuns, setStepRuns] = useState<StepRun[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (tenantId: string) => {
    setLoading(true);
    const { data: wf } = await supabase
      .from('automation_workflows')
      .select('name, status')
      .eq('id', workflowId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (!wf) { router.push('/automations'); return; }
    setWorkflow(wf);

    const { data: runData } = await supabase
      .from('automation_runs')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (runData) setRuns(runData as Run[]);
    setLoading(false);
  }, [workflowId, router]);

  useEffect(() => {
    if (!authLoading) {
      if (!user) { router.push('/login'); return; }
      if (role === 'super_admin') { router.push('/super-admin'); return; }
      if (tenant) load(tenant.id);
    }
  }, [authLoading, user, role, tenant, router, load]);

  async function loadStepRuns(runId: string) {
    if (!tenant) return;
    const { data } = await supabase
      .from('automation_step_runs')
      .select('*')
      .eq('automation_run_id', runId)
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: true });
    if (data) setStepRuns(data as StepRun[]);
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (role !== 'tenant_admin' || !workflow) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-[var(--card-bg)] px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/automations/${workflowId}`)}>
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </button>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-dark shadow-md shadow-teal/20">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-foreground">{workflow.name}</h1>
            <p className="text-xs text-muted-foreground">Execution History</p>
          </div>
        </div>
      </header>

      <main className="px-4 py-6 sm:px-6 lg:px-8">
        {runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-[var(--card-bg)] py-20 shadow-sm">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary">
              <Clock className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No workflow runs yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Run list */}
            <div className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Runs</h2>
              {runs.map(run => {
                const Icon = STATUS_ICONS[run.status] || AlertCircle;
                return (
                  <button
                    key={run.id}
                    onClick={() => { setSelectedRun(run.id); loadStepRuns(run.id); }}
                    className={cn(
                      'w-full rounded-lg border p-3 text-left transition-all',
                      selectedRun === run.id ? 'border-primary bg-primary/5' : 'border-border bg-[var(--card-bg)] hover:border-[rgba(99,119,255,0.34)]'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className={cn('h-4 w-4', run.status === 'running' && 'animate-spin')} />
                        <span className="text-xs font-medium text-foreground">
                          {format(new Date(run.started_at), 'MMM d, HH:mm:ss')}
                        </span>
                      </div>
                      <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize', STATUS_STYLES[run.status] || STATUS_STYLES.pending)}>
                        {run.status}
                      </span>
                    </div>
                    {run.error_message && (
                      <p className="mt-1 text-[10px] text-[#FB7185] line-clamp-1">{run.error_message}</p>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Step runs detail */}
            <div className="lg:col-span-2">
              {selectedRun ? (
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Step Execution</h2>
                  <div className="space-y-2">
                    {stepRuns.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No step runs recorded</p>
                    ) : (
                      stepRuns.map((step, i) => {
                        const Icon = STATUS_ICONS[step.status] || AlertCircle;
                        return (
                          <div key={step.id} className="rounded-lg border border-border bg-[var(--card-bg)] p-3 shadow-sm">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border text-[10px] font-medium text-muted-foreground">
                                  {i + 1}
                                </span>
                                <Icon className={cn('h-4 w-4', step.status === 'running' && 'animate-spin')} />
                                <div>
                                  <p className="text-xs font-medium text-foreground">{step.action_type.replace(/_/g, ' ')}</p>
                                  <p className="text-[10px] text-muted-foreground">{step.node_id}</p>
                                </div>
                              </div>
                              <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize', STATUS_STYLES[step.status] || STATUS_STYLES.pending)}>
                                {step.status}
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                              {step.scheduled_for && (
                                <span>Scheduled: {format(new Date(step.scheduled_for), 'MMM d, HH:mm')}</span>
                              )}
                              {step.started_at && (
                                <span>Started: {format(new Date(step.started_at), 'HH:mm:ss')}</span>
                              )}
                              {step.completed_at && (
                                <span>Completed: {format(new Date(step.completed_at), 'HH:mm:ss')}</span>
                              )}
                              {step.attempt_count > 0 && (
                                <span>Attempts: {step.attempt_count}</span>
                              )}
                            </div>
                            {step.error_message && (
                              <p className="mt-1 text-[10px] text-[#FB7185]">{step.error_message}</p>
                            )}
                            {step.output && step.status === 'completed' && (
                              <div className="mt-2 rounded border border-border bg-secondary/20 p-2 text-[10px] text-muted-foreground">
                                <pre className="whitespace-pre-wrap">
                                  {JSON.stringify(step.output, null, 2).slice(0, 500)}
                                </pre>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Select a run to see step details
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
