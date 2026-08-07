'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import {
  Activity, Loader2, CheckCircle2, XCircle, Clock,
  AlertCircle, Zap, Mail, Server, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

type HealthStats = {
  pending_runs: number;
  running_runs: number;
  pending_steps: number;
  scheduled_steps: number;
  failed_steps: number;
  dead_letter_steps: number;
  queued_messages: number;
  failed_messages: number;
  total_workflows: number;
  active_workflows: number;
  total_templates: number;
  recent_runs: Array<{
    id: string;
    status: string;
    started_at: string;
    completed_at: string | null;
    error_message: string | null;
  }>;
  worker_logs: Array<{
    id: string;
    worker_name: string;
    invoked_at: string;
    success: boolean;
    processed_count: number;
    failed_count: number;
    dead_letter_count: number;
    duration_ms: number | null;
    error_message: string | null;
  }>;
};

export default function WorkerHealthPage() {
  const router = useRouter();
  const { user, role, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<HealthStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!authLoading) {
      if (!user) { router.push('/login'); return; }
      if (role !== 'super_admin') { router.push('/admin'); return; }
      loadStats();
    }
  }, [authLoading, user, role, router]);

  async function loadStats() {
    setLoading(true);
    const [runsRes, stepsRes, msgsRes, wfRes, tplRes, recentRunsRes, workerLogsRes] = await Promise.all([
      supabase.from('automation_runs').select('status').in('status', ['pending', 'running']),
      supabase.from('automation_step_runs').select('status'),
      supabase.from('communication_messages').select('status').in('status', ['queued', 'failed']),
      supabase.from('automation_workflows').select('status'),
      supabase.from('communication_templates').select('id').is('archived_at', null),
      supabase.from('automation_runs').select('id, status, started_at, completed_at, error_message').order('started_at', { ascending: false }).limit(10),
      supabase.from('worker_health_log').select('*').order('invoked_at', { ascending: false }).limit(20),
    ]);

    const stepStatuses = stepsRes.data || [];
    const msgStatuses = msgsRes.data || [];
    const wfStatuses = wfRes.data || [];

    setStats({
      pending_runs: (runsRes.data || []).filter(r => r.status === 'pending').length,
      running_runs: (runsRes.data || []).filter(r => r.status === 'running').length,
      pending_steps: stepStatuses.filter(s => s.status === 'pending').length,
      scheduled_steps: stepStatuses.filter(s => s.status === 'scheduled').length,
      failed_steps: stepStatuses.filter(s => s.status === 'failed').length,
      dead_letter_steps: stepStatuses.filter(s => s.status === 'dead_letter').length,
      queued_messages: msgStatuses.filter(m => m.status === 'queued').length,
      failed_messages: msgStatuses.filter(m => m.status === 'failed').length,
      total_workflows: wfStatuses.length,
      active_workflows: wfStatuses.filter(w => w.status === 'active').length,
      total_templates: tplRes.data?.length || 0,
      recent_runs: (recentRunsRes.data || []) as any,
      worker_logs: (workerLogsRes.data || []) as any,
    });
    setLoading(false);
  }

  async function refresh() {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy-900">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--brand-primary)]" />
      </div>
    );
  }

  if (role !== 'super_admin') return null;

  const statCards = [
    { label: 'Running Runs', value: stats?.running_runs || 0, icon: Zap, color: 'blue' },
    { label: 'Pending Steps', value: stats?.pending_steps || 0, icon: Clock, color: 'amber' },
    { label: 'Scheduled Steps', value: stats?.scheduled_steps || 0, icon: Clock, color: 'purple' },
    { label: 'Failed Steps', value: stats?.failed_steps || 0, icon: XCircle, color: 'red' },
    { label: 'Dead-Letter Steps', value: stats?.dead_letter_steps || 0, icon: AlertCircle, color: 'red' },
    { label: 'Queued Messages', value: stats?.queued_messages || 0, icon: Mail, color: 'blue' },
    { label: 'Failed Messages', value: stats?.failed_messages || 0, icon: XCircle, color: 'red' },
    { label: 'Active Workflows', value: stats?.active_workflows || 0, icon: Zap, color: 'green' },
  ];

  return (
    <div className="min-h-screen bg-navy-900">
      <header className="border-b border-white/10 bg-navy-800 px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[18px] bg-[rgba(99,119,255,0.20)]">
              <Activity className="h-5 w-5 text-[var(--brand-primary)]" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">Worker Health</h1>
              <p className="text-xs text-white/50">Automation and communications operational status</p>
            </div>
          </div>
          <button onClick={refresh} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-navy-700 px-3 py-1.5 text-xs text-white/70 transition-colors hover:bg-navy-600">
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </header>

      <main className="px-4 py-6 sm:px-6 lg:px-8">
        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {statCards.map(card => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="rounded-xl border border-white/10 bg-navy-800 p-4">
                <div className="flex items-center justify-between">
                  <Icon className={cn('h-4 w-4', `text-${card.color}-400`)} />
                  <span className={cn('text-2xl font-bold', `text-${card.color}-400`)}>
                    {card.value}
                  </span>
                </div>
                <p className="mt-1 text-xs text-white/60">{card.label}</p>
              </div>
            );
          })}
        </div>

        {/* Worker status */}
        <div className="mt-6 rounded-xl border border-white/10 bg-navy-800 p-5">
          <h2 className="text-sm font-semibold text-white mb-3">Worker Status</h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-lg border border-white/10 bg-navy-700 p-3">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-[var(--brand-primary)]" />
                <span className="text-sm text-white">process-workflows</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[rgba(99,119,255,0.20)] px-2 py-0.5 text-[10px] font-medium text-[var(--brand-primary)]">Deployed</span>
                <span className="text-[10px] text-white/50">Requires CRON_SECRET scheduling</span>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-white/10 bg-navy-700 p-3">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-[var(--brand-primary)]" />
                <span className="text-sm text-white">process-outbox</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[rgba(99,119,255,0.20)] px-2 py-0.5 text-[10px] font-medium text-[var(--brand-primary)]">Deployed</span>
                <span className="text-[10px] text-white/50">Requires CRON_SECRET scheduling</span>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-white/10 bg-navy-700 p-3">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-[var(--brand-primary)]" />
                <span className="text-sm text-white">expire-holds</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[rgba(99,119,255,0.20)] px-2 py-0.5 text-[10px] font-medium text-[var(--brand-primary)]">Deployed</span>
                <span className="text-[10px] text-white/50">Requires CRON_SECRET scheduling</span>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-white/10 bg-navy-700 p-3">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-[var(--brand-primary)]" />
                <span className="text-sm text-white">sync-ical-imports</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[rgba(99,119,255,0.20)] px-2 py-0.5 text-[10px] font-medium text-[var(--brand-primary)]">Deployed</span>
                <span className="text-[10px] text-white/50">Requires CRON_SECRET scheduling</span>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-white/10 bg-navy-700 p-3">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-[var(--brand-primary)]" />
                <span className="text-sm text-white">deliver-webhooks</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[rgba(99,119,255,0.20)] px-2 py-0.5 text-[10px] font-medium text-[var(--brand-primary)]">Deployed</span>
                <span className="text-[10px] text-white/50">Requires CRON_SECRET scheduling</span>
              </div>
            </div>
          </div>
        </div>

        {/* Worker invocation history */}
        {stats?.worker_logs && stats.worker_logs.length > 0 && (
          <div className="mt-6 rounded-xl border border-white/10 bg-navy-800 p-5">
            <h2 className="text-sm font-semibold text-white mb-3">Recent Worker Invocations</h2>
            <div className="space-y-2">
              {stats.worker_logs.map(log => (
                <div key={log.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-navy-700 p-3">
                  <div className="flex items-center gap-2">
                    {log.success ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-destructive" />}
                    <span className="text-xs text-white/80">{log.worker_name}</span>
                    <span className="text-[10px] text-white/50">
                      {log.processed_count} processed, {log.failed_count} failed, {log.dead_letter_count} dead-letter
                      {log.duration_ms != null && ` · ${log.duration_ms}ms`}
                    </span>
                    {log.error_message && <span className="text-[10px] text-destructive line-clamp-1">{log.error_message}</span>}
                  </div>
                  <span className="text-[10px] text-white/50">
                    {formatDistanceToNow(new Date(log.invoked_at), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent runs */}
        {stats?.recent_runs && stats.recent_runs.length > 0 && (
          <div className="mt-6 rounded-xl border border-white/10 bg-navy-800 p-5">
            <h2 className="text-sm font-semibold text-white mb-3">Recent Workflow Runs</h2>
            <div className="space-y-2">
              {stats.recent_runs.map(run => (
                <div key={run.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-navy-700 p-3">
                  <div className="flex items-center gap-2">
                    {run.status === 'completed' ? (<CheckCircle2 className="h-4 w-4 text-success" />) :
                     run.status === 'failed' ? (<XCircle className="h-4 w-4 text-destructive" />) :
                     (<Loader2 className="h-4 w-4 text-[var(--brand-primary)]" />)}
                    <span className="text-xs text-white/80 capitalize">{run.status}</span>
                    {run.error_message && <span className="text-[10px] text-destructive line-clamp-1">{run.error_message}</span>}
                  </div>
                  <span className="text-[10px] text-white/50">
                    {formatDistanceToNow(new Date(run.started_at), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
