'use client';

import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Phone, MessageSquare, Mail, Loader2,
  Calendar, Clock, Anchor, User, DollarSign,
  Tag, AlertCircle, RotateCcw, Ban,
} from 'lucide-react';
import { cancelReservation, reactivateReservation } from '@/lib/services/reservation-service';
import { formatCurrency, formatDate } from '@/lib/format';
import { getReservationStartDate, getReservationEndDate, getReservationVessel } from '@/lib/reservation-utils';
import { ReservationTimeline } from '@/components/dashboard/reservation-timeline';
import { useAuth } from '@/lib/auth';
import type { Opportunity } from '@/lib/types';
import type { NormalizedReservation } from '@/lib/reservation-utils';

type OpportunityDetailDrawerProps = {
  opportunity: Opportunity | null;
  reservation: NormalizedReservation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
};

function formatTime(date: Date | null): string {
  if (!date) return '—';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function sanitizePhone(phone: string | null): string {
  if (!phone) return '';
  return phone.replace(/[^+\d]/g, '');
}

export function OpportunityDetailDrawer({
  opportunity,
  reservation,
  open,
  onOpenChange,
  onUpdated,
}: OpportunityDetailDrawerProps) {
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const { role, tenant: authTenant } = useAuth();

  if (!opportunity) return null;

  const phone = opportunity.customer?.phone || reservation?.client_phone || null;
  const email = opportunity.customer?.email || reservation?.client_email || null;
  const cleanPhone = sanitizePhone(phone);
  const whatsappPhone = cleanPhone.replace(/^\+/, '');
  const reservationId = reservation?.id || opportunity.id;
  const vessel = getReservationVessel(reservation || ({} as NormalizedReservation));
  const startDate = getReservationStartDate(reservation || ({} as NormalizedReservation));
  const endDate = getReservationEndDate(reservation || ({} as NormalizedReservation));
  const customerName = opportunity.customer?.full_name || reservation?.client_name || opportunity.name;
  const bookingStatus = reservation?.booking_status || null;
  const paymentStatus = reservation?.payment_status || null;
  const totalAmount = reservation?.total_amount || opportunity.monetary_value || 0;
  const isCancelled = bookingStatus === 'cancelled';

  async function handleCancel() {
    if (!reservation) {
      setError('No reservation linked to this opportunity');
      return;
    }
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);

    const result = await cancelReservation(
      reservation.id,
      cancellationReason.trim() || null,
      null,
      'Tenant Admin'
    );

    setActionLoading(false);
    if (result.success) {
      setSuccessMsg('Reservation cancelled successfully');
      setShowCancelForm(false);
      setCancellationReason('');
      onUpdated();
      setTimeout(() => setSuccessMsg(null), 3000);
    } else {
      setError(result.error || 'Failed to cancel reservation');
    }
  }

  async function handleReactivate() {
    if (!reservation) {
      setError('No reservation linked to this opportunity');
      return;
    }
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);

    const result = await reactivateReservation(
      reservation.id,
      null,
      'Tenant Admin'
    );

    setActionLoading(false);
    if (result.success) {
      setSuccessMsg('Reservation reactivated successfully');
      onUpdated();
      setTimeout(() => setSuccessMsg(null), 3000);
    } else {
      setError(result.error || 'Failed to reactivate reservation');
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full border-l-border bg-[var(--card-bg)] sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-foreground">{customerName}</SheetTitle>
          <SheetDescription className="text-muted-foreground">
            {opportunity.name}
          </SheetDescription>
        </SheetHeader>

        {successMsg && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm text-success">
            <AlertCircle className="h-4 w-4" /> {successMsg}
          </div>
        )}

        <div className="mt-4 grid grid-cols-3 gap-2">
          <a
            href={cleanPhone ? `tel:${cleanPhone}` : undefined}
            className={`flex flex-col items-center gap-1.5 rounded-[18px] border border-border bg-[var(--card-bg)] py-3 text-xs font-medium transition-colors ${cleanPhone ? 'hover:bg-[var(--brand-primary)]/5 hover:border-[var(--brand-primary)]/20 text-[var(--brand-primary)]' : 'opacity-40 pointer-events-none text-muted-foreground'}`}
          >
            <Phone className="h-5 w-5" /> Call
          </a>
          <a
            href={whatsappPhone ? `https://wa.me/${whatsappPhone}` : undefined}
            target="_blank" rel="noopener noreferrer"
            className={`flex flex-col items-center gap-1.5 rounded-[18px] border border-border bg-[var(--card-bg)] py-3 text-xs font-medium transition-colors ${whatsappPhone ? 'hover:bg-success/5 hover:border-success/20 text-success' : 'opacity-40 pointer-events-none text-muted-foreground'}`}
          >
            <MessageSquare className="h-5 w-5" /> WhatsApp
          </a>
          <a
            href={email ? `mailto:${email}` : undefined}
            className={`flex flex-col items-center gap-1.5 rounded-[18px] border border-border bg-[var(--card-bg)] py-3 text-xs font-medium transition-colors ${email ? 'hover:bg-warning/5 hover:border-warning/20 text-warning' : 'opacity-40 pointer-events-none text-muted-foreground'}`}
          >
            <Mail className="h-5 w-5" /> Email
          </a>
        </div>

        <div className="mt-6 rounded-[18px] border border-border bg-[var(--card-bg)] p-4 shadow-card">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Reservation Details
          </h3>
          <div className="space-y-3">
            <DetailRow icon={Tag} label="Reference" value={reservation?.booking_reference || reservationId.substring(0, 8)} />
            <DetailRow icon={User} label="Client" value={customerName} />
            <DetailRow icon={Anchor} label="Vessel" value={vessel || 'Not assigned'} />
            <DetailRow icon={Calendar} label="Date" value={startDate ? formatDate(startDate.toISOString()) : '—'} />
            <DetailRow icon={Clock} label="Start" value={formatTime(startDate)} />
            <DetailRow icon={Clock} label="End" value={formatTime(endDate)} />
            <DetailRow icon={Mail} label="Email" value={email || '—'} />
            <DetailRow icon={Phone} label="Phone" value={phone || '—'} />
            <DetailRow icon={DollarSign} label="Value" value={formatCurrency(totalAmount)} />
          </div>
        </div>

        {isCancelled && (
          <div className="mt-4 rounded-[18px] border border-warning/20 bg-warning/10 p-3">
            <p className="text-xs font-medium text-warning">
              This reservation was cancelled{reservation?.cancellation_reason ? `: ${reservation.cancellation_reason}` : ''}.
            </p>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <div className="mt-6 border-t border-border pt-4 space-y-3">
          {!isCancelled && reservation && (
            <>
              {!showCancelForm ? (
                <Button
                  onClick={() => setShowCancelForm(true)}
                  variant="outline"
                  className="w-full border-warning/30 text-warning hover:bg-warning/5"
                >
                  <Ban className="mr-2 h-4 w-4" /> Cancel Reservation
                </Button>
              ) : (
                <div className="space-y-3 rounded-[18px] border border-border bg-[var(--card-bg)] p-4">
                  <h4 className="text-sm font-semibold text-foreground">Cancel this reservation?</h4>
                  <p className="text-xs text-muted-foreground">
                    The reservation will be marked as cancelled. All records are preserved.
                    The time slot will be released for new bookings.
                  </p>
                  <Textarea
                    placeholder="Reason for cancellation (optional)"
                    value={cancellationReason}
                    onChange={(e) => setCancellationReason(e.target.value)}
                    rows={2}
                    className="resize-none bg-[var(--card-bg)]"
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => { setShowCancelForm(false); setCancellationReason(''); }}
                      className="flex-1 border-border bg-[var(--card-bg)]"
                    >
                      Dismiss
                    </Button>
                    <Button
                      onClick={handleCancel}
                      disabled={actionLoading}
                      className="flex-1 bg-warning text-white hover:bg-warning/90"
                    >
                      {actionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}
                      Confirm Cancel
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          {isCancelled && reservation && (
            <Button
              onClick={handleReactivate}
              disabled={actionLoading}
              className="w-full bg-[var(--brand-primary)] text-primary-foreground hover:bg-[var(--brand-hover)]"
            >
              {actionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
              Reactivate Reservation
            </Button>
          )}

          {reservation && (
            <div className="mt-6 border-t border-border pt-4">
              <h3 className="text-sm font-semibold text-foreground mb-2">Activity Timeline</h3>
              <ReservationTimeline
                reservationId={reservation.id}
                tenantId={reservation.tenant_id || authTenant?.id || ''}
                isSuperAdmin={role === 'super_admin'}
              />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}
