'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/lib/format';
import {
  Clock, CheckCircle2, XCircle, AlertCircle, DollarSign,
  Calendar, CreditCard, RotateCcw, Loader2, FileText, Anchor,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type TimelineEntry = {
  id: string;
  entry_type: 'event' | 'activity' | 'payment';
  title: string;
  description: string | null;
  occurred_at: string;
  actor_name: string | null;
  source: string | null;
  amount: number | null;
  currency: string | null;
  payment_status: string | null;
  payment_type: string | null;
  provider_name: string | null;
  provider_reference: string | null;
  environment: string | null;
  icon_type: string;
  category: string;
};

type PaymentRecord = {
  id: string;
  payment_type: string;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  environment: string;
  provider_payment_id: string | null;
  provider_charge_id: string | null;
  provider_refund_id: string | null;
  refunded_amount: number | null;
  failure_code: string | null;
  failure_reason: string | null;
  platform_fee_amount: number | null;
  created_at: string;
};

type ReservationTimelineProps = {
  reservationId: string;
  tenantId: string;
  isSuperAdmin?: boolean;
};

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  booking_hold_created: Calendar,
  booking_request_submitted: FileText,
  checkout_created: CreditCard,
  payment_processing: Loader2,
  payment_succeeded: CheckCircle2,
  deposit_paid: DollarSign,
  full_payment_received: DollarSign,
  reservation_confirmed: CheckCircle2,
  opportunity_created: Anchor,
  pipeline_stage_changed: AlertCircle,
  payment_failed: XCircle,
  reservation_expired: Clock,
  reservation_cancelled: XCircle,
  refund_requested: RotateCcw,
  partial_refund: RotateCcw,
  full_refund: RotateCcw,
  waiver_signed: FileText,
  reservation_started: Anchor,
  reservation_completed: CheckCircle2,
  default: Clock,
};

