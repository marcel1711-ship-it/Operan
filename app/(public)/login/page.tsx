'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, AlertCircle, Compass } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const router = useRouter();
  const { signIn, session, loading, role } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && session && role) {
      router.push(role === 'super_admin' ? '/super-admin' : '/admin');
    }
  }, [loading, session, role, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setSubmitting(true);
    setError(null);

    const { error: signInError, role: userRole } = await signIn(email.trim(), password);

    if (signInError) {
      setError(signInError);
      setSubmitting(false);
      return;
    }

    if (userRole === 'super_admin') {
      router.push('/super-admin');
    } else if (userRole === 'tenant_admin') {
      router.push('/admin');
    } else {
      setError('No tenant assigned to this account.');
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070B14] px-4">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--brand-primary)]/[0.06] blur-[140px]" />
      </div>

      <div className="relative w-full max-w-[400px]">
        {/* Brand */}
        <div className="mb-10 flex flex-col items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-[14px] border border-[rgba(99,119,255,0.20)] bg-[rgba(99,119,255,0.10)]">
            <Compass className="h-7 w-7 text-[var(--brand-primary)]" strokeWidth={1.5} />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-white">OPERAN</h1>
            <p className="mt-1 text-sm text-[#71717A]">
              Marine Experience Operations Platform
            </p>
          </div>
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-[24px] border border-white/[0.06] bg-[#0F172A] p-7 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.25),0_2px_6px_-2px_rgba(0,0,0,0.12)]"
        >
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-medium text-[#A1A1AA]">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="border-white/[0.08] bg-[#151E2E] text-white placeholder:text-[#52525B]"
              autoComplete="email"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs font-medium text-[#A1A1AA]">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="border-white/[0.08] bg-[#151E2E] text-white placeholder:text-[#52525B]"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-[12px] border border-destructive/20 bg-destructive/[0.08] px-3 py-2.5 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button
            type="submit"
            disabled={submitting || !email.trim() || !password}
            className="w-full bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-hover)] active:bg-[#4458F2] disabled:opacity-40"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-[#52525B]">
          Contact your administrator for account access.
        </p>
      </div>
    </div>
  );
}
