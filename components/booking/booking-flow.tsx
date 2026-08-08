'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Loader2, Calendar, Clock, Check, ArrowLeft, ArrowRight,
  AlertCircle, Info, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useEmbedPostMessage } from '@/hooks/use-embed-postmessage';

export type BookingTenant = {
  id: string; name: string; slug: string;
  primary_color: string; secondary_color: string;
  logo_url: string | null;
};

export type BookingListing = {
  id: string; name: string; slug: string;
  short_description: string | null; full_description: string | null;
  photos: string[]; capacity: number; minimum_guests: number;
  currency: string; timezone: string; location: string | null;
  boat_type: string | null; year: number | null; amenities: string[];
  payment_mode: string; deposit_type: string; deposit_percentage: number;
  hold_duration_minutes: number; tax_percentage: number;
  cancellation_policy_text: string | null;
  customer_instructions: string | null;
  meeting_instructions: string | null;
  online_booking_enabled: boolean;
  instant_booking: boolean; requires_approval: boolean;
  maximum_advance_days: number;
  minimum_notice_hours: number;
};

export type BookingPricingOption = {
  id: string; name: string; duration_minutes: number;
  base_price: number; pricing_type: string;
  minimum_guests: number | null; maximum_guests: number | null;
  included_guests: number; price_per_additional_guest: number;
  start_time_restriction: string | null;
};

type Slot = { start: string; start_utc: string; end: string; end_utc: string };

type PriceBreakdown = {
  base_amount: number; guest_adjustment: number; subtotal_amount: number;
  service_fee_amount: number; tax_amount: number; total_amount: number;
  deposit_amount: number; amount_due_now: number; balance_due: number;
  currency: string; pricing_option_name: string; duration_minutes: number;
  payment_mode: string; deposit_type: string; deposit_percentage: number;
  balance_due_timing: string;
};

type BookingStep = 'package' | 'datetime' | 'details' | 'review' | 'success';

export type BookingResult = {
  booking_reference: string;
  booking_status: string;
  expires_at: string;
  reservation_id?: string;
};