export function ReservationTimeline({ reservationId, tenantId, isSuperAdmin }: ReservationTimelineProps) {
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'timeline' | 'payments'>('timeline');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [{ data: timelineData }, { data: paymentData }] = await Promise.all([
          supabase.rpc('get_reservation_timeline', {
            p_reservation_id: reservationId,
            p_tenant_id: tenantId,
          }),
          supabase
            .from('payments')
            .select('id, payment_type, amount, currency, status, provider, environment, provider_payment_id, provider_charge_id, provider_refund_id, refunded_amount, failure_code, failure_reason, platform_fee_amount, created_at')
            .eq('reservation_id', reservationId)
            .order('created_at', { ascending: false }),
        ]);

        if (timelineData) setTimeline(timelineData as TimelineEntry[]);
        if (paymentData) setPayments(paymentData as PaymentRecord[]);
      } catch {
        // Silent fail — timeline is supplementary
      }
      setLoading(false);
    }
    load();
  }, [reservationId, tenantId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/30 p-1">
        <button
          onClick={() => setActiveTab('timeline')}
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            activeTab === 'timeline' ? 'bg-[var(--card-bg)] text-foreground shadow-sm' : 'text-muted-foreground'
          )}
        >
          Timeline
        </button>
        <button
          onClick={() => setActiveTab('payments')}
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            activeTab === 'payments' ? 'bg-[var(--card-bg)] text-foreground shadow-sm' : 'text-muted-foreground'
          )}
        >
          Payment History
        </button>
      </div>

      {activeTab === 'timeline' && (
        <div className="mt-4 space-y-3">
          {timeline.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">No timeline events yet.</p>
          ) : (
            timeline.map((entry) => {
              const Icon = ICON_MAP[entry.icon_type] || ICON_MAP.default;
              const isPositive = ['payment_succeeded', 'deposit_paid', 'full_payment_received', 'reservation_confirmed', 'reservation_completed', 'waiver_signed', 'booking_hold_created', 'booking_request_submitted', 'opportunity_created'].includes(entry.icon_type);
              const isNegative = ['payment_failed', 'reservation_cancelled', 'reservation_expired'].includes(entry.icon_type);
              const isNeutral = ['refund_requested', 'partial_refund', 'full_refund', 'pipeline_stage_changed', 'checkout_created', 'payment_processing', 'reservation_started'].includes(entry.icon_type);

              return (
                <div key={entry.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                      isPositive && 'bg-success/10',
                      isNegative && 'bg-destructive/10',
                      isNeutral && 'bg-[var(--brand-primary)]/10',
                    )}>
                      <Icon className={cn(
                        'h-4 w-4',
                        isPositive && 'text-success',
                        isNegative && 'text-destructive',
                        isNeutral && 'text-[var(--brand-primary)]',
                      )} />
                    </div>
                    {timeline.indexOf(entry) < timeline.length - 1 && (
                      <div className="w-px flex-1 bg-border" />
                    )}
                  </div>
                  <div className="flex-1 pb-4">
                    <p className="text-sm font-medium text-foreground">{entry.title}</p>
                    {entry.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{entry.description}</p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                      <span>{formatDate(entry.occurred_at)}</span>
                      <span>{new Date(entry.occurred_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                      {entry.actor_name && <span>by {entry.actor_name}</span>}
                      {entry.source && <span className="italic">{entry.source}</span>}
                    </div>
                    {entry.amount != null && entry.amount > 0 && (
                      <p className="mt-1 text-xs font-medium text-foreground">
                        {formatCurrency(entry.amount)} {entry.currency || ''}
                        {entry.payment_type && <span className="text-muted-foreground"> ({entry.payment_type})</span>}
                      </p>
                    )}
                    {entry.provider_reference && isSuperAdmin && (
                      <p className="mt-0.5 text-[10px] text-muted-foreground">Ref: {entry.provider_reference}</p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === 'payments' && (
        <div className="mt-4 space-y-3">
          {payments.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">No payment records yet.</p>
          ) : (
            payments.map((payment) => (
              <div key={payment.id} className="rounded-[18px] border border-border bg-[var(--card-bg)] p-3 shadow-card">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground capitalize">
                      {payment.payment_type.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <span className={cn(
                    'rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize',
                    payment.status === 'succeeded' && 'border-success/20 bg-success/10 text-success',
                    payment.status === 'failed' && 'border-destructive/20 bg-destructive/10 text-destructive',
                    payment.status === 'refunded' && 'border-accent/20 bg-accent/10 text-accent',
                    payment.status === 'partially_refunded' && 'border-warning/20 bg-warning/10 text-warning',
                    payment.status === 'pending' && 'border-[var(--brand-primary)]/20 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]',
                    payment.status === 'processing' && 'border-[var(--brand-primary)]/20 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]',
                    payment.status === 'cancelled' && 'border-border bg-secondary text-muted-foreground',
                  )}>
                    {payment.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="mt-2 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="font-medium text-foreground">{formatCurrency(payment.amount)} {payment.currency}</span>
                  </div>
                  {payment.refunded_amount != null && payment.refunded_amount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Refunded</span>
                      <span className="font-medium text-warning">{formatCurrency(payment.refunded_amount)} {payment.currency}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Provider</span>
                    <span className="font-medium text-foreground capitalize">{payment.provider} ({payment.environment})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Date</span>
                    <span className="font-medium text-foreground">{formatDate(payment.created_at)}</span>
                  </div>
                  {isSuperAdmin && payment.platform_fee_amount != null && payment.platform_fee_amount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Platform Fee</span>
                      <span className="font-medium text-foreground">{formatCurrency(payment.platform_fee_amount)} {payment.currency}</span>
                    </div>
                  )}
                  {isSuperAdmin && payment.provider_charge_id && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Charge ID</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{payment.provider_charge_id}</span>
                    </div>
                  )}
                  {payment.failure_reason && (
                    <div className="mt-1 rounded-lg border border-destructive/20 bg-destructive/10 px-2 py-1 text-[10px] text-destructive">
                      {payment.failure_reason}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
