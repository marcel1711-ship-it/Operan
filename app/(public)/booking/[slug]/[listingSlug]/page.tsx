'use client';

import { useEffect, useState, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Anchor, ArrowLeft, Loader2, Ship, Users, MapPin } from 'lucide-react';
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

  useEffect(() => {
    async function load() {
      try {
        const { data: tenantData } = await supabase
          .from('tenants')
          .select('id, name, slug, primary_color, secondary_color, logo_url')
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
    </div>
  );
}
