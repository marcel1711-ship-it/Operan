'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { useAuth } from '@/lib/auth';
import { Loader2 } from 'lucide-react';

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
    <>
      <Sidebar />
      <div className="lg:pl-64">
        <div className="pb-16 lg:pb-0">{children}</div>
      </div>
    </>
  );
}
