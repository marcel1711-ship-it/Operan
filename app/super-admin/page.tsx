'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Building2, Calendar, TrendingUp, Users, DollarSign,
  AlertTriangle, Loader2, ArrowUpRight, ArrowDownRight,
  Activity, Shield,
} from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type Tenant = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  monthly_amount: number;
  created_at: string;
  is_active: boolean;
};

type DashboardStats = {
  totalTenants: number;
  activeTenants: number;
  trialTenants: number;
  cancelledTenants: number;
  newThisMonth: number;
  mrr: number;
  totalBookings: number;
  churnRate: number;
};

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    const { data: tenantData } = await supabase
      .from('tenants')
      .select('id, name, slug, plan, status, monthly_amount, created_at, is_active')
      .order('created_at', { ascending: false });

    const tenantsList = (tenantData as Tenant[]) || [];
    setTenants(tenantsList);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const activeTenants = tenantsList.filter(t => t.status === 'active').length;
    const trialTenants = tenantsList.filter(t => t.status === 'trial').length;
    const cancelledTenants = tenantsList.filter(t => t.status === 'cancelled').length;
    const newThisMonth = tenantsList.filter(t => new Date(t.created_at) >= startOfMonth).length;
    const mrr = tenantsList
      .filter(t => t.status === 'active' || t.status === 'trial')
      .reduce((sum, t) => sum + (Number(t.monthly_amount) || 0), 0);

    const cancelledLastMonth = tenantsList.filter(t => {
      if (t.status !== 'cancelled') return false;
      return new Date(t.created_at) < startOfLastMonth;
    }).length;
    const activeLastMonth = tenantsList.filter(t => {
      return new Date(t.created_at) < startOfMonth && t.status !== 'cancelled';
    }).length;
    const churnRate = activeLastMonth > 0 ? (cancelledLastMonth / activeLastMonth) * 100 : 0;

    const { count: bookingCount } = await supabase
      .from('reservations')
      .select('*', { count: 'exact', head: true });

    setStats({
      totalTenants: tenantsList.length,
      activeTenants,
      trialTenants,
      cancelledTenants,
      newThisMonth,
      mrr,
      totalBookings: bookingCount || 0,
      churnRate,
    });

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !stats) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--brand-primary)]" />
      </div>
    );
  }

  const statCards = [
    {
      label: 'Active Tenants',
      value: stats.activeTenants,
      sub: `${stats.totalTenants} total`,
      icon: Building2,
      iconBg: 'bg-[rgba(99,119,255,0.10)]',
      iconColor: 'text-[var(--brand-primary)]',
      trend: `${stats.newThisMonth} new this month`,
      trendUp: true,
    },
    {
      label: 'MRR',
      value: `$${stats.mrr.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      sub: 'Monthly recurring revenue',
      icon: DollarSign,
      iconBg: 'bg-[rgba(74,222,128,0.12)]',
      iconColor: 'text-[#86EFAC]',
      trend: `${stats.trialTenants} on trial`,
      trendUp: true,
    },
    {
      label: 'Total Bookings',
      value: stats.totalBookings,
      sub: 'Across all tenants',
      icon: Calendar,
      iconBg: 'bg-[rgba(99,119,255,0.10)]',
      iconColor: 'text-[var(--brand-primary)]',
      trend: 'All time',
      trendUp: true,
    },
    {
      label: 'Churn Rate',
      value: `${stats.churnRate.toFixed(1)}%`,
      sub: `${stats.cancelledTenants} cancelled`,
      icon: AlertTriangle,
      iconBg: stats.churnRate > 5 ? 'bg-[rgba(251,113,133,0.10)]' : 'bg-[rgba(251,191,36,0.10)]',
      iconColor: stats.churnRate > 5 ? 'text-destructive' : 'text-warning',
      trend: stats.churnRate > 5 ? 'Above target' : 'Within target',
      trendUp: stats.churnRate < 5,
    },
  ];

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Platform overview and key metrics</p>
      </header>

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="rounded-[18px] border border-border bg-[var(--card-bg)] p-5 shadow-card transition-shadow duration-200 hover:shadow-card-hover"
          >
            <div className="flex items-center gap-3">
              <div className={cn('flex h-10 w-10 items-center justify-center rounded-[18px] border border-border bg-secondary', card.iconColor)}>
                <card.icon className={cn('h-[18px] w-[18px]', card.iconColor)} />
              </div>
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{card.label}</span>
            </div>
            <p className="mt-4 text-2xl font-semibold tracking-tight text-foreground">{card.value}</p>
            <div className="mt-2 flex items-center gap-1.5">
              {card.trendUp ? (
                <ArrowUpRight className="h-3.5 w-3.5 text-success" />
              ) : (
                <ArrowDownRight className="h-3.5 w-3.5 text-destructive" />
              )}
              <span className="text-xs text-muted-foreground">{card.trend}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Quick links */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/super-admin/worker-health" className="inline-flex items-center gap-1.5 rounded-[18px] border border-border bg-[var(--card-bg)] px-3 py-1.5 text-xs font-medium text-foreground shadow-card transition-colors hover:border-[rgba(99,119,255,0.34)] hover:bg-[rgba(99,119,255,0.05)]">
          <Activity className="h-3.5 w-3.5 text-[var(--brand-primary)]" />
          Worker Health
        </Link>
      </div>

      {/* Two column layout */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* Recent tenants */}
        <div className="rounded-[18px] border border-border bg-[var(--card-bg)] p-6 shadow-card">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Users className="h-4 w-4 text-[var(--brand-primary)]" />
            Recent Tenants
          </h2>
          <div className="space-y-3">
            {tenants.slice(0, 6).map((t) => (
              <div key={t.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-[18px] border border-border bg-secondary text-xs font-semibold text-[var(--brand-primary)]">
                    {t.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{t.name}</p>
                    <p className="text-2xs text-muted-foreground">
                      {new Date(t.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={t.status === 'active' ? 'success' : t.status === 'trial' ? 'info' : t.status === 'suspended' ? 'warning' : 'destructive'}>
                    {t.status}
                  </Badge>
                  <Badge variant="secondary" className="capitalize">
                    {t.plan}
                  </Badge>
                </div>
              </div>
            ))}
            {tenants.length === 0 && (
              <p className="text-sm text-muted-foreground">No tenants yet</p>
            )}
          </div>
        </div>

        {/* Plan distribution */}
        <div className="rounded-[18px] border border-border bg-[var(--card-bg)] p-6 shadow-card">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <TrendingUp className="h-4 w-4 text-[var(--brand-primary)]" />
            Plan Distribution
          </h2>
          <div className="space-y-4">
            {(['starter', 'pro', 'enterprise'] as const).map((plan) => {
              const count = tenants.filter(t => t.plan === plan).length;
              const pct = tenants.length > 0 ? (count / tenants.length) * 100 : 0;
              const revenue = tenants
                .filter(t => t.plan === plan && (t.status === 'active' || t.status === 'trial'))
                .reduce((s, t) => s + (Number(t.monthly_amount) || 0), 0);
              return (
                <div key={plan}>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-medium capitalize text-foreground">{plan}</span>
                    <span className="text-muted-foreground">{count} tenants · ${revenue}/mo</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-500',
                        plan === 'starter' && 'bg-[var(--brand-primary)]',
                        plan === 'pro' && 'bg-accent',
                        plan === 'enterprise' && 'bg-foreground',
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 border-t border-border pt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total MRR</span>
              <span className="font-semibold text-foreground">
                ${stats.mrr.toLocaleString(undefined, { minimumFractionDigits: 2 })}/mo
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Annual Run Rate</span>
              <span className="font-semibold text-[var(--brand-primary)]">
                ${(stats.mrr * 12).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
