'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Anchor } from 'lucide-react';

export default function ListingsRedirect() {
  const router = useRouter();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setNotFound(true);
        return;
      }
      const { data } = await supabase
        .from('tenant_users')
        .select('tenants(slug)')
        .eq('user_id', session.user.id)
        .maybeSingle();

      const tenantData = data as unknown as { tenants: { slug: string } | null } | null;
      const slug = tenantData?.tenants?.slug ?? null;
      if (slug) {
        router.replace(`/r/${slug}`);
      } else {
        setNotFound(true);
      }
    })();
  }, [router]);

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50">
        <Anchor className="h-12 w-12 text-slate-300" />
        <div className="text-center">
          <h1 className="text-lg font-bold text-foreground">No listings found</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Please sign in to view your listings.
          </p>
        </div>
      </div>
    );
  }
  return null;
}
