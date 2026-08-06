'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2, Plus, Loader2, Search, MoreVertical, Power, Edit,
  Globe, Mail,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

type Tenant = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  monthly_amount: number;
  created_at: string;
  last_payment_at: string | null;
  is_active: boolean;
  email: string | null;
  domain: string | null;
  integration_type: string | null;
};

export default function TenantsPage() {
  const router = useRouter();
  const { is_super_admin } = useAuth() as any;
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('all');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tenants')
      .select('id, name, slug, plan, status, monthly_amount, created_at, last_payment_at, is_active, email, domain, integration_type')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setTenants(data as Tenant[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleStatus(t: Tenant) {
    const newStatus = t.status === 'suspended' ? 'active' : 'suspended';
    const updates: Record<string, any> = {
      status: newStatus,
      is_active: newStatus === 'active',
      suspended_at: newStatus === 'suspended' ? new Date().toISOString() : null,
    };
    await supabase.from('tenants').update(updates).eq('id', t.id);
    await load();
  }

  const filtered = tenants.filter(t => {
    const matchesSearch = !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.email?.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === 'all' || t.status === filter;
    return matchesSearch && matchesFilter;
  });

  const filters = ['all', 'active', 'trial', 'suspended', 'cancelled'];

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--panel-bg)]">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--brand-primary)]" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Tenants</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{tenants.length} total accounts</p>
        </div>
        <Button onClick={() => router.push('/super-admin/tenants/new')} className="bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-hover)]">
          <Plus className="mr-2 h-4 w-4" />
          New Tenant
        </Button>
      </header>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="border-[var(--border-default)] bg-[var(--card-bg)] pl-10 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {filters.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'rounded-lg px-3 py-2 text-xs font-medium capitalize transition-colors',
                filter === f
                  ? 'bg-[var(--brand-primary)] text-white'
                  : 'bg-[var(--card-bg)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:bg-[var(--panel-bg)]'
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-[18px] border border-[var(--border-default)] bg-[var(--card-bg)] shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border-default)] bg-[var(--panel-bg)] text-left text-xs text-[var(--text-muted)]">
                <th className="px-4 py-3 font-medium">Business</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Integration</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Registered</th>
                <th className="px-4 py-3 font-medium">Last Payment</th>
                <th className="px-4 py-3 font-medium">MRR</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-b border-[var(--border-default)] transition-colors hover:bg-[var(--panel-bg)]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[rgba(99,119,255,0.10)] text-xs font-bold text-[var(--brand-primary)]">
                        {t.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">{t.name}</p>
                        <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                          {t.domain && (
                            <span className="flex items-center gap-0.5">
                              <Globe className="h-3 w-3" />{t.domain}
                            </span>
                          )}
                          {t.email && (
                            <span className="flex items-center gap-0.5">
                              <Mail className="h-3 w-3" />{t.email}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className="border-0 bg-[var(--panel-bg)] text-[10px] capitalize text-[var(--text-secondary)]">
                      {t.plan}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={cn(
                      'border-0 text-[10px]',
                      t.integration_type === 'link_only'
                        ? 'bg-[rgba(251,191,36,0.12)] text-[#FCD34D]'
                        : 'bg-[rgba(99,119,255,0.15)] text-[var(--brand-primary)]',
                    )}>
                      {t.integration_type === 'link_only' ? 'Link' : 'Full Web'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={cn(
                      'border-0 text-[10px] capitalize',
                      t.status === 'active' && 'bg-[rgba(74,222,128,0.12)] text-[#86EFAC]',
                      t.status === 'trial' && 'bg-[rgba(99,119,255,0.15)] text-[var(--brand-primary)]',
                      t.status === 'suspended' && 'bg-[rgba(251,191,36,0.12)] text-[#FCD34D]',
                      t.status === 'cancelled' && 'bg-[rgba(251,113,133,0.12)] text-[#FB7185]',
                    )}>
                      {t.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--text-muted)]">
                    {new Date(t.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--text-muted)]">
                    {t.last_payment_at ? new Date(t.last_payment_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-[var(--text-primary)]">
                    ${Number(t.monthly_amount || 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--panel-bg)] hover:text-[var(--text-secondary)]">
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="border-[var(--border-default)] bg-[var(--card-bg)]">
                        <DropdownMenuItem
                          onClick={() => router.push(`/super-admin/tenants/new?id=${t.id}`)}
                          className="cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        >
                          <Edit className="mr-2 h-3.5 w-3.5" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => toggleStatus(t)}
                          className="cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        >
                          <Power className="mr-2 h-3.5 w-3.5" />
                          {t.status === 'suspended' ? 'Activate' : 'Suspend'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="py-12 text-center">
            <Building2 className="mx-auto h-10 w-10 text-[var(--text-secondary)]" />
            <p className="mt-3 text-sm text-[var(--text-muted)]">No tenants found</p>
          </div>
        )}
      </div>
    </div>
  );
}
