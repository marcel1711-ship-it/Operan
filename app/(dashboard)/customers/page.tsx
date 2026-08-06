'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2, Users, Search, Phone, Mail, Building2,
  Plus, ArrowUpDown, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { fetchCustomersByTenant } from '@/lib/services/customer-service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDate, initials } from '@/lib/format';
import type { Customer } from '@/lib/types';

type SortKey = 'name' | 'created' | 'last_activity';

const PAGE_SIZE = 50;

export default function CustomersPage() {
  const router = useRouter();
  const { user, role, tenant, loading: authLoading } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('created');
  const [asc, setAsc] = useState(false);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async (tenantId: string) => {
    setLoading(true);
    try {
      const result = await fetchCustomersByTenant(tenantId, {
        search: debouncedSearch || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setCustomers(result.data);
      setTotal(result.total);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [debouncedSearch, page]);

  useEffect(() => {
    if (!authLoading) {
      if (!user) { router.push('/login'); return; }
      if (role === 'super_admin') { router.push('/super-admin'); return; }
      if (tenant) load(tenant.id);
    }
  }, [authLoading, user, role, tenant, router, load]);

  const sorted = useMemo(() => {
    return [...customers].sort((a, b) => {
      let av = '', bv = '';
      if (sortKey === 'name') { av = a.full_name; bv = b.full_name; }
      else if (sortKey === 'created') { av = a.created_at; bv = b.created_at; }
      else if (sortKey === 'last_activity') { av = a.last_activity_at || ''; bv = b.last_activity_at || ''; }
      const cmp = av.localeCompare(bv);
      return asc ? cmp : -cmp;
    });
  }, [customers, sortKey, asc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setAsc(!asc);
    else { setSortKey(key); setAsc(false); }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (role !== 'tenant_admin') return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-[var(--card-bg)] px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-dark shadow-md shadow-teal/20">
              <Users className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-foreground">Customers</h1>
              <p className="text-xs text-muted-foreground">{total} total customers</p>
            </div>
          </div>
          <Button className="bg-[var(--brand-primary)] text-primary-foreground hover:bg-primary/90">
            <Plus className="mr-2 h-4 w-4" /> Add Customer
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 space-y-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name, email, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-[var(--card-bg)] py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal/30"
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {sorted.length} of {total}
          </span>
        </div>

        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-[var(--card-bg)] py-20 shadow-sm">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="text-center">
              <h3 className="text-sm font-semibold text-foreground">
                {total === 0 ? 'No customers yet' : 'No matches found'}
              </h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                {total === 0
                  ? 'Customers are created automatically from bookings, or you can add them manually.'
                  : 'Try adjusting your search.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[18px] border border-border shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">
                    <button className="flex items-center gap-1 font-medium hover:text-foreground" onClick={() => toggleSort('name')}>
                      Customer <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-4 py-3 hidden md:table-cell">
                    <button className="flex items-center gap-1 font-medium hover:text-foreground" onClick={() => toggleSort('last_activity')}>
                      Last Activity <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-4 py-3 hidden lg:table-cell">Contact</th>
                  <th className="px-4 py-3 hidden sm:table-cell">Tags</th>
                  <th className="px-4 py-3 text-right">
                    <button className="flex items-center gap-1 font-medium hover:text-foreground" onClick={() => toggleSort('created')}>
                      Added <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => (
                  <tr key={c.id} className="border-b border-border transition-colors hover:bg-secondary/30 last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-bold text-[var(--brand-primary)]">
                          {initials(c.full_name)}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{c.full_name}</p>
                          {c.company_name && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Building2 className="h-3 w-3" /> {c.company_name}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">
                      {c.last_activity_at ? formatDate(c.last_activity_at) : '—'}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <div className="flex flex-col gap-1 text-xs">
                        {c.email && (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Mail className="h-3 w-3" /> {c.email}
                          </span>
                        )}
                        {c.phone && (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Phone className="h-3 w-3" /> {c.phone}
                          </span>
                        )}
                        {!c.email && !c.phone && <span className="text-muted-foreground">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {(c.tags || []).slice(0, 3).map((t) => (
                          <Badge key={t} variant="secondary" className="bg-[rgba(99,119,255,0.10)] text-[var(--brand-primary)]">{t}</Badge>
                        ))}
                        {(c.tags || []).length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                      {formatDate(c.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="border-border bg-[var(--card-bg)]"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {page + 1} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="border-border bg-[var(--card-bg)]"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
