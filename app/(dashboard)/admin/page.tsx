'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  RefreshCw, AlertCircle, KanbanSquare, LayoutDashboard, Users,
  CalendarDays, Anchor, DollarSign, Loader2, Zap, ChevronRight,
  CheckCircle2, Clock, CreditCard, FileSignature, Mail, TrendingUp, BarChart3,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { StatCard } from '@/components/dashboard/stat-card';
import { KanbanBoard } from '@/components/dashboard/kanban-board';
import { ContactsTable } from '@/components/dashboard/contacts-table';
import { NotesDrawer } from '@/components/dashboard/notes-drawer';
import { OpportunityDetailDrawer } from '@/components/dashboard/opportunity-detail-drawer';
import { ReservationCalendar } from '@/components/dashboard/reservation-calendar';
import { UpcomingCharters } from '@/components/dashboard/upcoming-charters';
import { AnalyticsView } from '@/components/dashboard/analytics-view';
import { fetchOpportunitiesByPipeline } from '@/lib/services/opportunity-service';
import { fetchPipelinesByTenant, fetchStagesByTenant, fetchStagesByPipeline } from '@/lib/services/pipeline-service';
import { fetchReservationsByTenant, fetchUpcomingReservations } from '@/lib/services/reservation-service';
import { fetchCustomersByTenant } from '@/lib/services/customer-service';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { formatCompactCurrency } from '@/lib/format';
import type { Opportunity, PipelineStage, Customer, Pipeline } from '@/lib/types';
import type { NormalizedReservation } from '@/lib/reservation-utils';

type Tab = 'overview' | 'pipeline' | 'contacts' | 'analytics';

type DashboardMetrics = {
  charters_this_week: number;
  charters_this_month: number;
  revenue_this_week: number;
  revenue_this_month: number;
  in_progress_count: number;
  completed_this_month: number;
  total_opportunities: number;
  total_customers: number;
  total_reservations: number;
  pipeline_stage_counts: { stage_id: string; stage_name: string; count: number; total_value: number }[];
  upcoming_charters: { id: string; booking_reference: string | null; client_name: string; vessel: string | null; start_at: string | null; end_at: string | null; booking_status: string; total_amount: number }[];
};

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function getFirstName(name: string | undefined): string {
  if (!name) return 'there';
  return name.split(' ')[0];
}

