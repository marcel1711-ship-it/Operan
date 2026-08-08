'use client';

import { useState, createContext, useContext, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Ship, CalendarDays, FileSignature, Compass,
  LogOut, ChevronDown, ClipboardList, Users, GitBranch,
  Zap, Mail, Plug, Building2, Palette, Bell, Receipt,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';

const SidebarContext = createContext<{ collapsed: boolean; setCollapsed: (v: boolean) => void }>({
  collapsed: false,
  setCollapsed: () => {},
});
export const useSidebar = () => useContext(SidebarContext);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
      {children}
    </SidebarContext.Provider>
  );
}

const navSections = [
  {
    label: 'Operations',
    items: [
      { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/reservations', label: 'Reservations', icon: CalendarDays },
      { href: '/listings/manage', label: 'Listings', icon: Ship },
      { href: '/customers', label: 'Customers', icon: Users },
      { href: '/pipelines', label: 'Pipelines', icon: GitBranch },
      { href: '/automations', label: 'Automations', icon: Zap },
    ],
  },
  {
    label: 'Communication',
    items: [
      { href: '/communications', label: 'Templates', icon: Mail },
      { href: '/forms', label: 'Documents', icon: ClipboardList },
      { href: '/waivers', label: 'Signed Docs', icon: FileSignature },
    ],
  },
  {
    label: 'Platform',
    items: [
      { href: '/integrations', label: 'Integrations', icon: Plug },
    ],
  },
  {
    label: 'Settings',
    items: [
      { href: '/settings', label: 'Company', icon: Building2 },
      { href: '/settings', label: 'Branding', icon: Palette },
      { href: '/settings', label: 'Notifications', icon: Bell },
      { href: '/settings', label: 'Billing', icon: Receipt },
    ],
  },
];

const mobileNavItems = [
  { href: '/admin', label: 'Home', icon: LayoutDashboard },
  { href: '/reservations', label: 'Reservations', icon: CalendarDays },
  { href: '/listings/manage', label: 'Listings', icon: Ship },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/integrations', label: 'Integrations', icon: Plug },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, signOut, tenant } = useAuth();
  const [showSignOut, setShowSignOut] = useState(false);
  const { collapsed, setCollapsed } = useSidebar();

  const isActive = (href: string) =>
    pathname === href || (href !== '/admin' && pathname.startsWith(href));

  const companyInitials = (tenant?.name || 'CO')
    .split(' ')
    .map((w) => w.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const sidebarWidth = collapsed ? '72px' : '280px';

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="fixed left-0 top-0 z-50 hidden h-screen flex-col lg:flex transition-all duration-300 ease-in-out"
        style={{
          width: sidebarWidth,
          background: 'var(--sidebar-bg)',
          borderRight: '1px solid var(--border-default)',
        }}
      >
        {/* Logo / Brand */}
        <div className={cn('pt-10 pb-8 transition-all duration-300', collapsed ? 'px-3' : 'px-6')}>
          <div className={cn('flex items-center', collapsed ? 'justify-center' : 'gap-3.5')}>
            <div
              className={cn(
                'shrink-0 flex items-center justify-center rounded-[14px] border border-[var(--brand-primary)]/20 bg-[var(--brand-primary)]/[0.10] transition-all duration-300',
                collapsed ? 'h-10 w-10' : 'h-[52px] w-[52px]'
              )}
            >
              <Compass className={cn('text-[var(--brand-primary)] transition-all duration-300', collapsed ? 'h-5 w-5' : 'h-7 w-7')} strokeWidth={1.5} />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <h1
                  className="truncate font-semibold text-white"
                  style={{ fontSize: '18px', lineHeight: '1.3' }}
                >
                  {tenant?.name || 'OPERAN'}
                </h1>
                <p
                  className="truncate"
                  style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}
                >
                  Marine Operations
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className={cn('sidebar-scroll flex flex-1 flex-col overflow-y-auto pb-4 transition-all duration-300', collapsed ? 'px-2' : 'px-4')}>
          {navSections.map((section) => (
            <div key={section.label} className="flex flex-col" style={{ marginBottom: collapsed ? '16px' : '28px' }}>
              {!collapsed && (
                <p
                  className="font-medium uppercase"
                  style={{
                    fontSize: '11px',
                    letterSpacing: '0.15em',
                    color: 'var(--sidebar-label)',
                    marginBottom: '14px',
                    paddingLeft: '16px',
                  }}
                >
                  {section.label}
                </p>
              )}
              {collapsed && (
                <div className="mx-auto mb-2 h-px w-6" style={{ background: 'var(--border-default)' }} />
              )}
              <div className="flex flex-col" style={{ gap: collapsed ? '4px' : '6px' }}>
                {section.items.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href + item.label}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        'group relative flex items-center border border-transparent nav-item-transition',
                        active && 'nav-item-active',
                        collapsed && 'justify-center'
                      )}
                      style={{
                        height: collapsed ? '42px' : '46px',
                        borderRadius: '14px',
                        paddingLeft: collapsed ? '0' : '16px',
                        paddingRight: collapsed ? '0' : '16px',
                      }}
                      onMouseEnter={(e) => {
                        if (!active) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                      }}
                      onMouseLeave={(e) => {
                        if (!active) e.currentTarget.style.background = 'rgba(255, 255, 255, 0)';
                      }}
                    >
                      <Icon
                        className="shrink-0 transition-colors duration-200"
                        style={{
                          height: '20px',
                          width: '20px',
                          color: active ? 'var(--brand-hover)' : 'var(--text-muted)',
                        }}
                      />
                      {!collapsed && (
                        <span
                          className="ml-3 nav-label font-medium transition-colors duration-200"
                          style={{
                            fontSize: '15px',
                            color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                          }}
                        >
                          {item.label}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Collapse toggle */}
        <div className={cn('px-4 pb-2 transition-all duration-300', collapsed && 'px-2')}>
          <button
            onClick={() => { setCollapsed(!collapsed); setShowSignOut(false); }}
            className="flex w-full items-center justify-center rounded-[12px] py-2.5 text-[var(--text-muted)] transition-colors hover:bg-white/[0.05] hover:text-[var(--text-primary)]"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-[18px] w-[18px]" />
            ) : (
              <div className="flex w-full items-center gap-2 px-3">
                <PanelLeftClose className="h-[18px] w-[18px]" />
                <span style={{ fontSize: '13px' }}>Collapse</span>
              </div>
            )}
          </button>
        </div>

        {/* Bottom Account Card */}
        <div className={cn('pb-6 transition-all duration-300', collapsed ? 'px-2' : 'px-4')}>
          {collapsed ? (
            <button
              onClick={signOut}
              title="Sign out"
              className="flex w-full items-center justify-center rounded-[12px] py-2.5 transition-colors hover:bg-white/[0.05]"
            >
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-sm font-semibold text-white"
                style={{ background: 'var(--brand-primary)' }}
              >
                {companyInitials}
              </div>
            </button>
          ) : (
            <div
              className="overflow-hidden"
              style={{
                borderRadius: '16px',
                padding: '16px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid var(--border-default)',
              }}
            >
              <button
                onClick={() => setShowSignOut(!showSignOut)}
                className="flex w-full items-center gap-3 text-left"
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-sm font-semibold text-white"
                  style={{ background: 'var(--brand-primary)' }}
                >
                  {companyInitials}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate font-medium text-white"
                    style={{ fontSize: '15px', lineHeight: '1.3' }}
                  >
                    {tenant?.name || 'OPERAN'}
                  </p>
                  <p
                    className="truncate"
                    style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}
                  >
                    {user?.email || 'Operations'}
                  </p>
                </div>
                <ChevronDown
                  className={cn('shrink-0 transition-transform duration-200')}
                  style={{
                    height: '18px',
                    width: '18px',
                    color: 'var(--text-muted)',
                    transform: showSignOut ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}
                />
              </button>
              {showSignOut && (
                <div className="mt-4 flex gap-2 animate-fade-in">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowSignOut(false)}
                    className="flex-1 border-white/10 bg-transparent text-white hover:bg-white/5 hover:text-white"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={signOut}
                    className="flex-1 bg-destructive text-white hover:bg-destructive/90"
                  >
                    <LogOut className="mr-1 h-3.5 w-3.5" />
                    Sign Out
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Mobile top bar */}
      <header
        className="sticky top-0 z-50 flex items-center justify-between px-4 py-3 lg:hidden"
        style={{
          background: 'var(--sidebar-bg)',
          borderBottom: '1px solid var(--border-default)',
        }}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-[var(--brand-primary)]/20 bg-[var(--brand-primary)]/[0.10]">
            <Compass className="h-4 w-4 text-[var(--brand-primary)]" strokeWidth={1.5} />
          </div>
          <span className="text-sm font-semibold text-white">{tenant?.name || 'OPERAN'}</span>
        </div>
        <button onClick={signOut} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      {/* Mobile bottom nav */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-2 py-2 lg:hidden"
        style={{
          background: 'var(--sidebar-bg)',
          borderTop: '1px solid var(--border-default)',
        }}
      >
        {mobileNavItems.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-1 rounded-[10px] px-2 py-1.5 text-2xs font-medium transition-colors',
                active ? 'text-[var(--brand-hover)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
