'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2, FileSignature, Plus, Trash2, Copy, Check, ExternalLink,
  Code, Eye, FileText, Clock, X, ChevronDown, ChevronUp, Link2, Ship,
  Upload, FileUp,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn, buildWaiverUrl } from '@/lib/utils';
import DOMPurify from 'dompurify';

type FormField = {
  key: string;
  label: string;
  type: 'text' | 'email' | 'date' | 'phone' | 'number';
  required: boolean;
};

type Listing = {
  id: string;
  name: string;
};

type WaiverTemplate = {
  id: string;
  title: string;
  slug: string;
  html_content: string;
  form_fields: FormField[];
  listing_id: string | null;
  document_type: 'waiver' | 'contract';
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50);
}

function fieldKeyFromLabel(label: string, existing: FormField[]): string {
  const base = slugify(label).replace(/-/g, '_') || 'field';
  let key = base;
  let i = 1;
  const existingKeys = new Set(existing.map((f) => f.key));
  while (existingKeys.has(key)) {
    key = `${base}_${i++}`;
  }
  return key;
}

const FIELD_TYPES: { value: FormField['type']; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'date', label: 'Date' },
  { value: 'number', label: 'Number' },
];

export default function FormsPage() {
  const router = useRouter();
  const { user, role, tenant, loading: authLoading } = useAuth();
  const [templates, setTemplates] = useState<WaiverTemplate[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [signedCount, setSignedCount] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<WaiverTemplate | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<WaiverTemplate | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [formFields, setFormFields] = useState<FormField[]>([]);
  const [listingId, setListingId] = useState<string>('none');
  const [documentType, setDocumentType] = useState<'waiver' | 'contract'>('waiver');
  const [saving, setSaving] = useState(false);
  const [pdfExtracting, setPdfExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading) {
      if (!user) { router.push('/login'); return; }
      if (role === 'super_admin') { router.push('/super-admin'); return; }
      if (tenant) {
        loadTemplates(tenant.id);
        loadListings(tenant.id);
      }
    }
  }, [authLoading, user, role, tenant, router]);

  const loadTemplates = useCallback(async (tenantId: string) => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('waiver_templates')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (err) {
      setError(err.message);
    } else {
      setTemplates((data as WaiverTemplate[]) || []);
      const { data: signed } = await supabase
        .from('signed_waivers')
        .select('template_id')
        .eq('tenant_id', tenantId);
      if (signed) {
        const counts: Record<string, number> = {};
        (signed as { template_id: string }[]).forEach((s) => {
          counts[s.template_id] = (counts[s.template_id] || 0) + 1;
        });
        setSignedCount(counts);
      }
    }
    setLoading(false);
  }, []);

  const loadListings = useCallback(async (tenantId: string) => {
    const { data } = await supabase
      .from('listings')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true });
    if (data) setListings(data as Listing[]);
  }, []);

  function openCreate() {
    setEditing(null);
    setTitle('');
    setSlug('');
    setHtmlContent('');
    setFormFields([]);
    setListingId('none');
    setDocumentType('waiver');
    setError(null);
    setShowCreate(true);
  }

  function openEdit(t: WaiverTemplate) {
    setEditing(t);
    setTitle(t.title);
    setSlug(t.slug);
    setHtmlContent(t.html_content);
    setFormFields(t.form_fields || []);
    setListingId(t.listing_id || 'none');
    setDocumentType(t.document_type || 'waiver');
    setError(null);
    setShowCreate(true);
  }

  async function handlePdfUpload(file: File) {
    setPdfExtracting(true);
    setError(null);
    try {
      const { extractTextFromPdf, textToHtml } = await import('@/lib/pdf-extract');
      const text = await extractTextFromPdf(file);
      const html = textToHtml(text);
      setHtmlContent(html);
      if (!title.trim()) {
        const name = file.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
        setTitle(name);
        if (!editing) setSlug(slugify(name));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to extract PDF content');
    }
    setPdfExtracting(false);
  }

  function addField() {
    const newField: FormField = {
      key: fieldKeyFromLabel('new_field', formFields),
      label: '',
      type: 'text',
      required: false,
    };
    setFormFields([...formFields, newField]);
  }

  function updateField(index: number, updates: Partial<FormField>) {
    const updated = [...formFields];
    updated[index] = { ...updated[index], ...updates };
    if (updates.label !== undefined) {
      updated[index].key = fieldKeyFromLabel(updates.label, formFields.filter((_, i) => i !== index));
    }
    setFormFields(updated);
  }

  function removeField(index: number) {
    setFormFields(formFields.filter((_, i) => i !== index));
  }

  function moveField(index: number, dir: 'up' | 'down') {
    const target = dir === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= formFields.length) return;
    const updated = [...formFields];
    [updated[index], updated[target]] = [updated[target], updated[index]];
    setFormFields(updated);
  }

  async function save() {
    if (!tenant?.id || !title.trim() || !htmlContent.trim()) {
      setError('Title and HTML content are required');
      return;
    }
    setSaving(true);
    setError(null);

    const finalSlug = slug || slugify(title);
    const cleanFields = formFields.filter((f) => f.label.trim());
    const finalListingId = listingId === 'none' ? null : listingId;

    if (editing) {
      const { error: err } = await supabase
        .from('waiver_templates')
        .update({
          title: title.trim(),
          slug: finalSlug,
          html_content: htmlContent,
          form_fields: cleanFields,
          listing_id: finalListingId,
          document_type: documentType,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editing.id);
      if (err) setError(err.message);
      else {
        setShowCreate(false);
        await loadTemplates(tenant.id);
      }
    } else {
      const { error: err } = await supabase
        .from('waiver_templates')
        .insert({
          tenant_id: tenant.id,
          title: title.trim(),
          slug: finalSlug,
          html_content: htmlContent,
          form_fields: cleanFields,
          listing_id: finalListingId,
          document_type: documentType,
        });
      if (err) setError(err.message);
      else {
        setShowCreate(false);
        await loadTemplates(tenant.id);
      }
    }
    setSaving(false);
  }

  async function deleteTemplate(id: string) {
    if (!tenant?.id) return;
    if (!confirm('Delete this form template? Signed copies will be preserved.')) return;
    await supabase.from('waiver_templates').delete().eq('id', id);
    await loadTemplates(tenant.id);
  }

  async function toggleActive(t: WaiverTemplate) {
    if (!tenant?.id) return;
    await supabase
      .from('waiver_templates')
      .update({ is_active: !t.is_active, updated_at: new Date().toISOString() })
      .eq('id', t.id);
    await loadTemplates(tenant.id);
  }

  function copyLink(t: WaiverTemplate) {
    if (!tenant) return;
    const url = buildWaiverUrl(tenant.slug, t.slug);
    navigator.clipboard.writeText(url);
    setCopiedId(t.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function getWaiverUrl(t: WaiverTemplate): string {
    if (!tenant) return '';
    return buildWaiverUrl(tenant.slug, t.slug);
  }

  function getListingName(id: string | null): string | null {
    if (!id) return null;
    return listings.find((l) => l.id === id)?.name || null;
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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-dark shadow-md shadow-teal/20">
              <FileSignature className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-foreground">Waivers & Contracts</h1>
              <p className="text-xs text-muted-foreground">Upload PDFs, create digital documents, link them to boats</p>
            </div>
          </div>
          <Button onClick={openCreate} className="bg-[var(--brand-primary)] text-primary-foreground hover:bg-primary/90">
            <Plus className="mr-2 h-4 w-4" /> New Form
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-6 rounded-[18px] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-[#FB7185]">
            {error}
          </div>
        )}

        {templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-[var(--card-bg)] py-20 shadow-sm">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary">
              <FileSignature className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="text-center">
              <h3 className="text-sm font-semibold text-foreground">No forms yet</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Upload a PDF or create a digital waiver/contract, link it to a boat, and get a signing link for your customers.
              </p>
            </div>
            <Button onClick={openCreate} variant="outline" className="mt-2 border-border bg-[var(--card-bg)]">
              <Plus className="mr-2 h-4 w-4" /> Create your first form
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {templates.map((t) => {
              const boatName = getListingName(t.listing_id);
              return (
                <div
                  key={t.id}
                  className="rounded-2xl border border-border bg-[var(--card-bg)] p-5 shadow-sm transition-all hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                        t.is_active ? 'bg-[rgba(99,119,255,0.10)]' : 'bg-secondary'
                      )}>
                        <FileText className={cn('h-5 w-5', t.is_active ? 'text-[var(--brand-primary)]' : 'text-muted-foreground')} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-foreground">{t.title}</h3>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <Badge variant={t.is_active ? 'default' : 'secondary'} className="text-[10px]">
                            {t.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                          <Badge variant="outline" className={cn('text-[10px]', t.document_type === 'contract' ? 'border-amber-300 text-amber-600' : 'border-sky-300 text-sky-600')}>
                            {t.document_type === 'contract' ? 'Contract' : 'Waiver'}
                          </Badge>
                          {boatName && (
                            <Badge variant="outline" className="flex items-center gap-1 text-[10px]">
                              <Ship className="h-2.5 w-2.5" /> {boatName}
                            </Badge>
                          )}
                          {!boatName && (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              General
                            </Badge>
                          )}
                          {(t.form_fields?.length || 0) > 0 && (
                            <Badge variant="outline" className="text-[10px]">
                              {t.form_fields.length} field{t.form_fields.length !== 1 ? 's' : ''}
                            </Badge>
                          )}
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {signedCount[t.id] || 0} signed
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm" variant="ghost" onClick={() => setViewing(t)}
                        className="h-8 w-8 p-0" title="Preview"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(t)} className="h-8 px-2 text-xs">
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleActive(t)} className="h-8 px-2 text-xs">
                        {t.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button
                        size="sm" variant="ghost" onClick={() => deleteTemplate(t.id)}
                        className="h-8 w-8 p-0 text-[#FB7185] hover:text-destructive" title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[var(--brand-primary)]" />
                    <a
                      href={getWaiverUrl(t)} target="_blank" rel="noopener noreferrer"
                      className="flex-1 truncate text-xs font-medium text-[var(--brand-primary)] hover:underline"
                    >
                      {getWaiverUrl(t)}
                    </a>
                    <Button
                      size="sm" variant="ghost" onClick={() => copyLink(t)}
                      className="h-7 w-7 p-0" title="Copy link"
                    >
                      {copiedId === t.id ? (
                        <Check className="h-3.5 w-3.5 text-[#86EFAC]" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Create/Edit Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Form' : 'New Form Template'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Title</Label>
                <Input
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (!editing) setSlug(slugify(e.target.value));
                  }}
                  placeholder="Rental Agreement"
                  className="bg-[var(--card-bg)]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">URL Slug</Label>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(slugify(e.target.value))}
                  placeholder="rental-agreement"
                  className="bg-[var(--card-bg)]"
                />
              </div>
            </div>

            {/* Document type */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Document Type</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDocumentType('waiver')}
                  className={cn(
                    'flex-1 rounded-xl border-2 px-4 py-3 text-left transition-all',
                    documentType === 'waiver'
                      ? 'border-sky-400 bg-sky-50'
                      : 'border-border bg-[var(--card-bg)] hover:border-sky-200'
                  )}
                >
                  <span className={cn('text-sm font-bold', documentType === 'waiver' ? 'text-sky-700' : 'text-foreground')}>Waiver</span>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">Liability release — each guest signs individually</p>
                </button>
                <button
                  type="button"
                  onClick={() => setDocumentType('contract')}
                  className={cn(
                    'flex-1 rounded-xl border-2 px-4 py-3 text-left transition-all',
                    documentType === 'contract'
                      ? 'border-amber-400 bg-amber-50'
                      : 'border-border bg-[var(--card-bg)] hover:border-amber-200'
                  )}
                >
                  <span className={cn('text-sm font-bold', documentType === 'contract' ? 'text-amber-700' : 'text-foreground')}>Contract</span>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">Rental agreement — signed by the primary renter</p>
                </button>
              </div>
            </div>

            {/* Link to boat */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Link2 className="h-3.5 w-3.5" /> Link to Boat (optional)
              </Label>
              <Select value={listingId} onValueChange={setListingId}>
                <SelectTrigger className="bg-[var(--card-bg)]">
                  <SelectValue placeholder="General — not linked to a specific boat" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">General — not linked to a specific boat</SelectItem>
                  {listings.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Link this form to a specific boat, or leave it general for all boats.
              </p>
            </div>

            {/* Form Fields Section */}
            <div className="space-y-2 rounded-[18px] border border-border bg-[var(--panel-bg)] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-semibold text-foreground">Form Fields</Label>
                  <p className="text-[10px] text-muted-foreground">
                    Customer fills these before signing. Use the key in your HTML as a placeholder, e.g. <code className="rounded bg-[var(--card-bg)] px-1 text-[var(--brand-primary)]">{'{{first_name}}'}</code>
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={addField} className="h-7 border-border bg-[var(--card-bg)] text-xs">
                  <Plus className="mr-1 h-3 w-3" /> Add Field
                </Button>
              </div>

              {formFields.length === 0 ? (
                <p className="py-2 text-center text-[11px] text-muted-foreground">
                  No form fields — customer goes straight to signing.
                </p>
              ) : (
                <div className="space-y-2">
                  {formFields.map((field, index) => (
                    <div key={index} className="flex items-center gap-2 rounded-lg border border-border bg-[var(--card-bg)] p-2">
                      <div className="flex flex-col">
                        <Button
                          size="sm" variant="ghost" onClick={() => moveField(index, 'up')}
                          className="h-5 w-6 p-0" disabled={index === 0}
                        >
                          <ChevronUp className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm" variant="ghost" onClick={() => moveField(index, 'down')}
                          className="h-5 w-6 p-0" disabled={index === formFields.length - 1}
                        >
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </div>
                      <Input
                        value={field.label}
                        onChange={(e) => updateField(index, { label: e.target.value })}
                        placeholder="Field label (e.g. First Name)"
                        className="h-8 flex-1 bg-[var(--card-bg)] text-xs"
                      />
                      <Select
                        value={field.type}
                        onValueChange={(v) => updateField(index, { type: v as FormField['type'] })}
                      >
                        <SelectTrigger className="h-8 w-24 bg-[var(--card-bg)] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FIELD_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value} className="text-xs">
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => updateField(index, { required: !field.required })}
                        className={cn(
                          'h-8 px-2 text-[10px] font-medium',
                          field.required ? 'text-[var(--brand-primary)]' : 'text-muted-foreground'
                        )}
                      >
                        {field.required ? 'Required' : 'Optional'}
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => removeField(index)}
                        className="h-8 w-8 p-0 text-[#FB7185] hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  {formFields.some((f) => f.label.trim()) && (
                    <div className="rounded-lg bg-primary/5 px-3 py-2 text-[10px] text-muted-foreground">
                      <span className="font-medium text-[var(--brand-primary)]">Placeholders in your HTML:</span>{' '}
                      {formFields.filter((f) => f.label.trim()).map((f) => `{{${f.key}}}`).join('  ')}
                      <span className="ml-1 text-[var(--text-muted)]"> + {'{{today}}'} (auto date)</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* PDF Upload */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <FileUp className="h-3.5 w-3.5" /> Upload PDF (optional)
              </Label>
              <label
                className={cn(
                  'flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors',
                  pdfExtracting
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border bg-[var(--card-bg)] hover:border-primary/40 hover:bg-primary/5'
                )}
              >
                {pdfExtracting ? (
                  <>
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="text-xs font-medium text-primary">Extracting content from PDF...</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-6 w-6 text-muted-foreground" />
                    <span className="text-xs font-medium text-foreground">Drop a PDF here or click to upload</span>
                    <span className="text-[10px] text-muted-foreground">We&apos;ll extract the text and convert it to a digital document</span>
                  </>
                )}
                <input
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  disabled={pdfExtracting}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handlePdfUpload(file);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Code className="h-3.5 w-3.5" /> HTML Content
              </Label>
              <Textarea
                value={htmlContent}
                onChange={(e) => setHtmlContent(e.target.value)}
                placeholder="Upload a PDF above or paste your HTML directly. Use {{field_key}} placeholders where you want form data to appear..."
                rows={14}
                className="resize-none bg-[var(--card-bg)] font-mono text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                Upload a PDF to auto-extract, or paste HTML directly. Use placeholders like <code className="rounded bg-[var(--panel-bg)] px-1">{'{{signer_name}}'}</code> where form values should appear.
              </p>
            </div>
            {error && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-[#FB7185]">
                {error}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} className="border-border bg-[var(--card-bg)]">
              Cancel
            </Button>
            <Button onClick={save} disabled={saving} className="bg-[var(--brand-primary)] text-primary-foreground hover:bg-primary/90">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              {editing ? 'Save Changes' : 'Create Form'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent className="max-h-[80vh] max-w-3xl overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between pr-8">
              {viewing?.title}
              <Button
                size="sm" variant="ghost"
                onClick={() => setViewing(null)}
                className="absolute right-4 top-4 h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-[var(--card-bg)] p-4">
            {viewing && (
              <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(viewing.html_content, { ALLOWED_TAGS: ['p','br','b','i','u','strong','em','span','div','table','thead','tbody','tr','td','th','ul','ol','li','h1','h2','h3','h4','h5','h6','img','hr','a','blockquote','pre','code','sub','sup','dl','dt','dd','caption','colgroup','col','style'], ALLOWED_ATTR: ['style','class','id','src','alt','href','width','height','colspan','rowspan'], ALLOW_DATA_ATTR: false }) }} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
