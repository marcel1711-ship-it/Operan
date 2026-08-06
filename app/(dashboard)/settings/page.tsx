'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2, Save, Palette, Globe, Image as ImageIcon,
  Anchor, AlertCircle, Check, ExternalLink, Copy, Code2, Frame,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn, buildTenantUrl, buildEmbedBookingUrl } from '@/lib/utils';
import { WebsitePublishingSection } from '@/components/settings/website-publishing-section';
import { EmailSetupCard } from '@/components/dashboard/email-setup-card';

type TenantForm = {
  name: string;
  slug: string;
  primary_color: string;
  secondary_color: string;
  logo_url: string;
  hero_title: string;
  hero_subtitle: string;
  hero_image_url: string;
  domain: string;
  landing_page_url: string;
  phone: string;
  email: string;
  template: string;
  border_radius: string;
  button_style: string;
  font_family: string;
  background_color: string;
  theme_mode: string;
};

export default function SettingsPage() {
  const router = useRouter();
  const { user, role, tenant, loading: authLoading } = useAuth();
  const [form, setForm] = useState<TenantForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!authLoading) {
      if (!user) { router.push('/login'); return; }
      if (role === 'super_admin') { router.push('/super-admin'); return; }
      if (tenant) {
        setForm({
          name: tenant.name,
          slug: tenant.slug,
          primary_color: tenant.primary_color,
          secondary_color: tenant.secondary_color,
          logo_url: '',
          hero_title: '',
          hero_subtitle: '',
          hero_image_url: '',
          domain: '',
          landing_page_url: '',
          phone: '',
          email: '',
          template: tenant.template,
          border_radius: 'rounded',
          button_style: 'solid',
          font_family: 'system',
          background_color: '',
          theme_mode: 'light',
        });
        loadTenantData(tenant.id);
      }
    }
  }, [authLoading, user, role, tenant, router]);

  async function loadTenantData(tenantId: string) {
    const { data } = await supabase.from('tenants').select('*').eq('id', tenantId).maybeSingle();
    if (data) {
      setForm({
        name: data.name || '',
        slug: data.slug || '',
        primary_color: data.primary_color || '#0d9488',
        secondary_color: data.secondary_color || '#0f766e',
        logo_url: data.logo_url || '',
        hero_title: data.hero_title || '',
        hero_subtitle: data.hero_subtitle || '',
        hero_image_url: data.hero_image_url || '',
        domain: data.domain || '',
        landing_page_url: data.landing_page_url || '',
        phone: data.phone || '',
        email: data.email || '',
        template: data.template || 'default',
        border_radius: data.border_radius || 'rounded',
        button_style: data.button_style || 'solid',
        font_family: data.font_family || 'system',
        background_color: data.background_color || '',
        theme_mode: data.theme_mode || 'light',
      });
    }
  }

  async function save() {
    if (!tenant?.id || !form) return;
    setSaving(true);
    setError(null);
    setSaved(false);

    const { error: err } = await supabase.from('tenants').update({
      name: form.name,
      primary_color: form.primary_color,
      secondary_color: form.secondary_color,
      logo_url: form.logo_url || null,
      hero_title: form.hero_title || null,
      hero_subtitle: form.hero_subtitle || null,
      hero_image_url: form.hero_image_url || null,
      domain: form.domain || null,
      landing_page_url: form.landing_page_url || null,
      phone: form.phone || null,
      email: form.email || null,
      border_radius: form.border_radius,
      button_style: form.button_style,
      font_family: form.font_family,
      background_color: form.background_color || null,
      theme_mode: form.theme_mode,
    }).eq('id', tenant.id);

    if (err) {
      setError(err.message);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  }

  if (authLoading || !form) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (role !== 'tenant_admin') return null;

  const landingUrl = form.landing_page_url || `/r/${form.slug}`;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-[var(--card-bg)] px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-dark shadow-md shadow-teal/20">
              <Palette className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-foreground">Settings</h1>
              <p className="text-xs text-muted-foreground">Configure your branding, domain, and payments</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {saved && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-[#86EFAC]">
                <Check className="h-4 w-4" /> Saved
              </span>
            )}
            <Button onClick={save} disabled={saving} className="bg-[var(--brand-primary)] text-primary-foreground hover:bg-primary/90">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Changes
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        {error && (
          <div className="flex items-center gap-2 rounded-[18px] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-[#FB7185]">
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        )}

        {/* Branding */}
        <section className="rounded-2xl border border-border bg-[var(--card-bg)] p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
            <Palette className="h-4 w-4 text-[var(--brand-primary)]" /> Branding
          </h2>
          <div className="mt-5 space-y-5">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Business Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-[var(--card-bg)]" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Logo URL</Label>
              <div className="flex items-center gap-3">
                {form.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.logo_url} alt="Logo" className="h-12 w-12 rounded-lg border border-border object-cover" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-secondary">
                    <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
                  </div>
                )}
                <Input value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} placeholder="https://..." className="bg-[var(--card-bg)]" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Primary Color</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.primary_color} onChange={(e) => setForm({ ...form, primary_color: e.target.value })} className="h-9 w-12 rounded-lg border border-border" />
                  <Input value={form.primary_color} onChange={(e) => setForm({ ...form, primary_color: e.target.value })} className="bg-[var(--card-bg)]" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Secondary Color</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.secondary_color} onChange={(e) => setForm({ ...form, secondary_color: e.target.value })} className="h-9 w-12 rounded-lg border border-border" />
                  <Input value={form.secondary_color} onChange={(e) => setForm({ ...form, secondary_color: e.target.value })} className="bg-[var(--card-bg)]" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Border Radius</Label>
                <select value={form.border_radius} onChange={(e) => setForm({ ...form, border_radius: e.target.value })} className="h-9 w-full rounded-lg border border-border bg-[var(--card-bg)] px-3 text-sm">
                  <option value="sharp">Sharp (0px)</option>
                  <option value="rounded">Rounded (8px)</option>
                  <option value="pill">Pill (24px)</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Button Style</Label>
                <select value={form.button_style} onChange={(e) => setForm({ ...form, button_style: e.target.value })} className="h-9 w-full rounded-lg border border-border bg-[var(--card-bg)] px-3 text-sm">
                  <option value="solid">Solid</option>
                  <option value="outline">Outline</option>
                  <option value="soft">Soft</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Font Family</Label>
                <select value={form.font_family} onChange={(e) => setForm({ ...form, font_family: e.target.value })} className="h-9 w-full rounded-lg border border-border bg-[var(--card-bg)] px-3 text-sm">
                  <option value="system">System Default</option>
                  <option value="inter">Inter</option>
                  <option value="poppins">Poppins</option>
                  <option value="roboto">Roboto</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Theme Mode</Label>
                <select value={form.theme_mode} onChange={(e) => setForm({ ...form, theme_mode: e.target.value })} className="h-9 w-full rounded-lg border border-border bg-[var(--card-bg)] px-3 text-sm">
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Background Color (optional)</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.background_color || '#ffffff'} onChange={(e) => setForm({ ...form, background_color: e.target.value })} className="h-9 w-12 rounded-lg border border-border" />
                <Input value={form.background_color} onChange={(e) => setForm({ ...form, background_color: e.target.value })} placeholder="Transparent by default" className="bg-[var(--card-bg)]" />
              </div>
            </div>
          </div>
        </section>

        {/* Landing Page Texts */}
        <section className="rounded-2xl border border-border bg-[var(--card-bg)] p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
            <Anchor className="h-4 w-4 text-[var(--brand-primary)]" /> Landing Page Texts
          </h2>
          <div className="mt-5 space-y-5">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Hero Title</Label>
              <Input value={form.hero_title} onChange={(e) => setForm({ ...form, hero_title: e.target.value })} placeholder="Charter Your Perfect Day on the Water" className="bg-[var(--card-bg)]" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Hero Subtitle</Label>
              <Textarea value={form.hero_subtitle} onChange={(e) => setForm({ ...form, hero_subtitle: e.target.value })} placeholder="Browse our fleet of premium boats..." rows={2} className="resize-none bg-[var(--card-bg)]" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Hero Background Image URL</Label>
              <Input value={form.hero_image_url} onChange={(e) => setForm({ ...form, hero_image_url: e.target.value })} placeholder="https://..." className="bg-[var(--card-bg)]" />
            </div>
          </div>
        </section>

        {/* Domain & Landing Page URL */}
        <section className="rounded-2xl border border-border bg-[var(--card-bg)] p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
            <Globe className="h-4 w-4 text-[var(--brand-primary)]" /> Domain & Landing Page
          </h2>
          <div className="mt-5 space-y-5">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Custom Domain</Label>
              <Input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="bbrboatrentals.com" className="bg-[var(--card-bg)]" />
              <p className="text-[10px] text-muted-foreground">Enter your custom domain. We'll configure DNS for you.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Landing Page URL</Label>
              <Input value={form.landing_page_url} onChange={(e) => setForm({ ...form, landing_page_url: e.target.value })} placeholder="https://bbrboatrentals.com" className="bg-[var(--card-bg)]" />
              <p className="text-[10px] text-muted-foreground">The full URL where your public boat listings page will be accessible.</p>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
              <ExternalLink className="h-3.5 w-3.5 text-[var(--brand-primary)]" />
              <span className="text-xs text-muted-foreground">Your public page:</span>
              <a href={landingUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-[var(--brand-primary)] hover:underline">
                {landingUrl}
              </a>
            </div>
          </div>
        </section>

        {/* Contact Info */}
        <section className="rounded-2xl border border-border bg-[var(--card-bg)] p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Contact Information
          </h2>
          <div className="mt-5 grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 555-000-0000" className="bg-[var(--card-bg)]" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Email</Label>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="contact@example.com" className="bg-[var(--card-bg)]" />
            </div>
          </div>
        </section>

        {/* Website Publishing */}
        <WebsitePublishingSection tenantSlug={form.slug} />
      </main>
    </div>
  );
}
