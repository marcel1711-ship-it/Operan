'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Loader2, ArrowLeft, Save, Building2, Mail, Globe,
  Palette, Shield, KeyRound, CheckCircle2, Link2, Layout,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn, buildTenantUrl } from '@/lib/utils';

type FormData = {
  name: string;
  slug: string;
  email: string;
  plan: string;
  template: string;
  domain: string;
  primary_color: string;
  secondary_color: string;
  tempPassword: string;
  integration_type: string;
  existing_website_url: string;
};

const defaultPlanPrices: Record<string, number> = {
  free: 0,
  starter: 79,
  pro: 149,
  enterprise: 499,
};

function generateTempPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
  let pwd = '';
  for (let i = 0; i < 12; i++) {
    pwd += chars[Math.floor(Math.random() * chars.length)];
  }
  return pwd;
}

export default function CreateEditTenantPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('id');

  const [form, setForm] = useState<FormData>({
    name: '', slug: '', email: '', plan: 'starter', template: 'default',
    domain: '', primary_color: '#0d9488', secondary_color: '#0f766e',
    tempPassword: '', integration_type: 'new_web', existing_website_url: '',
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!editId);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createdUser, setCreatedUser] = useState<{ email: string; password: string } | null>(null);
  const [planPrices, setPlanPrices] = useState<Record<string, number>>(defaultPlanPrices);

  useEffect(() => {
    supabase.from('plan_pricing').select('plan, price').then(({ data }) => {
      if (data) {
        const prices: Record<string, number> = {};
        (data as { plan: string; price: number }[]).forEach(p => { prices[p.plan] = Number(p.price); });
        setPlanPrices({ ...defaultPlanPrices, ...prices });
      }
    });
  }, []);

  const loadTenant = useCallback(async () => {
    if (!editId) return;
    const { data } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', editId)
      .maybeSingle();

    if (data) {
      setForm({
        name: data.name || '',
        slug: data.slug || '',
        email: data.email || '',
        plan: data.plan || 'starter',
        template: data.template || 'default',
        domain: data.domain || '',
        primary_color: data.primary_color || '#0d9488',
        secondary_color: data.secondary_color || '#0f766e',
        tempPassword: '',
        integration_type: data.integration_type || 'new_web',
        existing_website_url: data.landing_page_url || '',
      });
    }
    setLoading(false);
  }, [editId]);

  useEffect(() => {
    if (editId) loadTenant();
  }, [editId, loadTenant]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.slug.trim()) return;
    setSaving(true);
    setError(null);
    setSuccess(null);

    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim().toLowerCase().replace(/\s+/g, '-'),
      email: form.email.trim() || null,
      plan: form.plan,
      template: form.template,
      domain: form.domain.trim() || null,
      primary_color: form.primary_color,
      secondary_color: form.secondary_color,
      integration_type: form.integration_type,
      landing_page_url: form.integration_type === 'link_only' ? form.existing_website_url.trim() || null : null,
      monthly_amount: planPrices[form.plan] ?? 0,
      status: editId ? undefined : 'trial',
      trial_ends_at: editId ? undefined : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      next_renewal_at: editId ? undefined : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };

    if (editId) {
      const { error: err } = await supabase.from('tenants').update(payload).eq('id', editId);
      if (err) {
        setError(err.message);
      } else {
        setSuccess('Tenant updated successfully');
        setTimeout(() => router.push('/super-admin/tenants'), 1000);
      }
    } else {
      const { data, error: err } = await supabase.from('tenants').insert(payload).select().single();
      if (err) {
        setError(err.message);
      } else if (data && form.email.trim() && form.tempPassword) {
          try {
            const resp = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/signup`, {
              method: 'POST',
              headers: {
                'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                email: form.email.trim(),
                password: form.tempPassword,
                data: { full_name: form.name.trim() },
              }),
            });
            const json = await resp.json();
            if (json.user) {
              await supabase.from('tenant_users').insert({
                tenant_id: data.id,
                user_id: json.user.id,
                role: 'tenant_admin',
              });
              setCreatedUser({ email: form.email.trim(), password: form.tempPassword });
            }
          } catch {
            setError('Tenant created but failed to create admin user. You can link a user manually.');
          }
          setSuccess('Tenant created successfully');
        }
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--panel-bg)]">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--brand-primary)]" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <button
        onClick={() => router.push('/super-admin/tenants')}
        className="mb-4 flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Tenants
      </button>

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">
          {editId ? 'Edit Tenant' : 'Create New Tenant'}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {editId ? 'Update business details and plan' : 'Set up a new client account'}
        </p>
      </header>

      {error && (
        <div className="mb-4 rounded-[18px] border border-[rgba(251,113,133,0.20)] bg-[rgba(251,113,133,0.12)] px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 flex items-center gap-2 rounded-[18px] border border-[rgba(74,222,128,0.20)] bg-[rgba(74,222,128,0.12)] px-4 py-3 text-sm text-[#86EFAC]">
          <CheckCircle2 className="h-4 w-4" />
          {success}
        </div>
      )}
      {createdUser && (
        <div className="mb-4 rounded-[18px] border border-[rgba(99,119,255,0.20)] bg-[rgba(99,119,255,0.05)] px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium text-[var(--brand-primary)]">
            <KeyRound className="h-4 w-4" />
            Admin credentials created
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Email: <span className="font-mono font-semibold text-[var(--text-primary)]">{createdUser.email}</span>
          </p>
          <p className="text-xs text-[var(--text-secondary)]">
            Password: <span className="font-mono font-semibold text-[var(--text-primary)]">{createdUser.password}</span>
          </p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            Share these credentials with the tenant admin. They can change the password after first login.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        {/* Business Info */}
        <div className="rounded-[18px] border border-[var(--border-default)] bg-[var(--card-bg)] p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <Building2 className="h-4 w-4 text-[var(--brand-primary)]" />
            Business Information
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--text-secondary)]">Business Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="BBR Boat Rentals"
                className="border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--text-secondary)]">Slug *</Label>
              <Input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="bbr"
                className="border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--text-secondary)]">Admin Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="admin@business.com"
                className="border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              />
              {!editId && (
                <p className="text-[11px] text-[var(--text-muted)]">Used to create the tenant admin account</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--text-secondary)]">Custom Domain</Label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <Input
                  value={form.domain}
                  onChange={(e) => setForm({ ...form, domain: e.target.value })}
                  placeholder="bookings.example.com"
                  className="border-[var(--border-default)] bg-[var(--card-bg)] pl-10 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Integration Type */}
        <div className="rounded-[18px] border border-[var(--border-default)] bg-[var(--card-bg)] p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <Link2 className="h-4 w-4 text-[var(--brand-primary)]" />
            Integration Type
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, integration_type: 'new_web' })}
              className={cn(
                'rounded-[18px] border p-4 text-left transition-all',
                form.integration_type === 'new_web'
                  ? 'border-[var(--brand-primary)] bg-[rgba(99,119,255,0.05)] ring-1 ring-teal/30'
                  : 'border-[var(--border-default)] bg-[var(--panel-bg)] hover:border-[var(--text-secondary)]'
              )}
            >
              <Layout className="mb-2 h-5 w-5 text-[var(--brand-primary)]" />
              <p className="text-sm font-medium text-[var(--text-primary)]">New Website</p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                We build and host their full public landing page with all listings.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, integration_type: 'link_only' })}
              className={cn(
                'rounded-[18px] border p-4 text-left transition-all',
                form.integration_type === 'link_only'
                  ? 'border-[var(--brand-primary)] bg-[rgba(99,119,255,0.05)] ring-1 ring-teal/30'
                  : 'border-[var(--border-default)] bg-[var(--panel-bg)] hover:border-[var(--text-secondary)]'
              )}
            >
              <Link2 className="mb-2 h-5 w-5 text-[var(--brand-primary)]" />
              <p className="text-sm font-medium text-[var(--text-primary)]">Link / Embed Only</p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                They keep their existing website. We provide a &quot;Book Now&quot; link or embeddable widget.
              </p>
            </button>
          </div>
          {form.integration_type === 'link_only' && (
            <div className="mt-4 space-y-1.5">
              <Label className="text-xs text-[var(--text-secondary)]">Existing Website URL</Label>
              <Input
                value={form.existing_website_url}
                onChange={(e) => setForm({ ...form, existing_website_url: e.target.value })}
                placeholder="https://bigmikeseadventures.com"
                className="border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              />
              <p className="text-[11px] text-[var(--text-muted)]">
                Their current website. We&apos;ll generate booking links and an embed code for them to add.
              </p>
            </div>
          )}
        </div>

        {/* Plan & Template */}
        <div className="rounded-[18px] border border-[var(--border-default)] bg-[var(--card-bg)] p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <Shield className="h-4 w-4 text-[var(--brand-primary)]" />
            Plan & Template
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--text-secondary)]">Plan</Label>
              <Select value={form.plan} onValueChange={(v) => setForm({ ...form, plan: v })}>
                <SelectTrigger className="border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-primary)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free — $0/mo</SelectItem>
                  <SelectItem value="starter">Starter — ${planPrices.starter}/mo</SelectItem>
                  <SelectItem value="pro">Pro — ${planPrices.pro}/mo</SelectItem>
                  <SelectItem value="enterprise">Enterprise — ${planPrices.enterprise}/mo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--text-secondary)]">Template</Label>
              <Select value={form.template} onValueChange={(v) => setForm({ ...form, template: v })}>
                <SelectTrigger className="border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-primary)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="premium">Premium</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-3">
            <Badge className="border-0 bg-[rgba(99,119,255,0.10)] text-[10px] text-[var(--brand-primary)]">
              ${planPrices[form.plan]}/month
            </Badge>
          </div>
        </div>

        {/* Branding */}
        <div className="rounded-[18px] border border-[var(--border-default)] bg-[var(--card-bg)] p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <Palette className="h-4 w-4 text-[var(--brand-primary)]" />
            Branding
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--text-secondary)]">Primary Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.primary_color}
                  onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                  className="h-9 w-12 rounded-lg border border-[var(--border-default)] bg-transparent"
                />
                <Input
                  value={form.primary_color}
                  onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                  className="border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-primary)]"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--text-secondary)]">Secondary Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.secondary_color}
                  onChange={(e) => setForm({ ...form, secondary_color: e.target.value })}
                  className="h-9 w-12 rounded-lg border border-[var(--border-default)] bg-transparent"
                />
                <Input
                  value={form.secondary_color}
                  onChange={(e) => setForm({ ...form, secondary_color: e.target.value })}
                  className="border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-primary)]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Temp password (create only) */}
        {!editId && form.email.trim() && (
          <div className="rounded-[18px] border border-[var(--border-default)] bg-[var(--card-bg)] p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <KeyRound className="h-4 w-4 text-[var(--brand-primary)]" />
              Temporary Password
            </h2>
            <div className="flex gap-2">
              <Input
                value={form.tempPassword}
                onChange={(e) => setForm({ ...form, tempPassword: e.target.value })}
                placeholder="Click generate to create a temp password"
                className="border-[var(--border-default)] bg-[var(--card-bg)] font-mono text-[var(--text-primary)]"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setForm({ ...form, tempPassword: generateTempPassword() })}
                className="border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--panel-bg)]"
              >
                Generate
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-[var(--text-muted)]">
              This password will be used to create the admin account. The tenant admin can change it after first login.
            </p>
          </div>
        )}

        {/* Embed Code for Link-Only Tenants */}
        {editId && form.integration_type === 'link_only' && form.slug && (
          <div className="rounded-[18px] border border-[rgba(251,191,36,0.20)] bg-[rgba(251,191,36,0.12)] p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <Link2 className="h-4 w-4 text-[#FCD34D]" />
              Embed Code for Their Website
            </h2>
            <p className="mb-3 text-[11px] text-[var(--text-secondary)]">
              Send this to the client. They paste it into their existing website where they want the booking widget to appear.
            </p>
            <div className="space-y-2">
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Direct Booking Link</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded-lg border border-[var(--border-default)] bg-[var(--card-bg)] px-3 py-2 text-[11px] text-[var(--brand-primary)]">
                    {buildTenantUrl(form.slug)}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--panel-bg)]"
                    onClick={() => {
                      const url = buildTenantUrl(form.slug);
                      navigator.clipboard?.writeText(url);
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </div>
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Embeddable Widget (iframe)</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded-lg border border-[var(--border-default)] bg-[var(--card-bg)] px-3 py-2 text-[11px] text-[var(--brand-primary)]">
                    {`<iframe src="${buildTenantUrl(form.slug)}?embed=1" width="100%" height="600" frameborder="0" style="border-radius:12px"></iframe>`}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--panel-bg)]"
                    onClick={() => {
                      const code = `<iframe src="${buildTenantUrl(form.slug)}?embed=1" width="100%" height="600" frameborder="0" style="border-radius:12px"></iframe>`;
                      navigator.clipboard?.writeText(code);
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            type="submit"
            disabled={saving || !form.name.trim() || !form.slug.trim()}
            className="bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-hover)]"
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {editId ? 'Save Changes' : 'Create Tenant'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/super-admin/tenants')}
            className="border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--panel-bg)]"
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
