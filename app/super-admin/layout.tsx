'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Shield, LayoutDashboard, Building2, CreditCard, Settings,
  Loader2, LogOut, ChevronDown, Plug, Anchor, Globe,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const navSections = [
  {
    label: 'Platform',
    items: [
      { href: '/super-admin', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/super-admin/tenants', label: 'Tenants', icon: Building2 },
      { href: '/super-admin/listings', label: 'Listings', icon: Globe },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/super-admin/billing', label: 'Billing', icon: CreditCard },
      { href: '/super-admin/integrations', label: 'Integrations', icon: Plug },
      { href: '/super-admin/settings', label: 'Settings', icon: Settings },
    ],
  },
];

const allNavItems = navSections.flatMap(s => s.items);

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, role, loading, signOut } = useAuth();
  const [showSignOut, setShowSignOut] = useState(false);

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace('/login');
      } else if (role && role !== 'super_admin') {
        router.replace('/admin');
      }
    }
  }, [loading, user, role, router]);

  if (loading || !user || role !== 'super_admin') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--brand-primary)]" />
      </div>
    );
  }

  const isActive = (href: string) =>
    pathname === href || (href !== '/super-admin' && pathname.startsWith(href));

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed left-0 top-0 z-50 hidden h-screen w-64 flex-col bg-sidebar lg:flex">
        <div className="flex items-center gap-3 px-6 py-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-[18px] bg-[var(--brand-primary)]">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold tracking-tight text-white">Super Admin</h1>
            <p className="text-xs text-sidebar-foreground">Platform Control</p>
          </div>
        </div>

        <nav className="sidebar-scroll flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
          {navSections.map((section) => (
            <div key={section.label} className="flex flex-col gap-0.5">
              <p className="px-3 pb-2 text-2xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {section.label}
              </p>
              {section.items.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                      active
                        ? 'bg-sidebar-active-bg text-[var(--brand-primary)]'
                        : 'text-sidebar-foreground hover:bg-sidebar-hover hover:text-white',
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-[18px] w-[18px] shrink-0 transition-colors',
                        active
                          ? 'text-[var(--brand-primary)]'
                          : 'text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]',
                      )}
                    />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-sidebar-border px-3 py-4">
          <button
            onClick={() => setShowSignOut(!showSignOut)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-sidebar-hover"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(99,119,255,0.20)] text-xs font-semibold text-[var(--brand-primary)]">
              {(user?.email || 'A').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-white">{user?.email || 'Unknown'}</p>
              <p className="truncate text-2xs text-sidebar-foreground">Super Admin</p>
            </div>
            <ChevronDown className={cn('h-3.5 w-3.5 text-[var(--text-muted)] transition-transform', showSignOut && 'rotate-180')} />
          </button>
          {showSignOut && (
            <div className="mt-2 flex gap-2 px-3 animate-fade-in">
              <Button size="sm" variant="outline" onClick={() => setShowSignOut(false)} className="flex-1 border-sidebar-border bg-transparent text-white hover:bg-sidebar-hover hover:text-white">
                Cancel
              </Button>
              <Button size="sm" onClick={signOut} className="flex-1 bg-destructive text-white hover:bg-destructive/90">
                <LogOut className="mr-1 h-3.5 w-3.5" />
                Sign Out
              </Button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-50 flex items-center justify-between bg-sidebar px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand-primary)]">
            <Shield className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-white">Super Admin</span>
        </div>
        <button onClick={signOut} className="text-[var(--text-muted)] hover:text-white">
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-sidebar-border bg-sidebar px-2 py-2 lg:hidden">
        {allNavItems.slice(0, 5).map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-2xs font-medium transition-colors',
                active ? 'text-[var(--brand-primary)]' : 'text-[var(--text-muted)] hover:text-white',
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="lg:pl-64">
        <div className="pb-16 lg:pb-0">{children}</div>
      </div>
    </>
  );
}
