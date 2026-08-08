'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { XCircle, Clock, RefreshCw, Phone, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PaymentCancelledPage() {
  const params = useParams();
  const bookingReference = params.slug as string;
  const searchParams = useSearchParams();
  const accessToken = searchParams.get('token') || '';
  const [bookingData, setBookingData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadBooking() {
      if (!accessToken) { setLoading(false); return; }
      const { data } = await supabase.rpc('get_public_booking_status', {
        p_booking_reference: bookingReference,
        p_access_token: accessToken,
      });
      setBookingData(data);
      setLoading(false);
    }
    loadBooking();
  }, [bookingReference, accessToken]);

  const holdExpired = bookingData?.expires_at && new Date(bookingData.expires_at) < new Date();
  const canRetry = !holdExpired && bookingData?.booking_status === 'awaiting_payment';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-8">
      <div className="mx-auto max-w-lg">
        <div className="rounded-2xl border border-slate-200 bg-card p-8 shadow-lg">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <XCircle className="h-8 w-8 text-destructive" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Payment Not Completed</h1>
            <p className="mt-2 text-sm text-slate-600">
              Your payment was not completed. Don't worry — your booking is still held for now.
            </p>
          </div>

          {bookingData && (
            <div className="mt-6 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
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
              {!holdExpired && bookingData.expires_at && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">Hold Expires In</span>
                  <span className="text-sm font-medium text-warning">
                    <Clock className="mr-1 inline h-3.5 w-3.5" />
                    {new Date(bookingData.expires_at).toLocaleTimeString(undefined, {
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>
              )}
            </div>
          )}

          {holdExpired ? (
            <div className="mt-6 rounded-lg border border-warning/20 bg-warning/10 p-4">
              <p className="text-sm text-warning">
                Your booking hold has expired. You'll need to start a new booking to reserve this time slot.
              </p>
            </div>
          ) : canRetry ? (
            <div className="mt-6 space-y-3">
              <div className="rounded-lg border border-primary/20 bg-primary/10 p-4">
                <p className="text-sm text-primary">
                  You can still complete your payment. Your booking is held until the timer expires.
                </p>
              </div>
              <Button
                className="w-full bg-primary text-white hover:bg-primary-hover"
                onClick={async () => {
                  if (bookingData?.reservation_id && accessToken) {
                    try {
                      const res = await fetch('/api/create-checkout', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          reservation_id: bookingData.reservation_id,
                          booking_reference: bookingData.booking_reference,
                          access_token: accessToken,
                        }),
                      });
                      const data = await res.json();
                      if (data.checkout_url) {
                        window.location.href = data.checkout_url;
                      }
                    } catch {
                      // Stay on page
                    }
                  }
                }}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry Payment
              </Button>
            </div>
          ) : null}

          {/* Contact info */}
          {bookingData && (bookingData.tenant_phone || bookingData.tenant_email) && (
            <div className="mt-6 border-t border-slate-100 pt-4">
              <p className="mb-2 text-xs font-medium text-slate-500">Need help? Contact the business:</p>
              <div className="flex flex-wrap gap-3">
                {bookingData.tenant_phone && (
                  <a href={`tel:${bookingData.tenant_phone}`} className="flex items-center gap-1.5 text-sm text-slate-700 hover:text-primary">
                    <Phone className="h-3.5 w-3.5" /> {bookingData.tenant_phone}
                  </a>
                )}
                {bookingData.tenant_email && (
                  <a href={`mailto:${bookingData.tenant_email}`} className="flex items-center gap-1.5 text-sm text-slate-700 hover:text-primary">
                    <Mail className="h-3.5 w-3.5" /> {bookingData.tenant_email}
                  </a>
                )}
              </div>
            </div>
          )}

          {loading && (
            <p className="mt-4 text-center text-sm text-slate-400">Loading booking details...</p>
          )}
        </div>
      </div>
    </div>
  );
}
