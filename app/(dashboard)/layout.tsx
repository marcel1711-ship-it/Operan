'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar, SidebarProvider, useSidebar } from '@/components/sidebar';
import { ProductTour } from '@/components/dashboard/product-tour';
import { useAuth } from '@/lib/auth';
import { Loader2, Clock, Zap } from 'lucide-react';
import { trialDaysRemaining, isTrialActive, getPlanConfig } from '@/lib/plans';

function TrialBanner() {
  const { tenant } = useAuth();
  if (!tenant || tenant.status !== 'trial') return null;

  const days = trialDaysRemaining(tenant.trial_ends_at);
  const active = isTrialActive(tenant.trial_ends_at);
  const planName = getPlanConfig(tenant.plan).name;

  if (!active) {
    return (
      <div className="flex items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-4 py-2.5 text-sm dark:border-red-900 dark:bg-red-950/50">
        <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
          <Clock className="h-4 w-4" />
          <span>Your free trial has expired. Upgrade to continue using OPERAN.</span>
        </div>
        <a
          href="mailto:hello@operan.io"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
        >
          <Zap className="h-3 w-3" />
          Upgrade Now
        </a>
      </div>
    );
  }

  if (days <= 5) {
    return (
      <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm dark:border-amber-900 dark:bg-amber-950/50">
        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
          <Clock className="h-4 w-4" />
          <span>{days} day{days !== 1 ? 's' : ''} left on your {planName} trial.</span>
        </div>
        <a
          href="mailto:hello@operan.io"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
        >
          <Zap className="h-3 w-3" />
          Upgrade
        </a>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-blue-200 bg-blue-50 px-4 py-2 text-sm dark:border-blue-900 dark:bg-blue-950/50">
      <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
        <Clock className="h-4 w-4" />
        <span>{planName} trial · {days} day{days !== 1 ? 's' : ''} remaining</span>
      </div>
    </div>
  );
}

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();

  return (
    <div
      className="hidden transition-all duration-300 ease-in-out lg:block"
      style={{ paddingLeft: collapsed ? '72px' : '280px' }}
    >
      <div>{children}</div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, role, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/login');
      } else if (role === 'super_admin') {
        router.replace('/super-admin');
      }
    }
  }, [loading, user, role, router]);

  if (loading || !user || role === 'super_admin') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <Sidebar />
      <div className="pb-16 lg:hidden">
        <TrialBanner />
        {children}
      </div>
      <DashboardContent>
        <TrialBanner />
        {children}
      </DashboardContent>
      <ProductTour />
    </SidebarProvider>
  );
}
