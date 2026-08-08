'use client';

import { useEffect, useState, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  Anchor, Users, Calendar, MapPin, Ship, Loader2, Waves, Phone, Mail,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/format';
import { supabase } from '@/lib/supabase';

type Tenant = {
  id: string; name: string; slug: string;
  primary_color: string; secondary_color: string;
  logo_url: string | null; hero_title: string | null;
  hero_subtitle: string | null; hero_image_url: string | null;
  domain: string | null; landing_page_url: string | null;
  phone: string | null; email: string | null;
};

type Listing = {
  id: string; name: string; slug: string;
  description: string | null; short_description: string | null;
  photos: string[]; price_per_hour: number;
  price_half_day: number; price_full_day: number;
  capacity: number; length_ft: number | null;
  boat_type: string | null; year: number | null;
  location: string | null; amenities: string[];
  is_active: boolean; currency: string;
};

type PricingOption = {
  listing_id: string; base_price: number; is_active: boolean;
};

export default function TenantLandingPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <TenantLandingPageInner />
    </Suspense>
  );
}

function TenantLandingPageInner() {
  const params = useParams();
  const slug = params.tenantSlug as string;
  const searchParams = useSearchParams();
  const isEmbed = searchParams.get('embed') === '1';
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [listingPrices, setListingPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePhoto, setActivePhoto] = useState<Record<string, number>>({});

  useEffect(() => {
    async function load() {
      try {
        const { data: tenantData, error: tenantErr } = await supabase
          .from('tenants').select('*').eq('slug', slug).eq('is_active', true).maybeSingle();
        if (tenantErr || !tenantData) { setError('Business not found'); setLoading(false); return; }
        setTenant(tenantData as Tenant);

        const { data: listingData } = await supabase
          .from('listings').select('*').eq('tenant_id', tenantData.id).eq('is_active', true)
          .order('sort_order', { ascending: true }).order('created_at', { ascending: false });
        const listingsData = (listingData as Listing[]) || [];
        setListings(listingsData);

        // Load lowest price for each listing
        if (listingsData.length > 0) {
          const listingIds = listingsData.map(l => l.id);
          const { data: options } = await supabase
            .from('listing_pricing_options').select('listing_id, base_price, is_active')
            .in('listing_id', listingIds).eq('is_active', true)
            .order('base_price', { ascending: true });
          const priceMap: Record<string, number> = {};
          for (const opt of (options as PricingOption[]) || []) {
            if (priceMap[opt.listing_id] === undefined) priceMap[opt.listing_id] = opt.base_price;
          }
          setListingPrices(priceMap);
        }
      } catch { setError('Failed to load'); }
      finally { setLoading(false); }
    }
    load();
  }, [slug]);

  function getPhotoIndex(id: string, max: number): number {
    if (activePhoto[id] === undefined) return 0;
    return Math.min(activePhoto[id], max - 1);
  }

  if (loading) {
    return (
      <div className="theme-light min-h-screen bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <Skeleton className="h-56 w-full rounded-none" />
                <div className="space-y-3 p-5"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4 w-full" /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="theme-light flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50">
        <Anchor className="h-12 w-12 text-slate-300" />
        <div className="text-center">
          <h1 className="text-lg font-bold text-foreground">Business not found</h1>
          <p className="mt-1 text-sm text-muted-foreground">The page you're looking for doesn't exist.</p>
        </div>
      </div>
    );
  }

  const primary = tenant.primary_color || '#0d9488';
  const secondary = tenant.secondary_color || '#0f766e';
  const whatsappNumber = tenant.phone?.replace(/\D/g, '') || null;

  const embedHeaderBg = (isEmbed && searchParams.get('headerBg')) ? `#${searchParams.get('headerBg')}` : primary;
  const embedAccent = (isEmbed && searchParams.get('accent')) ? `#${searchParams.get('accent')}` : primary;
  const embedBg = (isEmbed && searchParams.get('bg')) ? `#${searchParams.get('bg')}` : 'transparent';
  const embedCardBg = (isEmbed && searchParams.get('cardBg')) ? `#${searchParams.get('cardBg')}` : undefined;
  const embedTextColor = (isEmbed && searchParams.get('text')) ? `#${searchParams.get('text')}` : undefined;
  const embedMuted = (isEmbed && searchParams.get('muted')) ? `#${searchParams.get('muted')}` : undefined;
  const embedHideHeader = isEmbed && searchParams.get('hideHeader') === '1';

  if (isEmbed) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: embedBg }}>
        {!embedHideHeader && (
          <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: embedHeaderBg }}>
            <div className="flex items-center gap-2">
              {tenant.logo_url ? (
                <img src={tenant.logo_url} alt={tenant.name} className="h-7 w-7 rounded-lg object-cover" />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: embedAccent }}><Anchor className="h-4 w-4 text-white" /></div>
              )}
              <span className="text-sm font-bold text-white">{tenant.name}</span>
            </div>
            {tenant.landing_page_url && (
              <a href={tenant.landing_page_url} target="_blank" rel="noopener noreferrer" className="text-xs text-white/60 hover:text-white">Visit site →</a>
            )}
          </div>
        )}
        <main className="px-4 py-4">
          {listings.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border py-12" style={{ borderColor: `${embedAccent}20`, backgroundColor: embedCardBg }}>
              <Ship className="h-8 w-8" style={{ color: `${embedAccent}60` }} />
              <p className="text-sm" style={{ color: embedMuted || '#6b9090' }}>No experiences available right now.</p>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map((boat) => {
                const photoIdx = getPhotoIndex(boat.id, boat.photos.length);
                const lowestPrice = listingPrices[boat.id];
                return (
                  <a key={boat.id} href={`/r/${slug}/${boat.slug}`} target="_blank" rel="noopener noreferrer" className="group flex flex-col overflow-hidden rounded-2xl shadow-sm transition-all hover:shadow-lg" style={{ backgroundColor: embedCardBg || '#ffffff', border: `1px solid ${embedAccent}20` }}>
                    <div className="relative h-56 overflow-hidden">
                      {boat.photos.length > 0 ? (
                        <img src={boat.photos[photoIdx]} alt={boat.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center" style={{ backgroundColor: `${embedAccent}10` }}><Ship className="h-12 w-12" style={{ color: `${embedAccent}40` }} /></div>
                      )}
                      {boat.boat_type && <div className="absolute left-3 top-3"><span className="rounded-full border-0 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm" style={{ backgroundColor: 'rgba(15,23,42,0.8)' }}>{boat.boat_type}</span></div>}
                    </div>
                    <div className="flex flex-1 flex-col p-5">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-lg font-bold" style={{ color: embedTextColor || '#1a3a3a' }}>{boat.name}</h3>
                        {boat.year && <span className="shrink-0 text-xs" style={{ color: embedMuted || '#6b9090' }}>{boat.year}</span>}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs" style={{ color: embedMuted || '#6b9090' }}>
                        <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" style={{ color: embedAccent }} />{boat.capacity} guests</span>
                        {boat.length_ft && <span className="flex items-center gap-1"><Ship className="h-3.5 w-3.5" style={{ color: embedAccent }} />{boat.length_ft} ft</span>}
                        {boat.location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" style={{ color: embedAccent }} />{boat.location}</span>}
                      </div>
                      {boat.short_description && <p className="mt-3 line-clamp-2 text-sm leading-relaxed" style={{ color: embedMuted || '#6b9090' }}>{boat.short_description}</p>}
                      {boat.amenities?.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {boat.amenities.slice(0, 4).map(a => <span key={a} className="rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ backgroundColor: `${embedAccent}15`, color: embedAccent }}>{a}</span>)}
                        </div>
                      )}
                      <div className="mt-4 flex items-center justify-between border-t pt-4" style={{ borderColor: `${embedAccent}15` }}>
                        {lowestPrice !== undefined ? (
                          <div><p className="text-[10px] uppercase tracking-wider" style={{ color: embedMuted || '#6b9090' }}>From</p><p className="text-lg font-bold" style={{ color: embedTextColor || '#1a3a3a' }}>{formatCurrency(lowestPrice, boat.currency)}</p></div>
                        ) : <div />}
                        <div className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity group-hover:opacity-90" style={{ backgroundColor: embedAccent }}>
                          <Calendar className="mr-1.5 inline h-3.5 w-3.5" />Book Now
                        </div>
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </main>
        {whatsappNumber && (
          <a
            href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Hi! I have a question about booking with ${tenant.name}.`)}`}
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
        )}
      </div>
    );
  }

  return (
    <div className="theme-light min-h-screen bg-slate-50">
      <header className="relative overflow-hidden" style={{ backgroundColor: primary }}>
        {tenant.hero_image_url && (
          <div className="pointer-events-none absolute inset-0 opacity-30">
            <img src={tenant.hero_image_url} alt="" className="h-full w-full object-cover" />
          </div>
        )}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 left-1/4 h-72 w-72 rounded-full blur-[100px]" style={{ backgroundColor: primary, opacity: 0.2 }} />
          <div className="absolute bottom-0 right-1/4 h-64 w-64 rounded-full blur-[100px]" style={{ backgroundColor: secondary, opacity: 0.15 }} />
        </div>
        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="flex items-center gap-3">
            {tenant.logo_url ? (
              <img src={tenant.logo_url} alt={tenant.name} className="h-12 w-12 rounded-2xl object-cover" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl shadow-lg" style={{ backgroundColor: primary }}><Anchor className="h-6 w-6 text-white" /></div>
            )}
            <span className="text-xl font-bold text-white">{tenant.name}</span>
          </div>
          <h1 className="mt-6 max-w-2xl text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
            {tenant.hero_title || 'Charter Your Perfect Day on the Water'}
          </h1>
          <p className="mt-4 max-w-xl text-lg text-slate-300">
            {tenant.hero_subtitle || 'Browse our fleet and book your next adventure in minutes.'}
          </p>
        </div>
        <div className="relative h-px w-full" style={{ background: `linear-gradient(to right, transparent, ${primary}50, transparent)` }} />
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-foreground">Available Experiences</h2>
          {!loading && !error && <p className="mt-1 text-sm text-muted-foreground">{listings.length} {listings.length === 1 ? 'option' : 'options'} available</p>}
        </div>
        {listings.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-card py-20 shadow-sm">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary"><Ship className="h-8 w-8 text-muted-foreground" /></div>
            <div className="text-center"><h3 className="text-sm font-semibold text-foreground">No experiences available right now</h3><p className="mt-1 text-sm text-muted-foreground">Check back soon.</p></div>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((boat) => {
              const photoIdx = getPhotoIndex(boat.id, boat.photos.length);
              const lowestPrice = listingPrices[boat.id];
              return (
                <a key={boat.id} href={`/r/${slug}/${boat.slug}`} className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:shadow-lg">
                  <div className="relative h-56 overflow-hidden bg-secondary">
                    {boat.photos.length > 0 ? (
                      <img src={boat.photos[photoIdx]} alt={boat.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center"><Ship className="h-12 w-12 text-muted-foreground/30" /></div>
                    )}
                    {boat.boat_type && <div className="absolute left-3 top-3"><Badge className="border-0 bg-slate-900/80 text-xs font-semibold text-white backdrop-blur-sm">{boat.boat_type}</Badge></div>}
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-lg font-bold text-foreground">{boat.name}</h3>
                      {boat.year && <span className="shrink-0 text-xs text-muted-foreground">{boat.year}</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" style={{ color: primary }} />{boat.capacity} guests</span>
                      {boat.length_ft && <span className="flex items-center gap-1"><Ship className="h-3.5 w-3.5" style={{ color: primary }} />{boat.length_ft} ft</span>}
                      {boat.location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" style={{ color: primary }} />{boat.location}</span>}
                    </div>
                    {boat.short_description && <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{boat.short_description}</p>}
                    {boat.amenities?.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {boat.amenities.slice(0, 4).map(a => <Badge key={a} variant="secondary" className="text-[11px]" style={{ backgroundColor: `${primary}15`, color: secondary }}>{a}</Badge>)}
                      </div>
                    )}
                    <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                      {lowestPrice !== undefined ? (
                        <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">From</p><p className="text-lg font-bold text-foreground">{formatCurrency(lowestPrice, boat.currency)}</p></div>
                      ) : <div />}
                      <div className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity group-hover:opacity-90" style={{ backgroundColor: primary }}>
                        <Calendar className="mr-1.5 inline h-3.5 w-3.5" />Book Now
                      </div>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </main>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            {tenant.logo_url ? <img src={tenant.logo_url} alt={tenant.name} className="h-5 w-5 rounded object-cover" /> : <Anchor className="h-5 w-5" style={{ color: primary }} />}
            <span className="text-sm font-semibold text-foreground">{tenant.name}</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {tenant.phone && <a href={`tel:${tenant.phone}`} className="flex items-center gap-1 hover:text-foreground"><Phone className="h-3 w-3" />{tenant.phone}</a>}
            {tenant.email && <a href={`mailto:${tenant.email}`} className="flex items-center gap-1 hover:text-foreground"><Mail className="h-3 w-3" />{tenant.email}</a>}
          </div>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} {tenant.name}. All rights reserved.</p>
        </div>
      </footer>

      {whatsappNumber && (
        <a
          href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Hi! I have a question about booking with ${tenant.name}.`)}`}
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
      )}
    </div>
  );
}
