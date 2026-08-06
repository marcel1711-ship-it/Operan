'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import {
  Zap, Loader2, Plus, Pause, Play, Copy, Archive, History,
  Clock, CheckCircle2, XCircle, AlertCircle, Mail, Server,
  RefreshCw, Activity, Inbox, AlertTriangle, ShieldCheck,
  ChevronRight, Send,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

type Workflow = {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_configuration: Record<string, unknown>;
  status: string;
  active_version: number | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type Metrics = {
  active_workflows: number;
  draft_workflows: number;
  paused_workflows: number;
  runs_today: number;
  completed_today: number;
  failed_runs_today: number;
  action_required_steps: number;
  dead_letter_steps: number;
  scheduled_steps: number;
  queued_messages: number;
  failed_messages: number;
  total_runs: number;
  total_completed: number;
  total_failed: number;
  needs_attention_workflows: number;
  disconnected_integrations: number;
  worker_stale: boolean;
};

type FailedRun = {
  id: string;
  workflow_id: string;
  workflow_name: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  entity_type: string | null;
  entity_id: string | null;
  reservation_id: string | null;
  customer_id: string | null;
};

type DeadLetterStep = {
  id: string;
  node_id: string;
  action_type: string;
  status: string;
  error_message: string | null;
  attempt_count: number;
  created_at: string;
  automation_run_id: string;
  workflow_name: string;
};

type Integration = {
  id: string;
  provider: string;
  channel: string;
  connection_status: string;
  enabled: boolean;
  capabilities: Record<string, boolean> | null;
};

type WorkerLog = {
  id: string;
  worker_name: string;
  invoked_at: string;
  success: boolean;
  processed_count: number;
  failed_count: number;
  dead_letter_count: number;
  duration_ms: number | null;
  error_message: string | null;
};

type MessageLog = {
  id: string;
  channel: string;
  provider: string;
  status: string;
  recipient: string;
  queued_at: string | null;
  sent_at: string | null;
  template_name: string | null;
};

type Template = {
  id: string;
  name: string;
  channel: string;
  category: string;
  is_active: boolean;
  subject: string | null;
};

type Tab = 'workflows' | 'history' | 'failed' | 'dead_letter' | 'templates' | 'messages' | 'integrations' | 'workers';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-secondary/30 text-muted-foreground border-border',
  active: 'bg-[rgba(74,222,128,0.12)] text-[#86EFAC] border-success/20',
  paused: 'bg-[rgba(251,191,36,0.12)] text-[#FCD34D] border-warning/20',
  archived: 'bg-[rgba(251,113,133,0.12)] text-[#FB7185] border-destructive/20',
};

const TRIGGER_LABELS: Record<string, string> = {
  'reservation.created': 'Reservation Created',
  'reservation.hold_created': 'Booking Hold Created',
  'reservation.requested': 'Booking Requested',
  'reservation.confirmed': 'Reservation Confirmed',
  'reservation.cancelled': 'Reservation Cancelled',
  'reservation.expired': 'Reservation Expired',
  'reservation.reactivated': 'Reservation Reactivated',
  'reservation.completed': 'Reservation Completed',
  'reservation.started': 'Reservation Started',
  'reservation.no_show': 'No Show',
  'payment.checkout_created': 'Checkout Created',
  'payment.processing': 'Payment Processing',
  'payment.succeeded': 'Payment Succeeded',
  'payment.failed': 'Payment Failed',
  'payment.refunded': 'Payment Refunded',
  'payment.partially_refunded': 'Payment Partially Refunded',
  'waiver.signed': 'Waiver Signed',
  'customer.created': 'Customer Created',
  'customer.updated': 'Customer Updated',
  'opportunity.created': 'Opportunity Created',
  'opportunity.stage_changed': 'Pipeline Stage Changed',
};

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: 'workflows', label: 'Workflows', icon: Zap },
  { id: 'history', label: 'Execution History', icon: History },
  { id: 'failed', label: 'Failed Runs', icon: XCircle },
  { id: 'dead_letter', label: 'Dead Letter', icon: AlertCircle },
  { id: 'templates', label: 'Templates', icon: Mail },
  { id: 'messages', label: 'Message Log', icon: Send },
  { id: 'integrations', label: 'Integration Health', icon: ShieldCheck },
  { id: 'workers', label: 'Worker Health', icon: Server },
];

