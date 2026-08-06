'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Settings as SettingsIcon, Mail, KeyRound, CreditCard,
  Save, Loader2, CheckCircle2, DollarSign, Zap, Users, Crown,
  Link2, Layout, ExternalLink, Copy,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn, buildTenantUrl } from '@/lib/utils';

type PlanPricing = {
  id: string;
  plan: string;
  price: number;
  features: string[];
};

type Tenant = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  monthly_amount: number;
  integration_type: string;
  landing_page_url: string | null;
};

const planIcons: Record<string, any> = {
  starter: Zap,
  pro: Users,
  enterprise: Crown,
};

const planColors: Record<string, { text: string; bg: string }> = {
  starter: { text: 'text-[var(--brand-primary)]', bg: 'bg-[rgba(99,119,255,0.10)]' },
  pro: { text: 'text-[var(--brand-primary)]', bg: 'bg-[rgba(99,119,255,0.15)]' },
  enterprise: { text: 'text-[var(--text-secondary)]', bg: 'bg-[var(--border-default)]' },
};

export default function SettingsPage() {
  const { user } = useAuth();
  const [email, setEmail] = useState(user?.email || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [plans, setPlans] = useState<PlanPricing[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [editingPrices, setEditingPrices] = useState(false);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [savingPrices, setSavingPrices] = useState(false);

  const loadData = useCallback(async () => {
    const [planRes, tenantRes] = await Promise.all([
      supabase.from('plan_pricing').select('*').order('price', { ascending: true }),
      supabase.from('tenants').select('id, name, slug, plan, status, monthly_amount, integration_type, landing_page_url').order('name', { ascending: true }),
    ]);

    if (planRes.data) setPlans(planRes.data as PlanPricing[]);
    if (tenantRes.data) setTenants(tenantRes.data as Tenant[]);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }
    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: 'Password must be at least 8 characters' });
      return;
    }
    setSavingPassword(true);
    setMessage(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({ type: 'success', text: 'Password updated successfully' });
      setNewPassword('');
      setConfirmPassword('');
    }
    setSavingPassword(false);
  }

  function startEditingPrices() {
    const drafts: Record<string, string> = {};
    plans.forEach(p => { drafts[p.plan] = String(p.price); });
    setPriceDrafts(drafts);
    setEditingPrices(true);
  }

  async function savePrices() {
    setSavingPrices(true);
    for (const plan of plans) {
      const newPrice = parseFloat(priceDrafts[plan.plan]);
      if (!isNaN(newPrice) && newPrice !== plan.price) {
        await supabase.from('plan_pricing').update({ price: newPrice, updated_at: new Date().toISOString() }).eq('id', plan.id);
        await supabase.from('tenants').update({ monthly_amount: newPrice }).eq('plan', plan.plan).in('status', ['active', 'trial']);
      }
    }
    setSavingPrices(false);
    setEditingPrices(false);
    setMessage({ type: 'success', text: 'Prices updated — existing tenants on active/trial status have been updated too' });
    await loadData();
  }

  const planCounts: Record<string, number> = {};
  const planRevenue: Record<string, number> = {};
  tenants.forEach(t => {
    planCounts[t.plan] = (planCounts[t.plan] || 0) + 1;
    if (t.status === 'active' || t.status === 'trial') {
      planRevenue[t.plan] = (planRevenue[t.plan] || 0) + (Number(t.monthly_amount) || 0);
    }
  });

  const linkOnlyTenants = tenants.filter(t => t.integration_type === 'link_only');

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Settings</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Manage your account, plans, and platform configuration</p>
      </header>

      {message && (
        <div className={cn(
          'mb-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm',
          message.type === 'success'
            ? 'border-[rgba(74,222,128,0.20)] bg-[rgba(74,222,128,0.12)] text-[#86EFAC]'
            : 'border-[rgba(251,113,133,0.20)] bg-[rgba(251,113,133,0.12)] text-[#FB7185]'
        )}>
          {message.type === 'success' && <CheckCircle2 className="h-4 w-4" />}
          {message.text}
        </div>
      )}

      <div className="max-w-3xl space-y-6">
        {/* Plans & Pricing */}
        <div className="rounded-[18px] border border-[var(--border-default)] bg-[var(--card-bg)] p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <DollarSign className="h-4 w-4 text-[var(--brand-primary)]" />
              Plans & Pricing
            </h2>
            {editingPrices ? (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditingPrices(false)}
                  className="border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--panel-bg)]">
                  Cancel
                </Button>
                <Button size="sm" onClick={savePrices} disabled={savingPrices}
                  className="bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-hover)]">
                  {savingPrices ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                  Save Prices
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={startEditingPrices}
                className="border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--panel-bg)]">
                Edit Prices
              </Button>
            )}
          </div>

          <p className="mb-4 text-sm text-[var(--text-secondary)]">
            Each client business is assigned a plan when you create them. The plan determines
            how much they pay you per month. New tenants start with a 14-day free trial, then
            become active. You collect payment from them — Stripe is optional.
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            {plans.map((plan) => {
              const Icon = planIcons[plan.plan] || Zap;
              const colors = planColors[plan.plan] || planColors.starter;
              const count = planCounts[plan.plan] || 0;
              const revenue = planRevenue[plan.plan] || 0;
              return (
                <div key={plan.id} className="rounded-lg border border-[var(--border-default)] bg-[var(--panel-bg)] p-4">
                  <div className="flex items-center gap-2">
                    <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', colors.bg)}>
                      <Icon className={cn('h-4 w-4', colors.text)} />
                    </div>
                    <span className="text-sm font-bold capitalize text-[var(--text-primary)]">{plan.plan}</span>
                  </div>
                  {editingPrices ? (
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="text-lg font-bold text-[var(--text-primary)]">$</span>
                      <Input
                        type="number"
                        value={priceDrafts[plan.plan] || ''}
                        onChange={(e) => setPriceDrafts({ ...priceDrafts, [plan.plan]: e.target.value })}
                        className="h-8 w-20 border-[var(--border-default)] bg-[var(--card-bg)] text-lg font-bold text-[var(--text-primary)]"
                      />
                      <span className="text-xs text-[var(--text-muted)]">/mo</span>
                    </div>
                  ) : (
                    <p className="mt-2 text-2xl font-bold text-[var(--text-primary)]">
                      ${plan.price}
                      <span className="text-xs font-normal text-[var(--text-muted)]">/mo</span>
                    </p>
                  )}
                  <ul className="mt-3 space-y-1.5">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[11px] text-[var(--text-secondary)]">
                        <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-[var(--brand-primary)]" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 border-t border-[var(--border-default)] pt-2">
                    <p className="text-[11px] text-[var(--text-muted)]">
                      <span className="font-semibold text-[var(--text-secondary)]">{count}</span> tenant{count !== 1 ? 's' : ''} · ${revenue}/mo
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 rounded-lg bg-[var(--panel-bg)] p-3 text-[11px] text-[var(--text-muted)]">
            <p className="font-medium text-[var(--text-secondary)]">How billing works:</p>
            <ol className="mt-1.5 list-inside list-decimal space-y-1">
              <li>You create a tenant and assign them a plan (Starter, Pro, or Enterprise).</li>
              <li>The monthly amount is set automatically based on the plan price.</li>
              <li>New tenants get a 14-day free trial, then their status changes to "active".</li>
              <li>You collect payment from them (via Stripe, bank transfer, or however you prefer).</li>
              <li>Mark invoices as paid in the Billing page to track who has paid.</li>
            </ol>
          </div>
        </div>

        {/* How Links Work */}
        <div className="rounded-[18px] border border-[var(--border-default)] bg-[var(--card-bg)] p-5 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <Link2 className="h-4 w-4 text-[var(--brand-primary)]" />
            How Booking Links Work
          </h2>
          <div className="space-y-3 text-sm text-[var(--text-secondary)]">
            <div className="flex gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[rgba(99,119,255,0.10)] text-xs font-bold text-[var(--brand-primary)]">1</div>
              <p>
                <span className="font-medium text-[var(--text-primary)]">New Website tenants:</span> Their public
                booking page is automatically created at <code className="rounded bg-[var(--panel-bg)] px-1.5 py-0.5 text-[11px] text-[var(--brand-primary)]">/r/their-slug</code>.
                Every boat they add from their dashboard appears there automatically — no extra steps needed.
              </p>
            </div>
            <div className="flex gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[rgba(99,119,255,0.10)] text-xs font-bold text-[var(--brand-primary)]">2</div>
              <p>
                <span className="font-medium text-[var(--text-primary)]">Link / Embed tenants:</span> They keep
                their existing website. You share their booking link or embed code (found in the
                Edit Tenant page) so they can add a "Book Now" button or widget to their own site.
              </p>
            </div>
            <div className="flex gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[rgba(99,119,255,0.10)] text-xs font-bold text-[var(--brand-primary)]">3</div>
              <p>
                <span className="font-medium text-[var(--text-primary)]">Who manages listings:</span> Each tenant
                manages their own boats from their dashboard (Listings page). You don&apos;t need to
                add boats for them — they do it themselves once you create their account.
              </p>
            </div>
          </div>

          {linkOnlyTenants.length > 0 && (
            <div className="mt-4 border-t border-[var(--border-default)] pt-4">
              <p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">Link-only tenants and their booking URLs:</p>
              <div className="space-y-2">
                {linkOnlyTenants.map(t => (
                  <div key={t.id} className="flex items-center justify-between rounded-lg border border-[var(--border-default)] bg-[var(--panel-bg)] px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">{t.name}</p>
                      <p className="text-[11px] text-[var(--text-muted)]">{t.landing_page_url || 'No website URL set'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="rounded bg-[var(--card-bg)] px-2 py-1 text-[11px] text-[var(--brand-primary)]">
                        /r/{t.slug}
                      </code>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                        onClick={() => {
                          if (typeof window !== 'undefined') {
                            navigator.clipboard?.writeText(buildTenantUrl(t.slug));
                          }
                        }}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Account */}
        <div className="rounded-[18px] border border-[var(--border-default)] bg-[var(--card-bg)] p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <Mail className="h-4 w-4 text-[var(--brand-primary)]" />
            Your Account
          </h2>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--text-secondary)]">Email Address</Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="border-[var(--border-default)] bg-[var(--panel-bg)] text-[var(--text-primary)]"
                disabled
              />
              <p className="text-[11px] text-[var(--text-muted)]">Contact support to change your email address</p>
            </div>
          </div>
        </div>

        {/* Password */}
        <div className="rounded-[18px] border border-[var(--border-default)] bg-[var(--card-bg)] p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <KeyRound className="h-4 w-4 text-[var(--brand-primary)]" />
            Change Password
          </h2>
          <form onSubmit={handlePasswordChange} className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--text-secondary)]">New Password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                className="border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-primary)]"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--text-secondary)]">Confirm Password</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-primary)]"
                required
              />
            </div>
            <Button type="submit" disabled={savingPassword || !newPassword || !confirmPassword}
              className="bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-hover)]">
              {savingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Update Password
            </Button>
          </form>
        </div>

        {/* Stripe Connect */}
        <div className="rounded-[18px] border border-[var(--border-default)] bg-[var(--card-bg)] p-5 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <CreditCard className="h-4 w-4 text-[var(--brand-primary)]" />
            Stripe Connect (Optional)
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Stripe is optional. If connected, it lets tenants pay you automatically each month
            instead of you collecting payment manually. Without Stripe, you simply mark invoices
            as paid in the Billing page after receiving payment.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <Badge className="border-0 bg-[rgba(251,191,36,0.12)] text-[#FCD34D]">Not Connected</Badge>
            <Button variant="outline" disabled className="border-[var(--border-default)] text-[var(--text-muted)]">
              Connect Stripe
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-[var(--text-muted)]">
            Requires Stripe API keys. Contact your platform administrator to configure.
          </p>
        </div>

        {/* Support */}
        <div className="rounded-[18px] border border-[var(--border-default)] bg-[var(--card-bg)] p-5 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <SettingsIcon className="h-4 w-4 text-[var(--brand-primary)]" />
            Support
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">For technical support or platform questions, contact:</p>
          <a href="mailto:support@charterops.com" className="mt-2 inline-flex items-center gap-2 text-sm text-[var(--brand-primary)] hover:underline">
            <Mail className="h-4 w-4" />
            support@charterops.com
          </a>
        </div>
      </div>
    </div>
  );
}
