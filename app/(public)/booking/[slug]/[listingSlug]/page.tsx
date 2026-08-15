'use client';

import { useEffect, useState, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Anchor, ArrowLeft, Loader2, Ship, Users, MapPin, MessageCircle } from 'lucide-react';
import { PoweredByOperan } from '@/components/powered-by-operan';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useEmbedPostMessage } from '@/hooks/use-embed-postmessage';
import {
  BookingFlow,
  type BookingTenant,
  type BookingListing,
  type BookingPricingOption,
  type BookingResult,
} from '@/components/booking/booking-flow';
import { useTenantFavicon } from '@/hooks/use-tenant-favicon';

export default function DirectBookingPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <DirectBookingInner />
    </Suspense>
  );
}

function DirectBookingInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const tenantSlug = params.slug as string;
  const listingSlug = params.listingSlug as string;
  const isEmbed = searchParams.get('embed') === '1';

  const [tenant, setTenant] = useState<BookingTenant | null>(null);
  const [listing, setListing] = useState<BookingListing | null>(null);
  const [pricingOptions, setPricingOptions] = useState<BookingPricingOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { sendClose } = useEmbedPostMessage(isEmbed);

  useTenantFavicon(tenant?.logo_url);

  useEffect(() => {
    if (tenant?.name && listing?.name) document.title = `${listing.name} — ${tenant.name}`;
  }, [tenant?.name, listing?.name]);

  useEffect(() => {
    async function load() {
      try {
        const { data: tenantData } = await supabase
          .from('tenants')
          .select('id, name, slug, primary_color, secondary_color, logo_url, phone')
          .eq('slug', tenantSlug)
          .eq('is_active', true)
          .maybeSingle();
        if (!tenantData) { setError('Business not found'); setLoading(false); return; }
        setTenant(tenantData as BookingTenant);

        const { data: listingData } = await supabase
          .from('listings')
          .select('*')
          .eq('slug', listingSlug)
          .eq('tenant_id', tenantData.id)
          .eq('is_active', true)
          .maybeSingle();
        if (!listingData) { setError('Listing not found'); setLoading(false); return; }
        setListing(listingData as BookingListing);

        const { data: options } = await supabase
          .from('listing_pricing_options')
          .select('*')
          .eq('listing_id', listingData.id)
          .eq('is_active', true)
          .order('sort_order');
        setPricingOptions((options as BookingPricingOption[]) || []);
      } catch {
        setError('Failed to load');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [tenantSlug, listingSlug]);

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center', isEmbed ? 'min-h-[400px]' : 'min-h-screen', 'bg-slate-50')}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: tenant?.primary_color || '#0d9488' }} />
      </div>
    );
  }

  if (error || !tenant || !listing) {
    return (
      <div className={cn('flex flex-col items-center justify-center gap-4', isEmbed ? 'min-h-[400px]' : 'min-h-screen', 'bg-slate-50')}>
        <Anchor className="h-12 w-12 text-slate-300" />
        <div className="text-center">
          <h1 className="text-lg font-bold text-foreground">{error || 'Not found'}</h1>
          {!isEmbed && (
            <a href={`/r/${tenantSlug}`} className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline">
              <ArrowLeft className="h-3.5 w-3.5" />Back to listings
            </a>
          )}
        </div>
      </div>
    );
  }

  const primary = tenant.primary_color || '#0d9488';
  const whatsappNumber = tenant.phone?.replace(/\D/g, '') || null;

  function WhatsAppButton() {
    if (!whatsappNumber) return null;
    const message = encodeURIComponent(`Hi! I have a question about booking with ${tenant!.name}.`);
    return (
      <a
        href={`https://wa.me/${whatsappNumber}?text=${message}`}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-110"
        style={{ backgroundColor: '#25D366' }}
        aria-label="Chat on WhatsApp"
      >
        <svg viewBox="0 0 32 32" className="h-7 w-7 fill-white">
          <path d="M16.004 0h-.008C7.174 0 0 7.176 0 16c0 3.5 1.128 6.744 3.046 9.378L1.054 31.29l6.118-1.958A15.9 15.9 0 0016.004 32C24.826 32 32 24.822 32 16S24.826 0 16.004 0zm9.335 22.594c-.39 1.1-1.932 2.012-3.2 2.278-.868.18-2.002.324-5.82-1.25-4.886-2.016-8.03-6.964-8.274-7.29-.234-.326-1.966-2.62-1.966-4.998 0-2.378 1.246-3.548 1.688-4.034.39-.43 1.028-.622 1.64-.622.198 0 .376.01.536.018.442.02.664.046.956.74.364.866 1.25 2.984 1.36 3.202.11.218.218.514.072.826-.136.316-.256.512-.476.786-.218.274-.46.488-.676.78-.198.258-.42.534-.18.972.24.43 1.066 1.756 2.288 2.846 1.572 1.402 2.896 1.836 3.31 2.038.322.156.704.136.952-.124.316-.33.706-.878 1.102-1.42.282-.386.638-.434.996-.29.362.136 2.296 1.084 2.69 1.28.394.2.656.29.752.454.094.164.094.95-.296 2.048z"/>
        </svg>
      </a>
    );
  }

  // Embed mode: minimal chrome, just the booking flow
  if (isEmbed) {
    return (
      <div className="min-h-screen bg-slate-50">
        {/* Compact header with tenant name only */}
        <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
          <div className="flex items-center gap-2">
            {tenant.logo_url ? (
              <img src={tenant.logo_url} alt={tenant.name} className="h-7 w-7 rounded-lg object-cover" />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: primary }}>
                <Anchor className="h-4 w-4 text-white" />
              </div>
            )}
            <span className="text-sm font-bold text-foreground">{tenant.name}</span>
          </div>
          <button
            onClick={() => sendClose()}
            className="text-xs text-muted-foreground hover:text-foreground"
            aria-label="Close booking"
          >
            ✕
          </button>
        </div>

        {/* Listing name + quick info */}
        <div className="border-b border-border bg-card px-4 py-2.5">
          <h1 className="text-base font-bold text-foreground">{listing.name}</h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><Users className="h-3 w-3" style={{ color: primary }} />Up to {listing.capacity} guests</span>
            {listing.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" style={{ color: primary }} />{listing.location}</span>}
          </div>
        </div>

        {/* Booking flow */}
        <div className="rounded-2xl border border-border bg-card shadow-sm mx-2 mt-3 mb-4">
          <BookingFlow
            tenant={tenant}
            listing={listing}
            pricingOptions={pricingOptions}
            isEmbed={isEmbed}
          />
        </div>
        <WhatsAppButton />
      </div>
    );
  }

  // Non-embed mode: full page with listing info + booking widget
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="relative overflow-hidden" style={{ backgroundColor: '#0f172a' }}>
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 left-1/4 h-72 w-72 rounded-full blur-[100px]" style={{ backgroundColor: primary, opacity: 0.2 }} />
        </div>
        <div className="relative mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
          <a href={`/r/${tenantSlug}`} className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> All Listings
          </a>
          <div className="mt-4 flex items-center gap-3">
            {tenant.logo_url ? (
              <img src={tenant.logo_url} alt={tenant.name} className="h-10 w-10 rounded-xl object-cover" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: primary }}>
                <Anchor className="h-5 w-5 text-white" />
              </div>
            )}
            <span className="text-lg font-bold text-white">{tenant.name}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
          {/* Left: Listing info */}
          <div className="space-y-6">
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              {listing.photos?.length > 0 ? (
                <div className="relative h-80 sm:h-96">
                  <img src={listing.photos[0]} alt={listing.name} className="h-full w-full object-cover" />
                </div>
              ) : (
                <div className="flex h-80 items-center justify-center bg-secondary"><Ship className="h-16 w-16 text-muted-foreground/30" /></div>
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{listing.name}</h1>
              {listing.short_description && (
                <p className="mt-2 text-base text-muted-foreground">{listing.short_description}</p>
              )}
            </div>
          </div>

          {/* Right: Booking widget */}
          <div className="lg:sticky lg:top-4 lg:self-start">
            <div className="rounded-2xl border border-border bg-card shadow-lg">
              <BookingFlow
                tenant={tenant}
                listing={listing}
                pricingOptions={pricingOptions}
                isEmbed={false}
              />
            </div>
          </div>
        </div>
      </main>
      <PoweredByOperan />
      <WhatsAppButton />
    </div>
  );
}
