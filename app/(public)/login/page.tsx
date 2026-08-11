'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Loader2, AlertCircle, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
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
  const [showPassword, setShowPassword] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

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

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setResetLoading(true);
    setError(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setError(error.message);
    } else {
      setResetSent(true);
    }
    setResetLoading(false);
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
          <Image
            src="/Logo.png"
            alt="OPERAN"
            width={96}
            height={96}
            className="rounded-[18px]"
          />
          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-white">OPERAN</h1>
            <p className="mt-1 text-sm text-[#71717A]">
              Marine Experience Operations Platform
            </p>
          </div>
        </div>

        {/* Card */}
        {forgotMode ? (
          <div className="space-y-5 rounded-[24px] border border-white/[0.06] bg-[#0F172A] p-7 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.25),0_2px_6px_-2px_rgba(0,0,0,0.12)]">
            {resetSent ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <CheckCircle2 className="h-10 w-10 text-green-400" />
                <p className="text-center text-sm text-white">
                  Password reset link sent to <span className="font-semibold">{email}</span>
                </p>
                <p className="text-center text-xs text-[#71717A]">
                  Check your email and follow the link to reset your password.
                </p>
                <button
                  onClick={() => { setForgotMode(false); setResetSent(false); }}
                  className="mt-2 text-sm text-[var(--brand-primary)] hover:underline"
                >
                  Back to Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-white">Reset Password</h2>
                  <p className="mt-1 text-xs text-[#71717A]">
                    Enter your email and we&apos;ll send you a link to reset your password.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reset-email" className="text-xs font-medium text-[#A1A1AA]">
                    Email
                  </Label>
                  <Input
                    id="reset-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="border-white/[0.08] bg-[#151E2E] text-white placeholder:text-[#52525B]"
                    autoComplete="email"
                    required
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
                  disabled={resetLoading || !email.trim()}
                  className="w-full bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-hover)] disabled:opacity-40"
                >
                  {resetLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    'Send Reset Link'
                  )}
                </Button>

                <button
                  type="button"
                  onClick={() => { setForgotMode(false); setError(null); }}
                  className="w-full text-center text-xs text-[#71717A] hover:text-[#A1A1AA] transition-colors"
                >
                  Back to Sign In
                </button>
              </form>
            )}
          </div>
        ) : (
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
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-medium text-[#A1A1AA]">
                  Password
                </Label>
                <button
                  type="button"
                  onClick={() => { setForgotMode(true); setError(null); }}
                  className="text-xs text-[var(--brand-primary)] hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="border-white/[0.08] bg-[#151E2E] pr-10 text-white placeholder:text-[#52525B]"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#52525B] hover:text-[#A1A1AA] transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
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
        )}

        <p className="mt-6 text-center text-xs text-[#52525B]">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-[#6377FF] hover:underline">
            Start Free Trial
          </Link>
        </p>
      </div>
    </div>
  );
}