export function BookingFlow({
  tenant,
  listing,
  pricingOptions,
  isEmbed,
  onBookingComplete,
}: {
  tenant: BookingTenant;
  listing: BookingListing;
  pricingOptions: BookingPricingOption[];
  isEmbed: boolean;
  onBookingComplete?: (result: BookingResult) => void;
}) {
  const { sendStepChanged, sendBookingCompleted } = useEmbedPostMessage(isEmbed);

  const [step, setStep] = useState<BookingStep>('package');
  const [selectedOption, setSelectedOption] = useState<BookingPricingOption | null>(null);
  const [guestCount, setGuestCount] = useState(1);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [price, setPrice] = useState<PriceBreakdown | null>(null);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [customer, setCustomer] = useState({ name: '', email: '', phone: '', notes: '' });
  const [honeypot, setHoneypot] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [tenantCanAcceptPayments, setTenantCanAcceptPayments] = useState(false);
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  // Check payment capability
  useEffect(() => {
    (async () => {
      const { data: paymentConn } = await supabase
        .from('tenant_integrations')
        .select('connection_status, enabled, capabilities')
        .eq('tenant_id', tenant.id)
        .eq('category', 'payments')
        .eq('is_default', true)
        .maybeSingle();
      setTenantCanAcceptPayments(
        paymentConn?.connection_status === 'connected' &&
        paymentConn?.enabled === true &&
        (paymentConn?.capabilities as Record<string, unknown>)?.charges_enabled === true
      );
    })();
  }, [tenant.id]);

  // Notify parent of step changes
  const goToStep = useCallback((newStep: BookingStep) => {
    setStep(newStep);
    sendStepChanged(newStep);
  }, [sendStepChanged]);

  // Load slots when date changes
  useEffect(() => {
    if (!selectedDate || !selectedOption || !tenant || !listing) return;
    setLoadingSlots(true);
    setSelectedSlot(null);
    supabase.rpc('check_rate_limit', {
      p_identifier: 'public',
      p_endpoint: '/availability',
      p_max_requests: 30,
      p_window_minutes: 1,
    }).then(({ data: rlData }) => {
      if (rlData && !rlData.allowed) { setRateLimited(true); setLoadingSlots(false); return; }
      setRateLimited(false);
      supabase.rpc('get_public_availability', {
        p_tenant_slug: tenant.slug,
        p_listing_slug: listing.slug,
        p_pricing_option_id: selectedOption.id,
        p_date: selectedDate,
      }).then(({ data }) => {
        setSlots(data?.slots || []);
        setLoadingSlots(false);
      });
    });
  }, [selectedDate, selectedOption, tenant, listing]);

  // Calculate price
  useEffect(() => {
    if (!selectedOption || !listing) return;
    setLoadingPrice(true);
    supabase.rpc('check_rate_limit', {
      p_identifier: 'public',
      p_endpoint: '/price-calc',
      p_max_requests: 30,
      p_window_minutes: 1,
    }).then(({ data: rlData }) => {
      if (rlData && !rlData.allowed) { setPrice(null); setLoadingPrice(false); return; }
      supabase.rpc('calculate_booking_price', {
        p_listing_id: listing.id,
        p_pricing_option_id: selectedOption.id,
        p_guest_count: guestCount,
      }).then(({ data }) => {
        setPrice(data as PriceBreakdown);
        setLoadingPrice(false);
      });
    });
  }, [selectedOption, guestCount, listing]);

  async function submitBooking() {
    if (!listing || !selectedOption || !selectedSlot || !tenant) return;
    setSubmitting(true);
    setError(null);
    if (honeypot) { setSubmitting(false); return; }

    const { data: rlData } = await supabase.rpc('check_rate_limit', {
      p_identifier: 'public',
      p_endpoint: '/booking-submit',
      p_max_requests: 3,
      p_window_minutes: 10,
    });
    if (rlData && !rlData.allowed) {
      setError('Too many booking attempts. Please try again later.');
      setSubmitting(false);
      return;
    }

    const { data, error: rpcError } = await supabase.rpc('create_public_booking_hold', {
      p_tenant_id: tenant.id,
      p_listing_id: listing.id,
      p_pricing_option_id: selectedOption.id,
      p_client_name: customer.name,
      p_start_at: selectedSlot.start_utc,
      p_guest_count: guestCount,
      p_client_email: customer.email || null,
      p_client_phone: customer.phone || null,
      p_notes: customer.notes || null,
    });

    if (rpcError) { setError(rpcError.message); setSubmitting(false); return; }
    const result = data as { error?: string; booking_reference?: string; booking_status?: string; expires_at?: string; reservation_id?: string };
    if (result?.error) { setError(result.error); setSubmitting(false); return; }

    const booking: BookingResult = {
      booking_reference: result.booking_reference || '',
      booking_status: result.booking_status || '',
      expires_at: result.expires_at || '',
      reservation_id: result.reservation_id,
    };
    setBookingResult(booking);

    // If awaiting payment and tenant can accept payments, redirect to checkout
    if (result.booking_status === 'awaiting_payment' && tenantCanAcceptPayments && result.reservation_id) {
      try {
        const { data: tokenData, error: tokenError } = await supabase.rpc('create_booking_access_token', {
          p_reservation_id: result.reservation_id,
        });
        if (tokenError) {
          console.error('[BookingFlow] Token creation failed:', tokenError);
          throw new Error(tokenError.message);
        }
        const accessToken = (tokenData as { token?: string; error?: string })?.token || '';
        const tokenErr = (tokenData as { error?: string })?.error;
        if (tokenErr || !accessToken) {
          console.error('[BookingFlow] Token RPC returned error:', tokenErr);
          throw new Error(tokenErr || 'No token returned');
        }

        const checkoutResponse = await fetch('/api/create-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reservation_id: result.reservation_id,
            booking_reference: result.booking_reference,
            access_token: accessToken,
          }),
        });
        const checkoutData = await checkoutResponse.json();
        if (checkoutData.checkout_url) {
          window.location.href = checkoutData.checkout_url;
          return;
        }
        console.error('[BookingFlow] Checkout API error:', checkoutData);
        setError(checkoutData.error || 'Payment redirect failed. Please try again.');
        setSubmitting(false);
        return;
      } catch (err) {
        console.error('[BookingFlow] Checkout redirect failed:', err);
        setError('Payment setup failed. Please try again or contact the business.');
        setSubmitting(false);
        return;
      }
    }

    // Notify parent of completion (safe values only)
    sendBookingCompleted(
      result.reservation_id || '',
      result.booking_status || '',
      result.booking_reference || '',
    );
    onBookingComplete?.(booking);
    goToStep('success');
    setSubmitting(false);
  }

  const primary = tenant.primary_color || '#0d9488';

  // Calendar
  const firstDay = new Date(calendarMonth.year, calendarMonth.month, 1);
  const lastDay = new Date(calendarMonth.year, calendarMonth.month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startWeekday = firstDay.getDay();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const maxAdvance = listing.maximum_advance_days || 365;
  const maxDate = new Date(); maxDate.setDate(maxDate.getDate() + maxAdvance);

  function isDateAvailable(d: Date): boolean {
    if (d < today) return false;
    if (d > maxDate) return false;
    return true;
  }

  // Success step
  if (step === 'success' && bookingResult) {
    return (
      <div className={cn('p-6 text-center', isEmbed && 'p-4')}>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: `${primary}15` }}>
          <Check className="h-8 w-8" style={{ color: primary }} />
        </div>
        <h3 className="mt-4 text-lg font-bold text-foreground">
          {bookingResult.booking_status === 'pending' ? 'Request Submitted!' : 'Booking Held!'}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {bookingResult.booking_status === 'pending'
            ? 'We will review your request and get back to you soon.'
            : `Your booking is held for ${listing.hold_duration_minutes} minutes. Complete payment to confirm.`}
        </p>
        <div className="mt-4 rounded-lg bg-secondary px-4 py-3">
          <p className="text-xs text-muted-foreground">Booking Reference</p>
          <p className="text-lg font-bold text-foreground">{bookingResult.booking_reference}</p>
        </div>
        {!isEmbed && (
          <a href={`/r/${tenant.slug}`} className="mt-4 inline-flex items-center gap-1.5 text-sm hover:underline" style={{ color: primary }}>
            <ArrowLeft className="h-4 w-4" /> Back to listings
          </a>
        )}
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', isEmbed ? 'p-4' : 'p-5')}>
      {/* Step: Package selection */}
      {step === 'package' && (
        <>
          <h3 className="text-base font-bold text-foreground">Choose Your Experience</h3>
          {pricingOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No booking options available for this listing.</p>
          ) : (
            <div className="space-y-2">
              {pricingOptions.map(opt => (
                <button key={opt.id}
                  onClick={() => { setSelectedOption(opt); setGuestCount(Math.max(opt.minimum_guests || 1, listing.minimum_guests)); }}
                  className={cn('w-full rounded-xl border-2 p-3 text-left transition-all',
                    selectedOption?.id === opt.id ? 'bg-opacity-5' : 'border-border hover:border-opacity-40')}
                  style={selectedOption?.id === opt.id ? { borderColor: primary, backgroundColor: `${primary}0D` } : {}}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">{opt.name}</span>
                    <span className="text-sm font-bold text-foreground">{formatCurrency(opt.base_price, listing.currency)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" /> {Math.floor(opt.duration_minutes / 60)}h {opt.duration_minutes % 60 > 0 ? `${opt.duration_minutes % 60}m` : ''}
                    {opt.pricing_type === 'per_person' && <span>· per person</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
          {selectedOption && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Guests</Label>
                <div className="flex items-center gap-3">
                  <Button size="sm" variant="outline" onClick={() => setGuestCount(Math.max(selectedOption.minimum_guests || listing.minimum_guests, guestCount - 1))} className="border-border bg-card">-</Button>
                  <span className="text-lg font-bold text-foreground w-8 text-center">{guestCount}</span>
                  <Button size="sm" variant="outline" onClick={() => setGuestCount(Math.min(listing.capacity, guestCount + 1))} className="border-border bg-card">+</Button>
                  <span className="text-xs text-muted-foreground ml-1">Max {listing.capacity}</span>
                </div>
              </div>
              {price && !loadingPrice && (
                <div className="rounded-lg bg-secondary/50 p-3 space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Base</span><span className="font-medium text-foreground">{formatCurrency(price.base_amount, price.currency)}</span></div>
                  {price.guest_adjustment > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Additional guests</span><span className="font-medium text-foreground">{formatCurrency(price.guest_adjustment, price.currency)}</span></div>}
                  {price.service_fee_amount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Service fee</span><span className="font-medium text-foreground">{formatCurrency(price.service_fee_amount, price.currency)}</span></div>}
                  {price.tax_amount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span className="font-medium text-foreground">{formatCurrency(price.tax_amount, price.currency)}</span></div>}
                  <div className="flex justify-between border-t border-border pt-1"><span className="font-semibold text-foreground">Total</span><span className="font-bold text-foreground">{formatCurrency(price.total_amount, price.currency)}</span></div>
                  {price.deposit_amount > 0 && (
                    <div className="flex justify-between"><span className="font-medium" style={{ color: primary }}>Due now</span><span className="font-bold" style={{ color: primary }}>{formatCurrency(price.deposit_amount, price.currency)}</span></div>
                  )}
                  {price.balance_due > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Balance due</span><span className="font-medium text-foreground">{formatCurrency(price.balance_due, price.currency)}</span></div>}
                </div>
              )}
              <Button onClick={() => goToStep('datetime')} className="w-full text-primary-foreground hover:opacity-90" style={{ backgroundColor: primary }}>
                Continue <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </>
          )}
        </>
      )}

      {/* Step: Date & Time */}
      {step === 'datetime' && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-foreground">Select Date & Time</h3>
            <button onClick={() => goToStep('package')} className="text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5 inline" /> Back</button>
          </div>
          <div className="rounded-xl border border-border p-3">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setCalendarMonth(m => m.month === 0 ? { year: m.year - 1, month: 11 } : { ...m, month: m.month - 1 })} className="p-1 text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /></button>
              <span className="text-sm font-semibold text-foreground">{firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
              <button onClick={() => setCalendarMonth(m => m.month === 11 ? { year: m.year + 1, month: 0 } : { ...m, month: m.month + 1 })} className="p-1 text-muted-foreground hover:text-foreground"><ArrowRight className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i} className="text-[10px] text-muted-foreground py-1">{d}</div>)}
              {Array.from({ length: startWeekday }).map((_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const dayNum = i + 1;
                const d = new Date(calendarMonth.year, calendarMonth.month, dayNum);
                const dStr = d.toISOString().split('T')[0];
                const available = isDateAvailable(d);
                const selected = selectedDate === dStr;
                return (
                  <button key={dayNum} disabled={!available} onClick={() => setSelectedDate(dStr)}
                    className={cn('aspect-square rounded-lg text-xs font-medium transition-all',
                      selected ? 'text-white shadow-sm' : available ? 'text-foreground hover:bg-secondary' : 'text-muted-foreground/30 cursor-not-allowed')}
                    style={selected ? { backgroundColor: primary } : {}}>
                    {dayNum}
                  </button>
                );
              })}
            </div>
          </div>
          {rateLimited && <p className="text-xs text-warning">Too many requests. Please slow down.</p>}
          {selectedDate && (
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">Available Times ({listing.timezone})</Label>
              {loadingSlots ? (
                <div className="flex items-center justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" style={{ color: primary }} /></div>
              ) : slots.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">No available times for this date.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {slots.map((slot, i) => (
                    <button key={i} onClick={() => setSelectedSlot(slot)}
                      className={cn('rounded-lg border-2 py-2 text-sm font-medium transition-all',
                        selectedSlot?.start === slot.start ? 'bg-opacity-5' : 'border-border text-foreground hover:border-opacity-40')}
                      style={selectedSlot?.start === slot.start ? { borderColor: primary, color: primary, backgroundColor: `${primary}0D` } : {}}>
                      {slot.start}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {selectedSlot && (
            <Button onClick={() => goToStep('details')} className="w-full text-primary-foreground hover:opacity-90" style={{ backgroundColor: primary }}>
              Continue <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </>
      )}

      {/* Step: Customer Details */}
      {step === 'details' && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-foreground">Your Details</h3>
            <button onClick={() => goToStep('datetime')} className="text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5 inline" /> Back</button>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Full Name *</Label>
              <Input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} className="bg-card" placeholder="John Doe" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Email</Label>
              <Input type="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} className="bg-card" placeholder="john@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Phone</Label>
              <Input type="tel" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} className="bg-card" placeholder="+1 555-0100" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Notes (optional)</Label>
              <Textarea value={customer.notes} onChange={(e) => setCustomer({ ...customer, notes: e.target.value })} rows={2} className="resize-none bg-card" placeholder="Special requests..." />
            </div>
            <input type="text" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} className="hidden" tabIndex={-1} autoComplete="off" />
          </div>
          <Button onClick={() => goToStep('review')} disabled={!customer.name.trim()} className="w-full text-primary-foreground hover:opacity-90" style={{ backgroundColor: primary }}>
            Review Booking <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </>
      )}

      {/* Step: Review */}
      {step === 'review' && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-foreground">Review & Confirm</h3>
            <button onClick={() => goToStep('details')} className="text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5 inline" /> Back</button>
          </div>
          <div className="space-y-2 rounded-xl bg-secondary/50 p-4 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Experience</span><span className="font-medium text-foreground">{selectedOption?.name}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span className="font-medium text-foreground">{selectedDate}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Time</span><span className="font-medium text-foreground">{selectedSlot?.start} - {selectedSlot?.end} ({listing.timezone})</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Guests</span><span className="font-medium text-foreground">{guestCount}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span className="font-medium text-foreground">{customer.name}</span></div>
          </div>
          {price && (
            <div className="space-y-1 rounded-xl border border-border p-4 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-bold text-foreground">{formatCurrency(price.total_amount, price.currency)}</span></div>
              {price.deposit_amount > 0 ? (
                <>
                  <div className="flex justify-between"><span className="font-medium" style={{ color: primary }}>Due now</span><span className="font-bold" style={{ color: primary }}>{formatCurrency(price.deposit_amount, price.currency)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Balance</span><span className="font-medium text-foreground">{formatCurrency(price.balance_due, price.currency)}</span></div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">{listing.payment_mode === 'request_only' ? 'No payment required — this is a request.' : 'No payment due at this time.'}</p>
              )}
            </div>
          )}
          {listing.cancellation_policy_text && (
            <p className="text-xs text-muted-foreground flex items-start gap-1.5"><Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />{listing.cancellation_policy_text}</p>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
          {listing.payment_mode !== 'request_only' && !tenantCanAcceptPayments && price && price.amount_due_now > 0 && (
            <div className="rounded-lg border border-warning/20 bg-warning/10 p-3">
              <p className="text-xs text-warning flex items-start gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                Online payment is not available for this business yet. Your booking will be held as a request — they will contact you to arrange payment.
              </p>
            </div>
          )}
          <Button onClick={submitBooking} disabled={submitting} className="w-full text-primary-foreground hover:opacity-90" style={{ backgroundColor: primary }}>
            {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</> : listing.payment_mode === 'request_only' ? 'Submit Request' : (price && price.amount_due_now > 0 && !tenantCanAcceptPayments) ? 'Submit Request' : (tenantCanAcceptPayments && listing.payment_mode !== 'request_only' && listing.payment_mode !== 'pay_at_location') ? 'Pay & Reserve' : 'Hold My Booking'}
          </Button>
        </>
      )}
    </div>
  );
}
