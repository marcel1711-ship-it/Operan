'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Mail, MessageSquare, Smartphone, Bell, Loader2, Plus,
  Copy, Archive, Eye, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { renderTemplate, validateTemplateVariables } from '@/lib/communications/template-renderer';

type Template = {
  id: string;
  name: string;
  description: string | null;
  channel: string;
  category: string;
  subject: string | null;
  body: string;
  is_active: boolean;
  is_system_template: boolean;
  created_at: string;
};

const CHANNEL_ICONS: Record<string, any> = {
  email: Mail, sms: Smartphone, whatsapp: MessageSquare, in_app: Bell,
};

const CHANNEL_COLORS: Record<string, string> = {
  email: 'blue', sms: 'green', whatsapp: 'emerald', in_app: 'amber',
};

const CATEGORIES = [
  'booking_confirmation', 'booking_request_received', 'payment_received',
  'payment_failed', 'waiver_request', 'waiver_reminder', 'balance_due',
  'upcoming_trip', 'captain_assignment', 'cancellation', 'refund',
  'review_request', 'custom',
];

const SAMPLE_DATA = {
  customer: { first_name: 'John', last_name: 'Doe', full_name: 'John Doe', email: 'john@example.com', phone: '+1234567890' },
  reservation: { booking_reference: 'BK-2026-001', start_at: '2026-08-10T09:00:00Z', guest_count: 4, total_amount: 500, amount_paid: 250, balance_due: 250, booking_status: 'confirmed', payment_status: 'deposit_paid' },
  listing: { name: 'Sunset Cruise', location: 'Marina Bay', meeting_point: 'Dock 3', customer_instructions: 'Arrive 15 min early' },
  tenant: { name: 'Charter Co', phone: '+1234567890', email: 'info@charterco.com' },
};

