'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Loader2, AlertCircle, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function RegisterPage() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || !businessName.trim() || !email.trim() || !password) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          businessName: businessName.trim(),
          email: email.trim(),
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Registration failed. Please try again.');
        setSubmitting(false);
        return;
      }

      setSuccess(true);

      const { error: signInError } = await signIn(email.trim(), password);
      if (!signInError) {
        router.push('/admin');
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    }
    setSubmitting(false);
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070B14] px-4">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#6377FF]/[0.06] blur-[140px]" />
      </div>

      <div className="relative w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center gap-4">
          <Image
            src="/Logo.png"
            alt="OPERAN"
            width={80}
            height={80}
            className="rounded-[18px]"
          />
          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-white">Start Your Free Trial</h1>
            <p className="mt-1 text-sm text-[#71717A]">
              14 days free · No credit card required
            </p>
          </div>
        </div>

        {success ? (
          <div className="flex flex-col items-center gap-4 rounded-[24px] border border-white/[0.06] bg-[#0F172A] p-7 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.25)]">
            <CheckCircle2 className="h-12 w-12 text-green-400" />
            <div className="text-center">
              <p className="text-lg font-semibold text-white">Welcome to OPERAN!</p>
              <p className="mt-2 text-sm text-[#94A3B8]">
                Your account has been created. Redirecting to your dashboard...
              </p>
            </div>
            <Loader2 className="h-5 w-5 animate-spin text-[#6377FF]" />
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-[24px] border border-white/[0.06] bg-[#0F172A] p-7 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.25),0_2px_6px_-2px_rgba(0,0,0,0.12)]"
          >
            <div className="space-y-1.5">
              <Label htmlFor="fullName" className="text-xs font-medium text-[#A1A1AA]">
                Full Name
              </Label>
              <Input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="John Smith"
                className="border-white/[0.08] bg-[#151E2E] text-white placeholder:text-[#52525B]"
                autoComplete="name"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="businessName" className="text-xs font-medium text-[#A1A1AA]">
                Business Name
              </Label>
              <Input
                id="businessName"
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Miami Sea Adventures"
                className="border-white/[0.08] bg-[#151E2E] text-white placeholder:text-[#52525B]"
                required
              />
            </div>

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
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-medium text-[#A1A1AA]">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  className="border-white/[0.08] bg-[#151E2E] pr-10 text-white placeholder:text-[#52525B]"
                  autoComplete="new-password"
                  minLength={8}
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

            {error && (
              <div className="flex items-center gap-2 rounded-[12px] border border-destructive/20 bg-destructive/[0.08] px-3 py-2.5 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={submitting || !fullName.trim() || !businessName.trim() || !email.trim() || !password}
              className="w-full bg-[#6377FF] text-white hover:bg-[#5063E8] active:bg-[#4458F2] disabled:opacity-40"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating your account...
                </>
              ) : (
                'Start Free Trial'
              )}
            </Button>

            <p className="text-center text-xs text-[#52525B]">
              Already have an account?{' '}
              <Link href="/login" className="text-[#6377FF] hover:underline">
                Log in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
