'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, ExternalLink, Globe, Anchor, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getAppUrl } from '@/lib/utils';

type Tenant = { id: string; name: string; slug: string; primary_color: string };
type Listing = {
  id: string; name: string; slug: string; is_active: boolean;
  online_booking_enabled: boolean; updated_at: string;
  tenant_id: string;
};

export default function SuperAdminListingsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: tenantData } = await supabase.from('tenants').select('id, name, slug, primary_color').order('name');
      setTenants((tenantData as Tenant[]) || []);

      const { data: listingData } = await supabase
        .from('listings')
        .select('id, name, slug, is_active, online_booking_enabled, updated_at, tenant_id')
        .order('created_at', { ascending: false });
      setListings((listingData as Listing[]) || []);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const tenantMap = new Map(tenants.map(t => [t.id, t]));
  const appUrl = getAppUrl();

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Globe className="h-6 w-6 text-primary" /> Listing Support
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Audit and support view for all tenant listings. This is not the primary location for managing listing links —
            tenants manage their own links in the listing editor&apos;s &quot;Website & Booking&quot; tab.
          </p>
        </div>

        {listings.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card py-16">
            <AlertCircle className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No listings found.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tenant</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Listing</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Booking</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Public URL</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Last Updated</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((listing) => {
                  const tenant = tenantMap.get(listing.tenant_id);
                  const publicUrl = tenant ? `${appUrl}/r/${tenant.slug}/${listing.slug}` : '';
                  return (
                    <tr key={listing.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {tenant?.primary_color && (
                            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: tenant.primary_color }} />
                          )}
                          <span className="text-xs font-medium text-foreground">{tenant?.name || 'Unknown'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-foreground">{listing.name}</td>
                      <td className="px-4 py-3">
                        {listing.is_active
                          ? <Badge className="bg-green-500/15 text-green-600 border-0 text-[10px]">Published</Badge>
                          : <Badge className="bg-amber-500/15 text-amber-600 border-0 text-[10px]">Unpublished</Badge>}
                      </td>
                      <td className="px-4 py-3">
                        {listing.online_booking_enabled
                          ? <Badge className="bg-green-500/15 text-green-600 border-0 text-[10px]">Enabled</Badge>
                          : <Badge className="bg-slate-500/15 text-slate-500 border-0 text-[10px]">Disabled</Badge>}
                      </td>
                      <td className="px-4 py-3">
                        {publicUrl ? (
                          <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                            <ExternalLink className="h-3 w-3" /> View
                          </a>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {listing.updated_at ? new Date(listing.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {tenant && (
                          <a href={`/r/${tenant.slug}/${listing.slug}`} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs hover:bg-secondary">
                            <Anchor className="h-3 w-3" /> Open Listing
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
