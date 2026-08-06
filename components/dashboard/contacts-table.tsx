'use client';

import { useState, useMemo } from 'react';
import {
  Search,
  ArrowUpDown,
  Phone,
  Mail,
  Building2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatDate, initials } from '@/lib/format';
import type { Customer } from '@/lib/types';

type ContactsTableProps = {
  contacts: Customer[];
};

type SortKey = 'name' | 'company' | 'dateAdded';

export function ContactsTable({ contacts }: ContactsTableProps) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('dateAdded');
  const [asc, setAsc] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = contacts;
    if (q) {
      rows = rows.filter(
        (c) =>
          c.full_name.toLowerCase().includes(q) ||
          (c.email || '').toLowerCase().includes(q) ||
          (c.company_name || '').toLowerCase().includes(q) ||
          (c.phone || '').toLowerCase().includes(q),
      );
    }
    const sorted = [...rows].sort((a, b) => {
      let av: string;
      let bv: string;
      if (sortKey === 'name') {
        av = a.full_name;
        bv = b.full_name;
      } else if (sortKey === 'company') {
        av = a.company_name || '';
        bv = b.company_name || '';
      } else {
        av = a.created_at;
        bv = b.created_at;
      }
      const cmp = av.localeCompare(bv);
      return asc ? cmp : -cmp;
    });
    return sorted;
  }, [contacts, query, sortKey, asc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setAsc((v) => !v);
    else {
      setSortKey(key);
      setAsc(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-[var(--card-bg)] pl-9"
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {filtered.length} of {contacts.length}
        </span>
      </div>

      <div className="overflow-x-auto rounded-[18px] border border-border shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3">
                <button
                  className="flex items-center gap-1 font-medium hover:text-foreground"
                  onClick={() => toggleSort('name')}
                >
                  Customer <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              <th className="px-4 py-3 hidden md:table-cell">
                <button
                  className="flex items-center gap-1 font-medium hover:text-foreground"
                  onClick={() => toggleSort('company')}
                >
                  Company <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              <th className="px-4 py-3 hidden lg:table-cell">Contact Info</th>
              <th className="px-4 py-3 hidden sm:table-cell">Tags</th>
              <th className="px-4 py-3 text-right">
                <button
                  className="flex items-center gap-1 font-medium hover:text-foreground"
                  onClick={() => toggleSort('dateAdded')}
                >
                  Added <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  No customers found.
                </td>
              </tr>
            )}
            {filtered.map((c) => (
              <tr
                key={c.id}
                className="border-b border-border transition-colors hover:bg-secondary/30 last:border-0"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand-primary)]/10 text-xs font-bold text-[var(--brand-primary)]">
                      {initials(c.full_name)}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">
                        {c.full_name}
                      </p>
                      <p className="text-xs text-muted-foreground md:hidden">
                        {c.company_name || '—'}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5" />
                    {c.company_name || '—'}
                  </span>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  <div className="flex flex-col gap-1 text-xs">
                    {c.email && (
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Mail className="h-3.5 w-3.5" /> {c.email}
                      </span>
                    )}
                    {c.phone && (
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Phone className="h-3.5 w-3.5" /> {c.phone}
                      </span>
                    )}
                    {!c.email && !c.phone && (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {(c.tags || []).slice(0, 3).map((t) => (
                      <Badge
                        key={t}
                        variant="secondary"
                        className="bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]"
                      >
                        {t}
                      </Badge>
                    ))}
                    {(c.tags || []).length === 0 && (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
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
    </div>
  );
}
