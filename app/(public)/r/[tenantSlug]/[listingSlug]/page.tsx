'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useParams } from 'next/navigation';
import {
  Anchor, Users, MapPin, Ship, Loader2, ArrowLeft, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import {
  BookingFlow,
  type BookingTenant,
  type BookingListing,
  type BookingPricingOption,
} from '@/components/booking/booking-flow';

export default function ListingDetailPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <ListingDetailInner />
    </Suspense>
  );
}

function ListingDetailInner() {
  const params = useParams();
  const tenantSlug = params.tenantSlug as string;
  const listingSlug = params.listingSlug as string;

  const [tenant, setTenant] = useState<BookingTenant | null>(null);
  const [listing, setListing] = useState<BookingListing | null>(null);
  const [pricingOptions, setPricingOptions] = useState<BookingPricingOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);

  const photoCount = listing?.photos?.length || 0;

  const nextPhoto = useCallback(() => {
    if (photoCount > 1) setPhotoIndex(i => (i + 1) % photoCount);
  }, [photoCount]);

  const prevPhoto = useCallback(() => {
    if (photoCount > 1) setPhotoIndex(i => (i - 1 + photoCount) % photoCount);
  }, [photoCount]);

  useEffect(() => {
    async function load() {
      try {
        const { data: tenantData } = await supabase
          .from('tenants').select('*').eq('slug', tenantSlug).eq('is_active', true).maybeSingle();
        if (!tenantData) { setError('Not found'); setLoading(false); return; }
        setTenant(tenantData as BookingTenant);

        const { data: listingData } = await supabase
          .from('listings').select('*').eq('slug', listingSlug).eq('tenant_id', tenantData.id).eq('is_active', true).maybeSingle();
        if (!listingData) { setError('Listing not found'); setLoading(false); return; }
        setListing(listingData as BookingListing);

        const { data: options } = await supabase
          .from('listing_pricing_options').select('*').eq('listing_id', listingData.id).eq('is_active', true).order('sort_order');
        setPricingOptions((options as BookingPricingOption[]) || []);
      } catch { setError('Failed to load'); }
      finally { setLoading(false); }
    }
    load();
  }, [tenantSlug, listingSlug]);

  useEffect(() => {
    if (photoCount <= 1) return;
    const timer = setInterval(nextPhoto, 5000);
    return () => clearInterval(timer);
  }, [photoCount, nextPhoto]);

  if (loading) return <div className="theme-light flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (error || !tenant || !listing) return (
    <div className="theme-light flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50">
      <Anchor className="h-12 w-12 text-slate-300" />
      <div className="text-center">
        <h1 className="text-lg font-bold text-foreground">{error || 'Not found'}</h1>
        <a href={`/r/${tenantSlug}`} className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"><ArrowLeft className="h-3.5 w-3.5" />Back to listings</a>
      </div>
    </div>
  );

  const primary = tenant.primary_color || '#0d9488';
  const secondary = tenant.secondary_color || '#0f766e';

  return (
    <div className="theme-light min-h-screen bg-slate-50">
      {/* Header */}
      <header className="relative overflow-hidden" style={{ backgroundColor: primary }}>
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 left-1/4 h-72 w-72 rounded-full blur-[100px]" style={{ backgroundColor: primary, opacity: 0.3 }} />
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
        <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
          {/* Left: Listing info */}
          <div className="space-y-6">
            {/* Gallery */}
            <div className="group overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              {photoCount > 0 ? (
                <div className="relative h-80 sm:h-96">
                  {listing.photos.map((photo, i) => (
                    <img
                      key={i}
                      src={photo}
                      alt={`${listing.name} — photo ${i + 1}`}
                      className="absolute inset-0 h-full w-full object-cover transition-opacity duration-700"
                      style={{ opacity: i === photoIndex ? 1 : 0 }}
                    />
                  ))}
                  {photoCount > 1 && (
                    <>
                      <button onClick={prevPhoto} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/60 group-hover:opacity-100">
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <button onClick={nextPhoto} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/60 group-hover:opacity-100">
                        <ChevronRight className="h-5 w-5" />
                      </button>
                      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
                        {listing.photos.map((_, i) => (
                          <button
                            key={i}
                            onClick={() => setPhotoIndex(i)}
                            className="h-2 rounded-full transition-all"
                            style={{
                              width: i === photoIndex ? 20 : 8,
                              backgroundColor: i === photoIndex ? '#fff' : 'rgba(255,255,255,0.5)',
                            }}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex h-80 items-center justify-center bg-secondary"><Ship className="h-16 w-16 text-muted-foreground/30" /></div>
              )}
            </div>

            {/* Title & info */}
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{listing.name}</h1>
              {listing.short_description && (
                <p className="mt-2 text-base text-muted-foreground">{listing.short_description}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                {listing.boat_type && <span className="flex items-center gap-1"><Ship className="h-4 w-4" style={{ color: primary }} />{listing.boat_type}</span>}
                <span className="flex items-center gap-1"><Users className="h-4 w-4" style={{ color: primary }} />Up to {listing.capacity} guests</span>
                {listing.location && <span className="flex items-center gap-1"><MapPin className="h-4 w-4" style={{ color: primary }} />{listing.location}</span>}
                {listing.year && <span className="text-xs">{listing.year}</span>}
              </div>
            </div>

            {/* Full description */}
            {listing.full_description && (
              <div className="prose prose-sm max-w-none">
                <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">{listing.full_description}</p>
              </div>
            )}

            {/* Amenities */}
            {listing.amenities?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Amenities</h3>
                <div className="flex flex-wrap gap-2">
                  {listing.amenities.map(a => (
                    <Badge key={a} variant="secondary" className="text-xs" style={{ backgroundColor: `${primary}15`, color: secondary }}>{a}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Instructions */}
            {(listing.customer_instructions || listing.meeting_instructions || listing.cancellation_policy_text) && (
              <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                {listing.customer_instructions && (
                  <div><h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Instructions</h4><p className="text-sm text-muted-foreground">{listing.customer_instructions}</p></div>
                )}
                {listing.meeting_instructions && (
                  <div><h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Meeting Point</h4><p className="text-sm text-muted-foreground">{listing.meeting_instructions}</p></div>
                )}
                {listing.cancellation_policy_text && (
                  <div><h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Cancellation Policy</h4><p className="text-sm text-muted-foreground">{listing.cancellation_policy_text}</p></div>
                )}
              </div>
            )}
          </div>

          {/* Right: Booking widget (sticky on desktop) */}
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