export default function AutomationsPage() {
  const router = useRouter();
  const { user, role, tenant, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<Tab>('workflows');
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [failedRuns, setFailedRuns] = useState<FailedRun[]>([]);
  const [deadLetterSteps, setDeadLetterSteps] = useState<DeadLetterStep[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [workerLogs, setWorkerLogs] = useState<WorkerLog[]>([]);
  const [messages, setMessages] = useState<MessageLog[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async (tenantId: string) => {
    setLoading(true);
    const [metricsRes, wfRes] = await Promise.all([
      supabase.rpc('get_automation_metrics', { p_tenant_id: tenantId }),
      supabase.from('automation_workflows').select('*').eq('tenant_id', tenantId).neq('status', 'archived').order('updated_at', { ascending: false }),
    ]);
    if (metricsRes.data) setMetrics(metricsRes.data as Metrics);
    if (wfRes.data) setWorkflows(wfRes.data as Workflow[]);
    setLoading(false);
  }, []);

  const loadTabData = useCallback(async (tenantId: string, activeTab: Tab) => {
    if (activeTab === 'failed') {
      const { data } = await supabase
        .from('automation_runs')
        .select('id, workflow_id, status, started_at, completed_at, error_message, entity_type, entity_id, reservation_id, customer_id')
        .eq('tenant_id', tenantId)
        .eq('status', 'failed')
        .order('started_at', { ascending: false })
        .limit(50);
      if (data) {
        const wfIds = Array.from(new Set(data.map(r => r.workflow_id)));
        const { data: wfs } = await supabase.from('automation_workflows').select('id, name').in('id', wfIds);
        const wfMap = new Map((wfs || []).map(w => [w.id, w.name]));
        setFailedRuns(data.map(r => ({ ...r, workflow_name: wfMap.get(r.workflow_id) || 'Unknown' })) as FailedRun[]);
      }
    } else if (activeTab === 'dead_letter') {
      const { data: steps } = await supabase
        .from('automation_step_runs')
        .select('id, node_id, action_type, status, error_message, attempt_count, created_at, automation_run_id')
        .eq('status', 'dead_letter')
        .order('created_at', { ascending: false })
        .limit(50);
      if (steps && steps.length > 0) {
        const runIds = Array.from(new Set(steps.map(s => s.automation_run_id)));
        const { data: runs } = await supabase.from('automation_runs').select('id, workflow_id').in('id', runIds);
        const runWfMap = new Map((runs || []).map(r => [r.id, r.workflow_id]));
        const wfIds = Array.from(new Set((runs || []).map(r => r.workflow_id)));
        const { data: wfs } = await supabase.from('automation_workflows').select('id, name').in('id', wfIds);
        const wfMap = new Map((wfs || []).map(w => [w.id, w.name]));
        setDeadLetterSteps(steps.map(s => ({ ...s, workflow_name: wfMap.get(runWfMap.get(s.automation_run_id) || '') || 'Unknown' })) as DeadLetterStep[]);
      } else {
        setDeadLetterSteps([]);
      }
    } else if (activeTab === 'integrations') {
      const { data } = await supabase
        .from('tenant_integrations')
        .select('id, provider, channel, connection_status, enabled, capabilities')
        .eq('tenant_id', tenantId)
        .eq('category', 'communication');
      setIntegrations((data || []) as Integration[]);
    } else if (activeTab === 'workers') {
      const { data } = await supabase
        .from('worker_health_log')
        .select('*')
        .order('invoked_at', { ascending: false })
        .limit(20);
      setWorkerLogs((data || []) as WorkerLog[]);
    } else if (activeTab === 'messages') {
      const { data } = await supabase
        .from('communication_messages')
        .select('id, channel, provider, status, recipient, queued_at, sent_at, template_id')
        .eq('tenant_id', tenantId)
        .order('queued_at', { ascending: false })
        .limit(50);
      if (data && data.length > 0) {
        const tplIds = Array.from(new Set(data.map(m => m.template_id).filter(Boolean))) as string[];
        const { data: tpls } = await supabase.from('communication_templates').select('id, name').in('id', tplIds);
        const tplMap = new Map((tpls || []).map(t => [t.id, t.name]));
        setMessages(data.map(m => ({ ...m, template_name: tplMap.get(m.template_id) || null })) as MessageLog[]);
      } else {
        setMessages([]);
      }
    } else if (activeTab === 'templates') {
      const { data } = await supabase
        .from('communication_templates')
        .select('id, name, channel, category, is_active, subject')
        .eq('tenant_id', tenantId)
        .is('archived_at', null)
        .order('created_at', { ascending: false });
      setTemplates((data || []) as Template[]);
    }
  }, []);

  useEffect(() => {
    if (!authLoading) {
      if (!user) { router.push('/login'); return; }
      if (role === 'super_admin') { router.push('/super-admin'); return; }
      if (tenant) load(tenant.id);
    }
  }, [authLoading, user, role, tenant, router, load]);

  useEffect(() => {
    if (tenant && !loading) loadTabData(tenant.id, tab);
  }, [tab, tenant, loading, loadTabData]);

  async function refresh() {
    if (!tenant) return;
    setRefreshing(true);
    await load(tenant.id);
    await loadTabData(tenant.id, tab);
    setRefreshing(false);
  }

  async function createWorkflow() {
    if (!tenant) return;
    const { data, error } = await supabase
      .from('automation_workflows')
      .insert({ tenant_id: tenant.id, name: 'New Workflow', trigger_type: 'reservation.confirmed', trigger_configuration: {}, status: 'draft' })
      .select().single();
    if (!error && data) router.push(`/automations/${data.id}`);
  }

  async function toggleWorkflow(wf: Workflow) {
    setActionLoading(wf.id);
    const newStatus = wf.status === 'active' ? 'paused' : 'active';
    await supabase.from('automation_workflows').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', wf.id);
    setWorkflows(prev => prev.map(w => w.id === wf.id ? { ...w, status: newStatus } : w));
    setActionLoading(null);
  }

  async function archiveWorkflow(wf: Workflow) {
    setActionLoading(wf.id);
    await supabase.from('automation_workflows').update({ status: 'archived', archived_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', wf.id);
    setWorkflows(prev => prev.filter(w => w.id !== wf.id));
    setActionLoading(null);
  }

  async function duplicateWorkflow(wf: Workflow) {
    if (!tenant) return;
    setActionLoading(wf.id);
    const { data } = await supabase.from('automation_workflows').insert({
      tenant_id: tenant.id, name: `${wf.name} (Copy)`, description: wf.description,
      trigger_type: wf.trigger_type, trigger_configuration: wf.trigger_configuration, status: 'draft',
    }).select().single();
    if (data) setWorkflows(prev => [data as Workflow, ...prev]);
    setActionLoading(null);
  }

  async function retryStep(stepRunId: string) {
    if (!tenant) return;
    setActionLoading(stepRunId);
    await supabase.rpc('retry_failed_step', { p_step_run_id: stepRunId });
    if (tenant) loadTabData(tenant.id, tab);
    setActionLoading(null);
  }

  async function dismissDeadLetter(stepRunId: string) {
    if (!tenant) return;
    setActionLoading(stepRunId);
    await supabase.rpc('dismiss_dead_letter_step', { p_step_run_id: stepRunId });
    if (tenant) loadTabData(tenant.id, tab);
    setActionLoading(null);
  }

  async function acknowledgeRun(runId: string) {
    if (!tenant) return;
    setActionLoading(runId);
    await supabase.rpc('acknowledge_failed_run', { p_run_id: runId });
    if (tenant) loadTabData(tenant.id, tab);
    setActionLoading(null);
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (role !== 'tenant_admin') return null;

  const successRate = metrics && metrics.total_runs > 0
    ? Math.round((metrics.total_completed / metrics.total_runs) * 100)
    : 100;

  const metricCards = [
    { label: 'Active', value: metrics?.active_workflows || 0, icon: Zap, color: 'green', tab: 'workflows' as Tab },
    { label: 'Draft', value: metrics?.draft_workflows || 0, icon: Clock, color: 'gray', tab: 'workflows' as Tab },
    { label: 'Paused', value: metrics?.paused_workflows || 0, icon: Pause, color: 'amber', tab: 'workflows' as Tab },
    { label: 'Runs Today', value: metrics?.runs_today || 0, icon: Activity, color: 'blue', tab: 'history' as Tab },
    { label: 'Success Rate', value: `${successRate}%`, icon: CheckCircle2, color: 'green', tab: 'history' as Tab },
    { label: 'Failed Today', value: metrics?.failed_runs_today || 0, icon: XCircle, color: 'red', tab: 'failed' as Tab },
    { label: 'Action Required', value: metrics?.action_required_steps || 0, icon: AlertTriangle, color: 'amber', tab: 'failed' as Tab },
    { label: 'Dead Letter', value: metrics?.dead_letter_steps || 0, icon: AlertCircle, color: 'red', tab: 'dead_letter' as Tab },
    { label: 'Scheduled', value: metrics?.scheduled_steps || 0, icon: Clock, color: 'purple', tab: 'history' as Tab },
    { label: 'Queued Messages', value: metrics?.queued_messages || 0, icon: Mail, color: 'blue', tab: 'messages' as Tab },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-[var(--card-bg)] px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-dark shadow-md shadow-teal/20">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-foreground">Automations</h1>
              <p className="text-xs text-muted-foreground">Operations Center</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing} className="border-border bg-[var(--card-bg)]">
              <RefreshCw className={cn('mr-2 h-4 w-4', refreshing && 'animate-spin')} />
              Refresh
            </Button>
            <Button onClick={createWorkflow} className="bg-primary text-white hover:bg-primary-hover">
              <Plus className="mr-2 h-4 w-4" />
              Create Workflow
            </Button>
          </div>
        </div>
      </header>

      <main className="px-4 py-6 sm:px-6 lg:px-8">
        {/* Metric cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 mb-6">
          {metricCards.map(card => {
            const Icon = card.icon;
            const isClickable = card.value !== 0 || card.label === 'Active' || card.label === 'Draft' || card.label === 'Paused';
            return (
              <button
                key={card.label}
                disabled={!isClickable}
                onClick={() => setTab(card.tab)}
                className={cn(
                  'rounded-[18px] border bg-[var(--card-bg)] p-3 text-left shadow-sm transition-all',
                  isClickable ? 'border-border hover:border-[rgba(99,119,255,0.34)] hover:shadow-md cursor-pointer' : 'border-border opacity-60'
                )}
              >
                <div className="flex items-center justify-between">
                  <Icon className={cn('h-4 w-4', `text-${card.color}-500`)} />
                  <span className={cn('text-xl font-bold', `text-${card.color}-600`)}>{card.value}</span>
                </div>
                <p className="mt-1 text-[10px] font-medium text-muted-foreground">{card.label}</p>
              </button>
            );
          })}
        </div>

        {/* Alert banners */}
        {(metrics?.worker_stale || (metrics?.disconnected_integrations || 0) > 0 || (metrics?.dead_letter_steps || 0) > 0) && (
          <div className="mb-4 space-y-2">
            {metrics?.worker_stale && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-[rgba(251,113,133,0.12)] px-4 py-2 text-xs text-[#FB7185]">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className="font-medium">Worker not running</span>
                <span>— no worker invocations in the last 10 minutes. Scheduled cron may not be configured.</span>
              </div>
            )}
            {(metrics?.disconnected_integrations || 0) > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-warning/20 bg-[rgba(251,191,36,0.12)] px-4 py-2 text-xs text-[#FCD34D]">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span className="font-medium">{metrics?.disconnected_integrations} messaging integration(s) disconnected</span>
                <button onClick={() => setTab('integrations')} className="ml-auto underline">Review</button>
              </div>
            )}
            {(metrics?.dead_letter_steps || 0) > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-[rgba(251,113,133,0.12)] px-4 py-2 text-xs text-[#FB7185]">
                <XCircle className="h-4 w-4 shrink-0" />
                <span className="font-medium">{metrics?.dead_letter_steps} dead-letter step(s)</span>
                <button onClick={() => setTab('dead_letter')} className="ml-auto underline">Review</button>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="mb-4 flex flex-wrap items-center gap-1 rounded-[18px] border border-border bg-[var(--card-bg)] p-1 shadow-sm">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                  tab === t.id ? 'bg-[var(--brand-primary)] text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
                {t.id === 'failed' && (metrics?.failed_runs_today || 0) > 0 && (
                  <span className="ml-1 rounded-full bg-[rgba(251,113,133,0.12)] px-1.5 py-0.5 text-[9px] font-bold text-[#FB7185]">{metrics?.failed_runs_today}</span>
                )}
                {t.id === 'dead_letter' && (metrics?.dead_letter_steps || 0) > 0 && (
                  <span className="ml-1 rounded-full bg-[rgba(251,113,133,0.12)] px-1.5 py-0.5 text-[9px] font-bold text-[#FB7185]">{metrics?.dead_letter_steps}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {tab === 'workflows' && (
          <div>
            {workflows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-[var(--card-bg)] py-20 shadow-sm">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary">
                  <Zap className="h-8 w-8 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <h3 className="text-sm font-semibold text-foreground">No workflows yet</h3>
                  <p className="mt-1 max-w-sm text-sm text-muted-foreground">Create your first workflow to automate messages, reminders, and tasks based on booking events.</p>
                </div>
                <Button onClick={createWorkflow} className="bg-[var(--brand-primary)] text-white hover:bg-primary-hover"><Plus className="mr-2 h-4 w-4" />Create Workflow</Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {workflows.map(wf => (
                  <div key={wf.id} className="group rounded-[18px] border border-border bg-[var(--card-bg)] p-4 shadow-sm transition-all hover:shadow-md">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-foreground truncate">{wf.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{TRIGGER_LABELS[wf.trigger_type] || wf.trigger_type}</p>
                      </div>
                      <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize', STATUS_STYLES[wf.status] || STATUS_STYLES.draft)}>{wf.status}</span>
                    </div>
                    {wf.description && <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{wf.description}</p>}
                    <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground">
                      {wf.active_version && <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />v{wf.active_version}</span>}
                      {wf.published_at && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{format(new Date(wf.published_at), 'MMM d')}</span>}
                    </div>
                    <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
                      <Button size="sm" variant="outline" onClick={() => router.push(`/automations/${wf.id}`)} className="flex-1 border-border bg-[var(--card-bg)]">Edit</Button>
                      {wf.status === 'active' ? (
                        <Button size="sm" variant="outline" onClick={() => toggleWorkflow(wf)} disabled={actionLoading === wf.id} className="border-warning/20 bg-[rgba(251,191,36,0.12)] text-[#FCD34D] hover:bg-warning/15"><Pause className="h-3.5 w-3.5" /></Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => toggleWorkflow(wf)} disabled={actionLoading === wf.id} className="border-success/20 bg-[rgba(74,222,128,0.12)] text-[#86EFAC] hover:bg-success/15"><Play className="h-3.5 w-3.5" /></Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => duplicateWorkflow(wf)} disabled={actionLoading === wf.id} className="border-border bg-[var(--card-bg)]"><Copy className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="outline" onClick={() => router.push(`/automations/${wf.id}/history`)} disabled={actionLoading === wf.id} className="border-border bg-[var(--card-bg)]"><History className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="outline" onClick={() => archiveWorkflow(wf)} disabled={actionLoading === wf.id} className="border-destructive/20 bg-[rgba(251,113,133,0.12)] text-[#FB7185] hover:bg-destructive/15"><Archive className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'history' && (
          <div className="rounded-[18px] border border-border bg-[var(--card-bg)] p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-foreground mb-3">Recent Workflow Runs</h2>
            <p className="text-xs text-muted-foreground mb-4">Showing the most recent execution runs across all workflows. Click a workflow name to see detailed step history.</p>
            <RunHistoryList tenantId={tenant?.id} />
          </div>
        )}

        {tab === 'failed' && (
          <div className="rounded-[18px] border border-border bg-[var(--card-bg)] p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-foreground mb-3">Failed Runs</h2>
            {failedRuns.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No failed runs. All good!</p>
            ) : (
              <div className="space-y-2">
                {failedRuns.map(run => (
                  <div key={run.id} className="rounded-lg border border-destructive/20 bg-destructive/10/50 p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <XCircle className="h-4 w-4 text-[#FB7185] shrink-0" />
                          <span className="text-sm font-medium text-foreground">{run.workflow_name}</span>
                          <span className="text-[10px] text-muted-foreground">{format(new Date(run.started_at), 'MMM d, HH:mm')}</span>
                        </div>
                        {run.error_message && <p className="mt-1 text-xs text-[#FB7185] line-clamp-2">{run.error_message}</p>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => retryStep(run.id)} disabled={actionLoading === run.id} className="border-primary/20 bg-[rgba(99,119,255,0.10)] text-[var(--brand-primary)] hover:bg-primary/15 text-[10px]">Retry</Button>
                        <Button size="sm" variant="outline" onClick={() => acknowledgeRun(run.id)} disabled={actionLoading === run.id} className="border-border bg-secondary/30 text-muted-foreground hover:bg-secondary text-[10px]">Acknowledge</Button>
                        <Button size="sm" variant="outline" onClick={() => router.push(`/automations/${run.workflow_id}/history`)} className="border-border bg-[var(--card-bg)] text-[10px]">Open Run</Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'dead_letter' && (
          <div className="rounded-[18px] border border-border bg-[var(--card-bg)] p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-foreground mb-3">Dead Letter Queue</h2>
            {deadLetterSteps.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No dead-letter steps. All good!</p>
            ) : (
              <div className="space-y-2">
                {deadLetterSteps.map(step => (
                  <div key={step.id} className="rounded-lg border border-red-300 bg-destructive/10/50 p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-[#FB7185] shrink-0" />
                          <span className="text-sm font-medium text-foreground">{step.workflow_name}</span>
                          <span className="text-[10px] text-muted-foreground capitalize">{step.action_type.replace(/_/g, ' ')}</span>
                          <span className="text-[10px] text-muted-foreground">{step.attempt_count} attempts</span>
                        </div>
                        {step.error_message && <p className="mt-1 text-xs text-[#FB7185]">{step.error_message}</p>}
                        <p className="mt-0.5 text-[10px] text-muted-foreground">Created {formatDistanceToNow(new Date(step.created_at), { addSuffix: true })}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => retryStep(step.id)} disabled={actionLoading === step.id} className="border-primary/20 bg-[rgba(99,119,255,0.10)] text-[var(--brand-primary)] hover:bg-primary/15 text-[10px]">Retry</Button>
                        <Button size="sm" variant="outline" onClick={() => dismissDeadLetter(step.id)} disabled={actionLoading === step.id} className="border-border bg-secondary/30 text-muted-foreground hover:bg-secondary text-[10px]">Dismiss</Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'templates' && (
          <div className="rounded-[18px] border border-border bg-[var(--card-bg)] p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground">Communication Templates</h2>
              <Button size="sm" variant="outline" onClick={() => router.push('/communications')} className="border-border bg-[var(--card-bg)] text-[10px]">Manage Templates</Button>
            </div>
            {templates.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No templates yet.</p>
            ) : (
              <div className="space-y-2">
                {templates.map(tpl => (
                  <div key={tpl.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-[var(--brand-primary)]" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{tpl.name}</p>
                        <p className="text-[10px] text-muted-foreground capitalize">{tpl.channel} · {tpl.category.replace(/_/g, ' ')}</p>
                      </div>
                    </div>
                    <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', tpl.is_active ? 'border-success/20 bg-[rgba(74,222,128,0.12)] text-[#86EFAC]' : 'border-border bg-secondary/30 text-muted-foreground')}>
                      {tpl.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'messages' && (
          <div className="rounded-[18px] border border-border bg-[var(--card-bg)] p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-foreground mb-3">Message Log</h2>
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No messages sent yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-[10px] uppercase text-muted-foreground">
                      <th className="pb-2 pr-4">Channel</th>
                      <th className="pb-2 pr-4">Provider</th>
                      <th className="pb-2 pr-4">Status</th>
                      <th className="pb-2 pr-4">Recipient</th>
                      <th className="pb-2 pr-4">Template</th>
                      <th className="pb-2 pr-4">Queued</th>
                    </tr>
                  </thead>
                  <tbody>
                    {messages.map(msg => (
                      <tr key={msg.id} className="border-b border-border/50">
                        <td className="py-2 pr-4 capitalize">{msg.channel}</td>
                        <td className="py-2 pr-4">{msg.provider}</td>
                        <td className="py-2 pr-4">
                          <span className={cn('rounded-full border px-2 py-0.5 text-[9px] font-medium',
                            msg.status === 'sent' || msg.status === 'delivered' ? 'border-success/20 bg-[rgba(74,222,128,0.12)] text-[#86EFAC]' :
                            msg.status === 'failed' ? 'border-destructive/20 bg-[rgba(251,113,133,0.12)] text-[#FB7185]' :
                            msg.status === 'sent_mock' ? 'border-accent/20 bg-accent/10 text-accent' :
                            msg.status === 'action_required' ? 'border-warning/20 bg-[rgba(251,191,36,0.12)] text-[#FCD34D]' :
                            'border-border bg-secondary/30 text-muted-foreground'
                          )}>{msg.status}</span>
                        </td>
                        <td className="py-2 pr-4 max-w-[120px] truncate">{msg.recipient || '—'}</td>
                        <td className="py-2 pr-4 max-w-[120px] truncate">{msg.template_name || '—'}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{msg.queued_at ? formatDistanceToNow(new Date(msg.queued_at), { addSuffix: true }) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'integrations' && (
          <div className="rounded-[18px] border border-border bg-[var(--card-bg)] p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-foreground mb-3">Integration Health</h2>
            {integrations.length === 0 ? (
              <div className="py-8 text-center">
                <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground/30" />
                <p className="mt-2 text-sm text-muted-foreground">No communication integrations configured.</p>
                <Button size="sm" variant="outline" onClick={() => router.push('/settings')} className="mt-3 border-border bg-[var(--card-bg)]">Connect a Provider</Button>
              </div>
            ) : (
              <div className="space-y-2">
                {integrations.map(int => (
                  <div key={int.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div className="flex items-center gap-3">
                      <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', int.connection_status === 'connected' && int.enabled ? 'bg-[rgba(74,222,128,0.12)]' : 'bg-[rgba(251,113,133,0.12)]')}>
                        {int.channel === 'email' ? <Mail className="h-4 w-4 text-[var(--brand-primary)]" /> : int.channel === 'sms' ? <Send className="h-4 w-4 text-[#86EFAC]" /> : <Send className="h-4 w-4 text-[var(--brand-primary)]" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground capitalize">{int.provider}</p>
                        <p className="text-[10px] text-muted-foreground capitalize">{int.channel}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium',
                        int.connection_status === 'connected' && int.enabled ? 'border-success/20 bg-[rgba(74,222,128,0.12)] text-[#86EFAC]' : 'border-destructive/20 bg-[rgba(251,113,133,0.12)] text-[#FB7185]'
                      )}>
                        {int.enabled ? int.connection_status : 'disabled'}
                      </span>
                      {int.capabilities && (
                        <span className="text-[10px] text-muted-foreground">
                          {Object.entries(int.capabilities).filter(([, v]) => v).map(([k]) => k).join(', ') || 'no capabilities'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'workers' && (
          <div className="space-y-4">
            <div className="rounded-[18px] border border-border bg-[var(--card-bg)] p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-foreground mb-3">Worker Status</h2>
              <div className="space-y-2">
                {['process-workflows', 'process-outbox'].map(name => {
                  const lastLog = workerLogs.find(l => l.worker_name === name);
                  const isStale = !lastLog || new Date(lastLog.invoked_at) < new Date(Date.now() - 10 * 60 * 1000);
                  return (
                    <div key={name} className="flex items-center justify-between rounded-lg border border-border p-3">
                      <div className="flex items-center gap-2">
                        <Server className="h-4 w-4 text-[var(--brand-primary)]" />
                        <span className="text-sm text-foreground">{name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {lastLog ? (
                          <>
                            <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', isStale ? 'border-warning/20 bg-[rgba(251,191,36,0.12)] text-[#FCD34D]' : 'border-success/20 bg-[rgba(74,222,128,0.12)] text-[#86EFAC]')}>
                              {isStale ? 'Stale' : 'Healthy'}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              Last: {formatDistanceToNow(new Date(lastLog.invoked_at), { addSuffix: true })}
                            </span>
                          </>
                        ) : (
                          <span className="rounded-full border border-destructive/20 bg-[rgba(251,113,133,0.12)] px-2 py-0.5 text-[10px] font-medium text-[#FB7185]">Never invoked</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {metrics?.worker_stale && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-warning/20 bg-[rgba(251,191,36,0.12)] px-3 py-2 text-xs text-[#FCD34D]">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>Scheduler may not be configured. Workers need cron invocation every 1-2 minutes.</span>
                </div>
              )}
            </div>

            {workerLogs.length > 0 && (
              <div className="rounded-[18px] border border-border bg-[var(--card-bg)] p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-foreground mb-3">Recent Worker Invocations</h2>
                <div className="space-y-2">
                  {workerLogs.map(log => (
                    <div key={log.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                      <div className="flex items-center gap-2">
                        {log.success ? <CheckCircle2 className="h-4 w-4 text-[#86EFAC]" /> : <XCircle className="h-4 w-4 text-[#FB7185]" />}
                        <span className="text-xs font-medium text-foreground">{log.worker_name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {log.processed_count} processed, {log.failed_count} failed, {log.dead_letter_count} dead-letter
                          {log.duration_ms != null && ` · ${log.duration_ms}ms`}
                        </span>
                        {log.error_message && <span className="text-[10px] text-[#FB7185] line-clamp-1">{log.error_message}</span>}
                      </div>
                      <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(log.invoked_at), { addSuffix: true })}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// ============================================================
// Run History List (inline component for Execution History tab)
// ============================================================
function RunHistoryList({ tenantId }: { tenantId?: string }) {
  const router = useRouter();
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      const { data } = await supabase
        .from('automation_runs')
        .select('id, workflow_id, status, started_at, completed_at, error_message')
        .eq('tenant_id', tenantId)
        .order('started_at', { ascending: false })
        .limit(30);
      if (data && data.length > 0) {
        const wfIds = Array.from(new Set(data.map(r => r.workflow_id)));
        const { data: wfs } = await supabase.from('automation_workflows').select('id, name').in('id', wfIds);
        const wfMap = new Map((wfs || []).map(w => [w.id, w.name]));
        setRuns(data.map(r => ({ ...r, workflow_name: wfMap.get(r.workflow_id) || 'Unknown' })));
      }
      setLoading(false);
    })();
  }, [tenantId]);

  if (loading) return <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto" />;
  if (runs.length === 0) return <p className="text-sm text-muted-foreground py-8 text-center">No workflow runs yet.</p>;

  const statusIcons: Record<string, any> = { completed: CheckCircle2, failed: XCircle, running: Loader2, pending: Clock, cancelled: XCircle };
  const statusColors: Record<string, string> = { completed: 'text-[#86EFAC]', failed: 'text-[#FB7185]', running: 'text-[var(--brand-primary)]', pending: 'text-[#FCD34D]', cancelled: 'text-muted-foreground' };

  return (
    <div className="space-y-1.5">
      {runs.map(run => {
        const Icon = statusIcons[run.status] || Clock;
        return (
          <button
            key={run.id}
            onClick={() => router.push(`/automations/${run.workflow_id}/history`)}
            className="flex w-full items-center justify-between rounded-lg border border-border p-3 text-left transition-colors hover:border-[rgba(99,119,255,0.34)]"
          >
            <div className="flex items-center gap-2">
              <Icon className={cn('h-4 w-4', statusColors[run.status], run.status === 'running' && 'animate-spin')} />
              <span className="text-sm font-medium text-foreground">{run.workflow_name}</span>
              <span className={cn('rounded-full border px-2 py-0.5 text-[9px] font-medium capitalize', run.status === 'completed' ? 'border-success/20 bg-[rgba(74,222,128,0.12)] text-[#86EFAC]' : run.status === 'failed' ? 'border-destructive/20 bg-[rgba(251,113,133,0.12)] text-[#FB7185]' : 'border-border bg-secondary/30 text-muted-foreground')}>{run.status}</span>
            </div>
            <div className="flex items-center gap-2">
              {run.error_message && <span className="text-[10px] text-[#FB7185] line-clamp-1 max-w-[200px]">{run.error_message}</span>}
              <span className="text-[10px] text-muted-foreground">{format(new Date(run.started_at), 'MMM d, HH:mm')}</span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </button>
        );
      })}
    </div>
  );
}
