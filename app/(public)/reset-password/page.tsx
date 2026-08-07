'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Loader2, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true);
      }
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
      setTimeout(() => router.push('/login'), 3000);
    }
    setLoading(false);
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070B14] px-4">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--brand-primary)]/[0.06] blur-[140px]" />
      </div>

      <div className="relative w-full max-w-[400px]">
        <div className="mb-10 flex flex-col items-center gap-4">
          <Image src="/Logo.png" alt="OPERAN" width={56} height={56} className="rounded-[14px]" />
          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-white">OPERAN</h1>
            <p className="mt-1 text-sm text-[#71717A]">Reset your password</p>
          </div>
        </div>

        <div className="space-y-5 rounded-[24px] border border-white/[0.06] bg-[#0F172A] p-7 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.25),0_2px_6px_-2px_rgba(0,0,0,0.12)]">
          {success ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <CheckCircle2 className="h-10 w-10 text-green-400" />
              <p className="text-center text-sm text-white">Password updated successfully!</p>
              <p className="text-center text-xs text-[#71717A]">Redirecting to login...</p>
            </div>
          ) : !ready ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--brand-primary)]" />
              <p className="text-center text-sm text-[#71717A]">Verifying reset link...</p>
              <p className="text-center text-xs text-[#52525B]">
                If this takes too long, the link may have expired.{' '}
                <button onClick={() => router.push('/login')} className="text-[var(--brand-primary)] hover:underline">
                  Request a new one
                </button>
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="new-password" className="text-xs font-medium text-[#A1A1AA]">
                  New Password
                </Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="border-white/[0.08] bg-[#151E2E] pr-10 text-white placeholder:text-[#52525B]"
                    required
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

              <div className="space-y-1.5">
                <Label htmlFor="confirm-password" className="text-xs font-medium text-[#A1A1AA]">
                  Confirm Password
                </Label>
                <Input
                  id="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="border-white/[0.08] bg-[#151E2E] text-white placeholder:text-[#52525B]"
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
                disabled={loading || !password || !confirmPassword}
                className="w-full bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-hover)] disabled:opacity-40"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Update Password'
                )}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