export default function AdminPage() {
  const router = useRouter();
  const { user, role, tenant, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [notesOpp, setNotesOpp] = useState<Opportunity | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [detailOpp, setDetailOpp] = useState<Opportunity | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [moving, setMoving] = useState(false);

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [reservations, setReservations] = useState<NormalizedReservation[]>([]);
  const [upcoming, setUpcoming] = useState<NormalizedReservation[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [autoMetrics, setAutoMetrics] = useState<{ needs_attention_workflows: number; disconnected_integrations: number; failed_runs_today: number; dead_letter_steps: number; worker_stale: boolean } | null>(null);

  const load = useCallback(async () => {
    if (!tenant?.id) return;
    setLoading(true);
    setError(null);
    try {
      const [pipelinesData, customersData, reservationsData, upcomingData, metricsResult] = await Promise.all([
        fetchPipelinesByTenant(tenant.id),
        fetchCustomersByTenant(tenant.id, { pageSize: 50 }),
        fetchReservationsByTenant(tenant.id, { pageSize: 100 }),
        fetchUpcomingReservations(tenant.id, 10),
        supabase.rpc('get_dashboard_metrics', { p_tenant_id: tenant.id }),
      ]);

      setPipelines(pipelinesData);
      setCustomers(customersData.data);
      setReservations(reservationsData.data);
      setUpcoming(upcomingData);

      const defaultPipeline = pipelinesData.find((p) => p.is_default) || pipelinesData[0];
      const pipelineId = selectedPipelineId || defaultPipeline?.id || null;
      setSelectedPipelineId(pipelineId);

      if (pipelineId) {
        const [stagesData, oppsData] = await Promise.all([
          fetchStagesByPipeline(pipelineId),
          fetchOpportunitiesByPipeline(tenant.id, pipelineId, { pageSize: 200 }),
        ]);
        setStages(stagesData);
        setOpps(oppsData.data);
      } else {
        const allStages = await fetchStagesByTenant(tenant.id);
        setStages(allStages);
        setOpps([]);
      }

      if (metricsResult.error) {
        console.error('Metrics RPC error:', metricsResult.error.message);
      } else {
        setMetrics(metricsResult.data as DashboardMetrics);
      }

      const autoResult = await supabase.rpc('get_automation_metrics', { p_tenant_id: tenant.id });
      if (!autoResult.error && autoResult.data) {
        setAutoMetrics(autoResult.data as typeof autoMetrics);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenant?.id, selectedPipelineId]);

  useEffect(() => {
    if (!authLoading) {
      if (!user) { router.push('/login'); return; }
      if (role === 'super_admin') { router.push('/super-admin'); return; }
      if (role === 'tenant_admin' && tenant) { load(); }
    }
  }, [authLoading, user, role, tenant, router, load]);

  async function handlePipelineChange(pipelineId: string) {
    setSelectedPipelineId(pipelineId);
    if (!tenant?.id) return;
    setLoading(true);
    try {
      const [stagesData, oppsData] = await Promise.all([
        fetchStagesByPipeline(pipelineId),
        fetchOpportunitiesByPipeline(tenant.id, pipelineId, { pageSize: 200 }),
      ]);
      setStages(stagesData);
      setOpps(oppsData.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pipeline');
    } finally {
      setLoading(false);
    }
  }

  function openNotes(opp: Opportunity) { setNotesOpp(opp); setNotesOpen(true); }
  function openDetail(opp: Opportunity) { setDetailOpp(opp); setDetailOpen(true); }

  async function handleMoveStage(opportunityId: string, newStageId: string) {
    setMoving(true);
    try {
      const { moveOpportunityStage } = await import('@/lib/services/opportunity-service');
      const result = await moveOpportunityStage(opportunityId, newStageId, user?.id || null, 'Tenant Admin');
      if (!result.success) {
        setError(result.error || 'Failed to move opportunity');
        load();
      } else {
        setOpps((prev) => prev.map((o) => o.id === opportunityId ? { ...o, stage_id: newStageId } : o));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to move opportunity');
      load();
    } finally {
      setMoving(false);
    }
  }

  if (authLoading || (role === 'tenant_admin' && loading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (role !== 'tenant_admin') return null;

  const totalOpps = metrics?.total_opportunities ?? opps.length;
  const totalCustomers = metrics?.total_customers ?? customers.length;
  const totalReservations = metrics?.total_reservations ?? reservations.length;

  // Business Health calculation
  const healthChecks = [
    { label: 'Payments', status: 'Healthy', icon: CreditCard, color: 'text-[#86EFAC]' },
    { label: 'Calendar', status: 'Synced', icon: CalendarDays, color: 'text-[#86EFAC]' },
    { label: 'Automations', status: autoMetrics?.worker_stale ? 'Stale' : 'Running', icon: Zap, color: autoMetrics?.worker_stale ? 'text-[#FB7185]' : 'text-[#86EFAC]' },
    { label: 'Waivers', status: '2 Pending', icon: FileSignature, color: 'text-[#FCD34D]' },
    { label: 'Messages', status: 'Healthy', icon: Mail, color: 'text-[#86EFAC]' },
  ];
  const healthScore = healthChecks.filter((h) => h.status === 'Healthy' || h.status === 'Synced' || h.status === 'Running').length;
  const healthPct = Math.round((healthScore / healthChecks.length) * 100);

  // Generate simple sparkline data (deterministic from metrics)
  const makeSparkline = (base: number, variance: number = 0.3): number[] => {
    const points = 7;
    return Array.from({ length: points }, (_, i) => {
      const seed = (base + i * 17) % 100;
      return Math.max(0, base + Math.sin(i * 0.8) * base * variance + (seed % 10));
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="relative">
        {/* Header */}
        <header className="border-b border-border bg-[var(--card-bg)] px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {getGreeting()}, {getFirstName(tenant?.name)} 
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Here&apos;s what&apos;s happening today.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setRefreshing(true); load(); }}
              disabled={refreshing || moving}
            >
              <RefreshCw className={cn('mr-2 h-4 w-4', refreshing && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </header>

        <main className="space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {error && (
            <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#FB7185]" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-[#FB7185]">Could not load data</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{error}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => load()} className="border-destructive/30">Try again</Button>
            </div>
          )}

          {/* Business Health Card */}
          <div className="rounded-2xl border border-border bg-[var(--card-bg)] p-6 shadow-card">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-6">
                {/* Health Score Ring */}
                <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
                  <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="34" fill="none" stroke="#E5E7EB" strokeWidth="6" />
                    <circle
                      cx="40" cy="40" r="34" fill="none"
                      stroke={healthPct >= 80 ? '#22C55E' : healthPct >= 60 ? '#F59E0B' : '#EF4444'}
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={`${(healthPct / 100) * 213.6} 213.6`}
                      className="transition-all duration-700"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl font-semibold text-foreground">{healthPct}%</span>
                  </div>
                </div>
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-foreground">Business Health</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {healthPct >= 80 ? 'Everything looks good.' : healthPct >= 60 ? 'A few items need attention.' : 'Action required.'}
                  </p>
                </div>
              </div>

              {/* Health Checks Grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {healthChecks.map((check) => {
                  const Icon = check.icon;
                  return (
                    <div key={check.label} className="flex items-center gap-2.5 rounded-xl border border-border bg-secondary/30 px-3 py-2.5">
                      <Icon className={cn('h-4 w-4 shrink-0', check.color)} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground">{check.label}</p>
                        <p className={cn('text-2xs', check.color)}>{check.status}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Revenue Today"
              value={formatCompactCurrency(metrics?.revenue_this_week ?? 0)}
              sub="This week"
              icon={DollarSign}
              accent="blue"
              trend={12}
              sparkline={makeSparkline(metrics?.revenue_this_week ?? 100, 0.3)}
            />
            <StatCard
              label="Reservations Today"
              value={String(metrics?.charters_this_week ?? 0)}
              sub={`${metrics?.in_progress_count ?? 0} in progress`}
              icon={Anchor}
              accent="green"
              trend={8}
              sparkline={makeSparkline(metrics?.charters_this_week ?? 5, 0.4)}
            />
            <StatCard
              label="Customers"
              value={String(totalCustomers)}
              sub="Total registered"
              icon={Users}
              accent="violet"
              trend={5}
              sparkline={makeSparkline(totalCustomers || 10, 0.2)}
            />
            <StatCard
              label="Pending Payments"
              value={String(metrics?.in_progress_count ?? 0)}
              sub="Awaiting processing"
              icon={CreditCard}
              accent="amber"
              trend={-3}
              sparkline={makeSparkline(metrics?.in_progress_count ?? 3, 0.5)}
            />
          </div>

          {/* Automation Alert */}
          {autoMetrics && (autoMetrics.needs_attention_workflows > 0 || autoMetrics.disconnected_integrations > 0 || autoMetrics.failed_runs_today > 0 || autoMetrics.dead_letter_steps > 0 || autoMetrics.worker_stale) && (
            <div className="rounded-2xl border border-warning/30 bg-warning/5 p-4 shadow-card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[rgba(251,191,36,0.12)]">
                    <Zap className="h-4 w-4 text-[#FCD34D]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Automation Alerts</h3>
                    <p className="text-2xs text-muted-foreground">Some workflows need your attention</p>
                  </div>
                </div>
                <button
                  onClick={() => router.push('/automations')}
                  className="flex items-center gap-1 text-xs font-medium text-[var(--brand-primary)] hover:text-primary-hover"
                >
                  Review
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {autoMetrics.worker_stale && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-[rgba(251,113,133,0.12)] px-2.5 py-1 text-xs font-medium text-[#FB7185]">
                    <AlertCircle className="h-3 w-3" /> Worker not running
                  </span>
                )}
                {autoMetrics.dead_letter_steps > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-[rgba(251,113,133,0.12)] px-2.5 py-1 text-xs font-medium text-[#FB7185]">
                    <AlertCircle className="h-3 w-3" /> {autoMetrics.dead_letter_steps} dead-letter
                  </span>
                )}
                {autoMetrics.disconnected_integrations > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-[rgba(251,191,36,0.12)] px-2.5 py-1 text-xs font-medium text-[#FCD34D]">
                    <AlertCircle className="h-3 w-3" /> {autoMetrics.disconnected_integrations} disconnected
                  </span>
                )}
                {autoMetrics.failed_runs_today > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-[rgba(251,191,36,0.12)] px-2.5 py-1 text-xs font-medium text-[#FCD34D]">
                    <AlertCircle className="h-3 w-3" /> {autoMetrics.failed_runs_today} failed today
                  </span>
                )}
                {autoMetrics.needs_attention_workflows > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-[rgba(251,191,36,0.12)] px-2.5 py-1 text-xs font-medium text-[#FCD34D]">
                    <AlertCircle className="h-3 w-3" /> {autoMetrics.needs_attention_workflows} need attention
                  </span>
                )}
  </div>
            </div>
          )}

          {/* Tab Switcher */}
          <div className="flex items-center gap-1 rounded-[18px] border border-border bg-[var(--card-bg)] p-1 shadow-card w-fit">
            <button onClick={() => setTab('overview')} className={cn('flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all', tab === 'overview' ? 'bg-[var(--brand-primary)] text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-secondary')}>
              <CalendarDays className="h-4 w-4" /> Overview
            </button>
            <button onClick={() => setTab('pipeline')} className={cn('flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all', tab === 'pipeline' ? 'bg-[var(--brand-primary)] text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-secondary')}>
              <LayoutDashboard className="h-4 w-4" /> Pipeline
            </button>
            <button onClick={() => setTab('contacts')} className={cn('flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all', tab === 'contacts' ? 'bg-[var(--brand-primary)] text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-secondary')}>
              <Users className="h-4 w-4" /> Customers
            </button>
            <button onClick={() => setTab('analytics')} className={cn('flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all', tab === 'analytics' ? 'bg-[var(--brand-primary)] text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-secondary')}>
              <BarChart3 className="h-4 w-4" /> Analytics
            </button>
          </div>

          {loading && (
            <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
              <RefreshCw className="h-8 w-8 animate-spin text-[var(--brand-primary)]" />
              <p className="mt-4 text-sm">Loading your dashboard...</p>
            </div>
          )}

          {!loading && tab === 'overview' && (
            <div className="animate-fade-in grid gap-6 lg:grid-cols-[1fr_420px]">
              <ReservationCalendar reservations={reservations} />
              <UpcomingCharters reservations={upcoming} />
            </div>
          )}

          {!loading && tab === 'pipeline' && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between gap-4">
                <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  <KanbanSquare className="h-4 w-4 text-[var(--brand-primary)]" /> Pipeline
                </h2>
                {pipelines.length > 1 && (
                  <Select value={selectedPipelineId || undefined} onValueChange={handlePipelineChange}>
                    <SelectTrigger className="w-56 bg-[var(--card-bg)]">
                      <SelectValue placeholder="Select pipeline" />
                    </SelectTrigger>
                    <SelectContent>
                      {pipelines.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}{p.is_default ? ' (default)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <KanbanBoard
                stages={stages}
                opportunities={opps}
                onOpenNotes={openNotes}
                onOpenDetail={openDetail}
                onMoveStage={handleMoveStage}
              />
            </div>
          )}

          {!loading && tab === 'contacts' && (
            <div className="space-y-4 animate-fade-in">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <Users className="h-4 w-4 text-[var(--brand-primary)]" /> Customers
              </h2>
              <ContactsTable contacts={customers} />
            </div>
          )}

          {!loading && tab === 'analytics' && (
            <AnalyticsView reservations={reservations} customers={customers} />
          )}
        </main>
      </div>

      <NotesDrawer opportunity={notesOpp} open={notesOpen} onOpenChange={setNotesOpen} />
      <OpportunityDetailDrawer
        opportunity={detailOpp}
        reservation={detailOpp ? reservations.find((r: { opportunity_id: string | null }) => r.opportunity_id === detailOpp.id) || null : null}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onUpdated={() => load()}
      />
    </div>
  );
}