export default function TemplatesPage() {
  const router = useRouter();
  const { user, role, tenant, loading: authLoading } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [previewBody, setPreviewBody] = useState('');
  const [previewSubject, setPreviewSubject] = useState('');
  const [validationIssues, setValidationIssues] = useState<string[]>([]);

  const [form, setForm] = useState({
    name: '', description: '', channel: 'email', category: 'custom',
    subject: '', body: '', language: 'en',
  });

  const load = useCallback(async (tenantId: string) => {
    setLoading(true);
    const { data } = await supabase
      .from('communication_templates')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('archived_at', null)
      .order('created_at', { ascending: false });
    if (data) setTemplates(data as Template[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authLoading) {
      if (!user) { router.push('/login'); return; }
      if (role === 'super_admin') { router.push('/super-admin'); return; }
      if (tenant) load(tenant.id);
    }
  }, [authLoading, user, role, tenant, router, load]);

  function openNew() {
    setEditing(null);
    setForm({ name: '', description: '', channel: 'email', category: 'custom', subject: '', body: '', language: 'en' });
    setShowEditor(true);
  }

  function openEdit(tpl: Template) {
    setEditing(tpl);
    setForm({
      name: tpl.name, description: tpl.description || '', channel: tpl.channel,
      category: tpl.category, subject: tpl.subject || '', body: tpl.body, language: 'en',
    });
    setShowEditor(true);
  }

  async function save() {
    if (!tenant) return;
    if (editing) {
      await supabase
        .from('communication_templates')
        .update({ ...form, updated_at: new Date().toISOString() })
        .eq('id', editing.id);
    } else {
      await supabase
        .from('communication_templates')
        .insert({ ...form, tenant_id: tenant.id, is_active: true, is_system_template: false });
    }
    setShowEditor(false);
    load(tenant.id);
  }

  async function duplicate(tpl: Template) {
    if (!tenant) return;
    await supabase
      .from('communication_templates')
      .insert({
        tenant_id: tenant.id,
        name: `${tpl.name} (Copy)`,
        description: tpl.description,
        channel: tpl.channel,
        category: tpl.category,
        subject: tpl.subject,
        body: tpl.body,
        language: 'en',
        is_active: true,
        is_system_template: false,
      });
    load(tenant.id);
  }

  async function archive(tpl: Template) {
    await supabase
      .from('communication_templates')
      .update({ archived_at: new Date().toISOString(), is_active: false })
      .eq('id', tpl.id);
    if (tenant) load(tenant.id);
  }

  function preview() {
    const { valid, unknown } = validateTemplateVariables(form.body);
    setValidationIssues(unknown);
    setPreviewBody(renderTemplate(form.body, SAMPLE_DATA as any));
    setPreviewSubject(form.subject ? renderTemplate(form.subject, SAMPLE_DATA as any) : '');
    setShowPreview(true);
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (role !== 'tenant_admin') return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-[var(--card-bg)] px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-dark shadow-md shadow-teal/20">
              <Mail className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-foreground">Message Templates</h1>
              <p className="text-xs text-muted-foreground">{templates.length} template{templates.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <Button onClick={openNew} className="bg-[var(--brand-primary)] text-white hover:bg-primary-hover">
            <Plus className="mr-2 h-4 w-4" />
            New Template
          </Button>
        </div>
      </header>

      <main className="px-4 py-6 sm:px-6 lg:px-8">
        {templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-[var(--card-bg)] py-20 shadow-sm">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary">
              <Mail className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="text-center">
              <h3 className="text-sm font-semibold text-foreground">No templates yet</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">Create email, SMS, and WhatsApp templates for your automated workflows.</p>
            </div>
            <Button onClick={openNew} className="bg-[var(--brand-primary)] text-white hover:bg-primary-hover">
              <Plus className="mr-2 h-4 w-4" /> New Template
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((tpl) => {
              const Icon = CHANNEL_ICONS[tpl.channel] || Mail;
              const color = CHANNEL_COLORS[tpl.channel] || 'blue';
              return (
                <div key={tpl.id} className="rounded-[18px] border border-border bg-[var(--card-bg)] p-4 shadow-sm transition-all hover:shadow-md">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', `bg-${color}-50`)}>
                        <Icon className={cn('h-4 w-4', `text-${color}-600`)} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{tpl.name}</p>
                        <p className="text-[10px] text-muted-foreground capitalize">{tpl.channel} - {tpl.category.replace(/_/g, ' ')}</p>
                      </div>
                    </div>
                    {!tpl.is_active && <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">Inactive</span>}
                  </div>
                  {tpl.subject && <p className="mt-2 text-xs font-medium text-foreground line-clamp-1">{tpl.subject}</p>}
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{tpl.body}</p>
                  <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
                    <Button size="sm" variant="outline" onClick={() => openEdit(tpl)} className="flex-1 border-border bg-[var(--card-bg)]">Edit</Button>
                    <Button size="sm" variant="outline" onClick={() => duplicate(tpl)} className="border-border bg-[var(--card-bg)]"><Copy className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="outline" onClick={() => archive(tpl)} className="border-destructive/20 bg-[rgba(251,113,133,0.12)] text-[#FB7185] hover:bg-destructive/15"><Archive className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Editor Modal */}
      {showEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-[var(--card-bg)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-base font-semibold text-foreground">{editing ? 'Edit Template' : 'New Template'}</h2>
              <button onClick={() => setShowEditor(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="space-y-4 p-6">
              <div>
                <Label className="text-xs">Name</Label>
                <Input className="mt-1" value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} placeholder="Booking Confirmation" />
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                <Input className="mt-1" value={form.description} onChange={(e: any) => setForm({ ...form, description: e.target.value })} placeholder="Sent when a booking is confirmed" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Channel</Label>
                  <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="in_app">In-App</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Category</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g, ' ')}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {form.channel === 'email' && (
                <div>
                  <Label className="text-xs">Subject</Label>
                  <Input className="mt-1" value={form.subject} onChange={(e: any) => setForm({ ...form, subject: e.target.value })} placeholder="Your booking is confirmed!" />
                </div>
              )}
              <div>
                <Label className="text-xs">Body</Label>
                <Textarea className="mt-1 min-h-[200px] font-mono text-xs" value={form.body} onChange={(e: any) => setForm({ ...form, body: e.target.value })}
                  placeholder={'Hi {{customer.first_name}},\n\nYour booking {{reservation.booking_reference}} is confirmed!\n\nTotal: {{reservation.total_amount}}\nBalance: {{reservation.balance_due}}'} />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Variables: {'{{customer.first_name}}, {{reservation.booking_reference}}, {{listing.name}}, {{tenant.name}}, etc.'}
                </p>
              </div>
              {validationIssues.length > 0 && (
                <div className="rounded-lg border border-warning/20 bg-[rgba(251,191,36,0.12)] p-2 text-xs text-[#FCD34D]">
                  Unknown variables: {validationIssues.join(', ')}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
              <Button variant="outline" onClick={preview} className="border-border bg-[var(--card-bg)]">
                <Eye className="mr-2 h-3.5 w-3.5" /> Preview
              </Button>
              <Button onClick={save} className="bg-[var(--brand-primary)] text-white hover:bg-primary-hover">Save</Button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-[var(--card-bg)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-base font-semibold text-foreground">Template Preview</h2>
              <button onClick={() => setShowPreview(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="p-6">
              {previewSubject && (
                <div className="mb-3">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Subject</p>
                  <p className="text-sm font-medium text-foreground">{previewSubject}</p>
                </div>
              )}
              <div className="mb-3">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Body</p>
                <div className="mt-1 whitespace-pre-wrap rounded-lg border border-border bg-secondary/20 p-3 text-sm text-foreground">
                  {previewBody}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
