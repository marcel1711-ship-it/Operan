'use client';

import { useEffect, useState, use } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { CheckCircle2, Clock, Loader2, AlertCircle, Calendar, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PaymentSuccessPage({ params }: { params: Promise<{ slug: string }> }) {
  const bookingReference = use(params).slug;
  const searchParams = useSearchParams();
  const accessToken = searchParams.get('token') || '';
  const [status, setStatus] = useState<'verifying' | 'confirmed' | 'failed'>('verifying');
  const [bookingData, setBookingData] = useState<any>(null);
  const [pollCount, setPollCount] = useState(0);

  useEffect(() => {
    async function verifyPayment() {
      if (!accessToken) {
        setStatus('failed');
        return;
      }

      try {
        const { data, error } = await supabase.rpc('get_public_booking_status', {
          p_booking_reference: bookingReference,
          p_access_token: accessToken,
        });

        if (error || !data || data.error) {
          setStatus('failed');
          return;
        }

        setBookingData(data);

        // Check if payment has been confirmed by webhook
        if (data.payment_status === 'deposit_paid' || data.payment_status === 'paid_in_full') {
          setStatus('confirmed');
          return;
        }

        // If booking is confirmed, payment is done
        if (data.booking_status === 'confirmed') {
          setStatus('confirmed');
          return;
        }

        // Still processing — poll up to 10 times (30 seconds)
        if (pollCount < 10) {
          setPollCount(pollCount + 1);
          setTimeout(verifyPayment, 3000);
        } else {
          // Timeout — show "still processing" state
          setStatus('verifying');
        }
      } catch {
        setStatus('failed');
      }
    }

    verifyPayment();
  }, [bookingReference, accessToken, pollCount]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-8">
      <div className="mx-auto max-w-lg">
        <div className="rounded-2xl border border-slate-200 bg-card p-8 shadow-lg">
          {status === 'verifying' && (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
              <h1 className="text-xl font-bold text-slate-900">Verifying Your Payment</h1>
              <p className="mt-2 text-sm text-slate-600">
                We're confirming your payment with our payment provider. This usually takes a few seconds.
                Please don't close this page.
              </p>
              {bookingData && (
                <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-left">
                  <p className="text-xs font-medium text-slate-500">Booking Reference</p>
                  <p className="text-sm font-bold text-slate-900">{bookingReference}</p>
                  {bookingData.listing_name && (
                    <>
                      <p className="mt-2 text-xs font-medium text-slate-500">Experience</p>
                      <p className="text-sm text-slate-900">{bookingData.listing_name}</p>
                    </>
                  )}
                  {bookingData.start_at && (
                    <>
                      <p className="mt-2 text-xs font-medium text-slate-500">Date</p>
                      <p className="text-sm text-slate-900">
                        {new Date(bookingData.start_at).toLocaleDateString(undefined, {
                          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                        })}
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {status === 'confirmed' && bookingData && (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                <CheckCircle2 className="h-8 w-8 text-success" />
              </div>
              <h1 className="text-xl font-bold text-slate-900">Payment Confirmed!</h1>
              <p className="mt-2 text-sm text-slate-600">
                Your booking is confirmed. We've sent the details to your email.
              </p>
              <div className="mt-6 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">Booking Reference</span>
                  <span className="text-sm font-bold text-slate-900">{bookingReference}</span>
                </div>
                {bookingData.listing_name && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Experience</span>
                    <span className="text-sm text-slate-900">{bookingData.listing_name}</span>
                  </div>
                )}
                {bookingData.start_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Date</span>
                    <span className="text-sm text-slate-900">
                      {new Date(bookingData.start_at).toLocaleDateString(undefined, {
                        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
                      })}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">Amount Paid</span>
                  <span className="text-sm font-bold text-success">
                    ${Number(bookingData.amount_paid || 0).toFixed(2)} {bookingData.currency}
                  </span>
                </div>
                {Number(bookingData.balance_due || 0) > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Balance Due</span>
                    <span className="text-sm font-medium text-warning">
                      ${Number(bookingData.balance_due).toFixed(2)} {bookingData.currency}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">Status</span>
                  <span className="text-sm font-medium text-slate-900 capitalize">
                    {bookingData.booking_status?.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>
              <div className="mt-6 rounded-lg bg-primary/10 p-3 text-left">
                <p className="text-xs text-primary">
                  <Calendar className="mr-1 inline h-3.5 w-3.5" />
                  What's next? The business will contact you with any additional details about your booking.
                  {Number(bookingData.balance_due || 0) > 0 && ' Your balance is due before the service date.'}
                </p>
              </div>
            </div>
          )}

          {status === 'failed' && (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-warning/10">
                <AlertCircle className="h-8 w-8 text-warning" />
              </div>
              <h1 className="text-xl font-bold text-slate-900">Payment Verification</h1>
              <p className="mt-2 text-sm text-slate-600">
                We couldn't verify your payment status right now. If you completed payment, your booking
                will still be confirmed — the business will contact you shortly.
              </p>
              <p className="mt-4 text-sm text-slate-500">
                Booking Reference: <span className="font-bold">{bookingReference}</span>
              </p>
              <p className="mt-4 text-sm text-slate-500">
                If you need help, please contact the business directly.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
