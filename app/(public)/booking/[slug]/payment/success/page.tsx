'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { CheckCircle2, Calendar, Loader2 } from 'lucide-react';

export default function PaymentSuccessPage() {
  const params = useParams();
  const bookingReference = params.slug as string;
  const searchParams = useSearchParams();
  const accessToken = searchParams.get('token') || '';
  const [bookingData, setBookingData] = useState<Record<string, string | number | null> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAndVerify() {
      try {
        const { data } = await supabase.rpc('get_public_booking_status', {
          p_booking_reference: bookingReference,
          p_access_token: accessToken,
        });

        if (data && !data.error) {
          setBookingData(data);

          // Silently confirm payment in DB if not yet updated
          const alreadyConfirmed =
            data.payment_status === 'deposit_paid' ||
            data.payment_status === 'paid_in_full' ||
            data.booking_status === 'confirmed';

          if (!alreadyConfirmed && data.reservation_id) {
            fetch('/api/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                reservation_id: data.reservation_id,
                booking_reference: bookingReference,
                access_token: accessToken,
              }),
            }).catch(() => {});
          }
        }
      } catch {
        // Silent — page still shows confirmation
      }
      setLoading(false);
    }

    if (accessToken) {
      loadAndVerify();
    } else {
      setLoading(false);
    }
  }, [bookingReference, accessToken]);

  return (
    <div className="theme-light min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-8">
      <div className="mx-auto max-w-lg">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
              {loading ? (
                <Loader2 className="h-8 w-8 animate-spin text-green-600" />
              ) : (
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              )}
            </div>
            <h1 className="text-xl font-bold text-slate-900">
              {loading ? 'Processing Your Payment...' : 'Payment Successful!'}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {loading
                ? 'Please wait a moment while we confirm your booking.'
                : 'Your booking has been confirmed. You will receive a confirmation email shortly.'}
            </p>
          </div>

          <div className="mt-6 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Booking Reference</span>
              <span className="text-sm font-bold text-slate-900">{bookingReference}</span>
            </div>
            {bookingData?.listing_name && (
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Experience</span>
                <span className="text-sm text-slate-900">{bookingData.listing_name as string}</span>
              </div>
            )}
            {bookingData?.start_at && (
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Date</span>
                <span className="text-sm text-slate-900">
                  {new Date(bookingData.start_at as string).toLocaleDateString(undefined, {
                    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
                  })}
                </span>
              </div>
            )}
            {bookingData?.total_amount && (
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Total</span>
                <span className="text-sm font-bold text-green-700">
                  ${Number(bookingData.total_amount).toFixed(2)} {(bookingData.currency as string) || 'USD'}
                </span>
              </div>
            )}
          </div>

          <div className="mt-6 rounded-lg bg-blue-50 border border-blue-100 p-3">
            <p className="text-xs text-blue-700">
              <Calendar className="mr-1 inline h-3.5 w-3.5" />
              The business will contact you with any additional details about your booking.
            </p>
          </div>

          <p className="mt-4 text-center text-[11px] text-slate-400">
            You can safely close this page.
          </p>
        </div>
      </div>
    </div>
  );
}
