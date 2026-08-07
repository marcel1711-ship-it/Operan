'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  DollarSign, CreditCard, Calendar, AlertCircle, Loader2,
  TrendingUp, Clock, CheckCircle2, XCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type Invoice = {
  id: string;
  tenant_id: string;
  amount: number;
  status: string;
  due_date: string;
  paid_at: string | null;
  description: string | null;
  created_at: string;
  tenants: { name: string }[] | null;
};

type BillingStats = {
  mrr: number;
  paidThisMonth: number;
  pendingInvoices: number;
  upcomingRenewals: number;
  failedPayments: number;
};

export default function BillingPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<BillingStats | null>(null);

  const load = useCallback(async () => {
    setLoading(true);

    const [invRes, tenantRes] = await Promise.all([
      supabase
        .from('invoices')
        .select('id, tenant_id, amount, status, due_date, paid_at, description, created_at, tenants(name)')
        .order('due_date', { ascending: false }),
      supabase
        .from('tenants')
        .select('id, name, plan, status, monthly_amount, next_renewal_at, last_payment_at, stripe_account_id')
        .order('name', { ascending: true }),
    ]);

    const invData = (invRes.data as Invoice[]) || [];
    const tenantData = tenantRes.data || [];
    setInvoices(invData);
    setTenants(tenantData);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const mrr = tenantData
      .filter((t: any) => t.status === 'active' || t.status === 'trial')
      .reduce((s: number, t: any) => s + (Number(t.monthly_amount) || 0), 0);

    const paidThisMonth = invData
      .filter(i => i.status === 'paid' && i.paid_at && new Date(i.paid_at) >= startOfMonth)
      .reduce((s, i) => s + (Number(i.amount) || 0), 0);

    const pendingInvoices = invData.filter(i => i.status === 'pending').length;
    const upcomingRenewals = tenantData.filter((t: any) =>
      t.next_renewal_at && new Date(t.next_renewal_at) > now &&
      new Date(t.next_renewal_at) < new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    ).length;
    const failedPayments = invData.filter(i => i.status === 'failed').length;

    setStats({ mrr, paidThisMonth, pendingInvoices, upcomingRenewals, failedPayments });
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !stats) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--panel-bg)]">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--brand-primary)]" />
      </div>
    );
  }

  const cards = [
    {
      label: 'Total MRR',
      value: `$${stats.mrr.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      sub: 'Monthly recurring',
      icon: DollarSign,
      iconBg: 'bg-[rgba(99,119,255,0.10)]',
      iconColor: 'text-[var(--brand-primary)]',
    },
    {
      label: 'Paid This Month',
      value: `$${stats.paidThisMonth.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      sub: `${stats.pendingInvoices} pending`,
      icon: TrendingUp,
      iconBg: 'bg-[rgba(74,222,128,0.12)]',
      iconColor: 'text-[#86EFAC]',
    },
    {
      label: 'Upcoming Renewals',
      value: stats.upcomingRenewals,
      sub: 'Next 7 days',
      icon: Clock,
      iconBg: 'bg-[rgba(99,119,255,0.15)]',
      iconColor: 'text-[var(--brand-primary)]',
    },
    {
      label: 'Failed Payments',
      value: stats.failedPayments,
      sub: 'Needs attention',
      icon: AlertCircle,
      iconBg: stats.failedPayments > 0 ? 'bg-[rgba(251,113,133,0.12)]' : 'bg-[var(--panel-bg)]',
      iconColor: stats.failedPayments > 0 ? 'text-destructive' : 'text-[var(--text-muted)]',
    },
  ];

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Billing</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Revenue, invoices, and subscription management</p>
      </header>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-[18px] border border-[var(--border-default)] bg-[var(--card-bg)] p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', card.iconBg)}>
                <card.icon className={cn('h-5 w-5', card.iconColor)} />
              </div>
              <span className="text-xs font-medium text-[var(--text-muted)]">{card.label}</span>
            </div>
            <p className="mt-4 text-2xl font-bold text-[var(--text-primary)]">{card.value}</p>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Two columns */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* Upcoming renewals */}
        <div className="rounded-[18px] border border-[var(--border-default)] bg-[var(--card-bg)] p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <Calendar className="h-4 w-4 text-[var(--brand-primary)]" />
            Subscription Renewals
          </h2>
          <div className="space-y-3">
            {tenants.filter((t: any) => t.status === 'active' || t.status === 'trial').map((t: any) => (
              <div key={t.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[rgba(99,119,255,0.10)] text-xs font-bold text-[var(--brand-primary)]">
                    {t.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{t.name}</p>
                    <div className="flex items-center gap-2">
                      <Badge className="border-0 bg-[var(--panel-bg)] text-[10px] capitalize text-[var(--text-secondary)]">{t.plan}</Badge>
                      <span className="text-[11px] text-[var(--text-muted)]">
                        ${Number(t.monthly_amount || 0).toFixed(2)}/mo
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[var(--text-muted)]">
                    {t.next_renewal_at ? new Date(t.next_renewal_at).toLocaleDateString() : '—'}
                  </p>
                  {t.stripe_account_id && (
                    <Badge className="border-0 bg-[rgba(99,119,255,0.15)] text-[9px] text-[var(--brand-primary)]">Stripe</Badge>
                  )}
                </div>
              </div>
            ))}
            {tenants.filter((t: any) => t.status === 'active' || t.status === 'trial').length === 0 && (
              <p className="text-sm text-[var(--text-muted)]">No active subscriptions</p>
            )}
          </div>
        </div>

        {/* Recent invoices */}
        <div className="rounded-[18px] border border-[var(--border-default)] bg-[var(--card-bg)] p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <CreditCard className="h-4 w-4 text-[var(--brand-primary)]" />
            Recent Invoices
          </h2>
          <div className="space-y-3">
            {invoices.slice(0, 8).map((inv) => (
              <div key={inv.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {inv.status === 'paid' ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : inv.status === 'failed' ? (
                    <XCircle className="h-4 w-4 text-destructive" />
                  ) : (
                    <Clock className="h-4 w-4 text-warning" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      {inv.tenants?.[0]?.name || 'Unknown'}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      Due {new Date(inv.due_date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    ${Number(inv.amount).toFixed(2)}
                  </p>
                  <Badge className={cn(
                    'border-0 text-[9px]',
                    inv.status === 'paid' && 'bg-[rgba(74,222,128,0.12)] text-[#86EFAC]',
                    inv.status === 'pending' && 'bg-[rgba(251,191,36,0.12)] text-[#FCD34D]',
                    inv.status === 'failed' && 'bg-[rgba(251,113,133,0.12)] text-[#FB7185]',
                  )}>
                    {inv.status}
                  </Badge>
                </div>
              </div>
            ))}
            {invoices.length === 0 && (
              <p className="text-sm text-[var(--text-muted)]">No invoices yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Stripe integration status */}
      <div className="mt-6 rounded-[18px] border border-[var(--border-default)] bg-[var(--card-bg)] p-5 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <CreditCard className="h-4 w-4 text-[var(--brand-primary)]" />
          Stripe Integration
        </h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-[var(--text-primary)]">
              {tenants.some((t: any) => t.stripe_account_id)
                ? 'Some tenants have Stripe connected'
                : 'No tenants have Stripe connected yet'}
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Connect Stripe in Settings to enable automated billing and subscription management.
            </p>
          </div>
          <Badge className={cn(
            'border-0',
            tenants.some((t: any) => t.stripe_account_id)
              ? 'bg-[rgba(74,222,128,0.12)] text-[#86EFAC]'
              : 'bg-[var(--panel-bg)] text-[var(--text-muted)]'
          )}>
            {tenants.some((t: any) => t.stripe_account_id) ? 'Active' : 'Not Connected'}
          </Badge>
        </div>
      </div>
    </div>
  );
}
