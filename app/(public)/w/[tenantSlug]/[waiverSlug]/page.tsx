'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
import {
  Loader2, FileSignature, AlertCircle, Check, PenTool, Eraser,
  ChevronRight, ChevronLeft, User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import DOMPurify from 'dompurify';

type FormField = {
  key: string;
  label: string;
  type: 'text' | 'email' | 'date' | 'phone' | 'number';
  required: boolean;
};

type Template = {
  id: string;
  tenant_id: string;
  title: string;
  html_content: string;
  form_fields: FormField[];
  is_active: boolean;
};

type Tenant = {
  id: string;
  name: string;
  primary_color: string;
  secondary_color: string;
  logo_url: string | null;
};

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function WaiverSigningPage() {
  const params = useParams();
  const tenantSlug = params.tenantSlug as string;
  const waiverSlug = params.waiverSlug as string;

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form values
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [step, setStep] = useState<'form' | 'sign'>('form');
  const [formError, setFormError] = useState<string | null>(null);

  // Signature
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  // Honeypot field (hidden from users, traps bots)
  const [hp, setHp] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [signed, setSigned] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  const hasForm = (template?.form_fields?.length || 0) > 0;

  useEffect(() => {
    async function load() {
      try {
        const { data: tenantData, error: tenantErr } = await supabase
          .from('tenants')
          .select('id, name, slug, primary_color, secondary_color, logo_url')
          .eq('slug', tenantSlug)
          .eq('is_active', true)
          .maybeSingle();

        if (tenantErr || !tenantData) {
          setError('Business not found');
          setLoading(false);
          return;
        }

        setTenant(tenantData as Tenant);

        const { data: tmplData, error: tmplErr } = await supabase
          .from('waiver_templates')
          .select('id, tenant_id, title, html_content, form_fields, is_active')
          .eq('tenant_id', tenantData.id)
          .eq('slug', waiverSlug)
          .eq('is_active', true)
          .maybeSingle();

        if (tmplErr || !tmplData) {
          setError('Waiver not found or no longer available');
          setLoading(false);
          return;
        }

        const tmpl = tmplData as Template;
        setTemplate(tmpl);
        // If no form fields, go straight to signing
        if (!tmpl.form_fields || tmpl.form_fields.length === 0) {
          setStep('sign');
        }
      } catch {
        setError('Failed to load');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [tenantSlug, waiverSlug]);

  // Render the filled HTML
  const filledHtml = useMemo(() => {
    if (!template) return '';
    let html = template.html_content;
    for (const [key, value] of Object.entries(formValues)) {
      const safeValue = value.replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      }[c] || c));
      html = html.replaceAll(`{{${key}}}`, safeValue);
    }
    html = html.replaceAll('{{today}}', formatDate(new Date()));
    html = html.replace(/\{\{[^}]+\}\}/g, '');
    return html;
  }, [template, formValues]);

  // Initialize canvas when entering sign step
  useEffect(() => {
    if (step !== 'sign' || signed) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
  }, [step, signed]);

  function getPointerPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function startDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    isDrawing.current = true;
    lastPoint.current = getPointerPos(e);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function draw(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const point = getPointerPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPoint.current!.x, lastPoint.current!.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPoint.current = point;
  }

  function endDraw() {
    isDrawing.current = false;
    lastPoint.current = null;
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureDataUrl(null);
  }

  function saveSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hasInk = imageData.data.some((v, i) => i % 4 === 3 && v > 0);
    if (!hasInk) return;
    setSignatureDataUrl(canvas.toDataURL('image/png'));
  }

  function validateForm(): boolean {
    if (!template?.form_fields) return true;
    for (const field of template.form_fields) {
      if (field.required && !formValues[field.key]?.trim()) {
        setFormError(`Please fill in: ${field.label}`);
        return false;
      }
    }
    setFormError(null);
    return true;
  }

  function goToSign() {
    if (!validateForm()) return;
    setStep('sign');
  }

  async function submit() {
    if (!template || !tenant) return;
    if (!signatureDataUrl) {
      setError('Please draw your signature');
      return;
    }

    setSubmitting(true);
    setError(null);

    const signerName = formValues['signer_name'] || formValues['full_name'] || formValues['name'] || 'Signed Customer';

    // Sanitize HTML before sending to server
    // DOMPurify imported at top
    const sanitizedHtml = DOMPurify.sanitize(filledHtml, {
      ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'u', 'strong', 'em', 'span', 'div', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'hr', 'a', 'blockquote', 'pre', 'code', 'sub', 'sup', 'dl', 'dt', 'dd', 'caption', 'colgroup', 'col'],
      ALLOWED_ATTR: ['class', 'id', 'src', 'alt', 'href', 'width', 'height', 'colspan', 'rowspan'],
      ALLOW_DATA_ATTR: false,
    });

    try {
      const response = await fetch('/api/submit-waiver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenant.id,
          template_id: template.id,
          signer_name: signerName,
          signer_email: formValues['email'] || formValues['signer_email'] || null,
          signature_data_url: signatureDataUrl,
          html_snapshot: sanitizedHtml,
          _hp: hp,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Failed to submit');
      } else {
        setSigned(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit');
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error && !template) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50">
        <AlertCircle className="h-12 w-12 text-slate-300" />
        <div className="text-center">
          <h1 className="text-lg font-bold text-foreground">{error}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Please check your link and try again.</p>
        </div>
      </div>
    );
  }

  const primary = tenant?.primary_color || '#0d9488';

  if (signed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/15">
          <Check className="h-10 w-10 text-success" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">Document Signed</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your signature has been recorded for &ldquo;{template?.title}&rdquo;.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          {tenant?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tenant.logo_url} alt={tenant.name} className="h-8 w-8 rounded-lg object-cover" />
          ) : (
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ backgroundColor: primary }}
            >
              <FileSignature className="h-4 w-4 text-white" />
            </div>
          )}
          <span className="text-sm font-bold text-foreground">{tenant?.name}</span>
          <span className="ml-auto text-xs text-muted-foreground">{template?.title}</span>
        </div>
        {/* Step indicator */}
        {hasForm && (
          <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 pb-3 sm:px-6">
            <div className={`flex items-center gap-1.5 text-xs font-medium ${step === 'form' ? 'text-primary' : 'text-muted-foreground'}`}>
              <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${step === 'form' ? 'bg-primary text-white' : 'bg-secondary text-muted-foreground'}`}>
                {step === 'sign' ? <Check className="h-3 w-3" /> : '1'}
              </div>
              Your Info
            </div>
            <div className={`h-px flex-1 ${step === 'sign' ? 'bg-primary' : 'bg-border'}`} />
            <div className={`flex items-center gap-1.5 text-xs font-medium ${step === 'sign' ? 'text-primary' : 'text-muted-foreground'}`}>
              <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${step === 'sign' ? 'bg-primary text-white' : 'bg-secondary text-muted-foreground'}`}>
                2
              </div>
              Review & Sign
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {/* STEP 1: FORM */}
        {step === 'form' && hasForm && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-5 flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h1 className="text-base font-bold text-foreground">Your Information</h1>
                  <p className="text-xs text-muted-foreground">Fill in your details — they will be added to the document automatically.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {template!.form_fields.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      {field.label}{field.required && <span className="ml-0.5 text-destructive">*</span>}
                    </Label>
                    <Input
                      type={field.type === 'phone' ? 'tel' : field.type}
                      value={formValues[field.key] || ''}
                      onChange={(e) => setFormValues((v) => ({ ...v, [field.key]: e.target.value }))}
                      placeholder={field.label}
                      className="bg-card"
                    />
                  </div>
                ))}
              </div>

              {formError && (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" /> {formError}
                </div>
              )}
            </div>

            <Button
              onClick={goToSign}
              className="w-full text-white hover:opacity-90"
              style={{ backgroundColor: primary }}
            >
              Continue to Document <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}

        {/* STEP 2: REVIEW & SIGN */}
        {step === 'sign' && (
          <div className="space-y-5">
            {hasForm && (
              <Button
                variant="ghost"
                onClick={() => setStep('form')}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Back to form
              </Button>
            )}

            {/* Filled Document */}
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div
                className="px-6 py-4"
                style={{ borderBottom: `3px solid ${primary}` }}
              >
                <h1 className="text-xl font-bold text-foreground">{template?.title}</h1>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {hasForm
                    ? 'Review your information below, then sign at the bottom.'
                    : 'Please read the document below and sign at the bottom.'}
                </p>
              </div>

              <div
                className="waiver-content px-6 py-6 text-sm leading-relaxed text-foreground"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(filledHtml, {
                  ALLOWED_TAGS: ['h1','h2','h3','h4','h5','h6','p','br','hr','ul','ol','li','strong','em','u','s','a','span','div','table','thead','tbody','tr','th','td','blockquote','pre','code','img','sub','sup'],
                  ALLOWED_ATTR: ['href','target','rel','src','alt','width','height','class','style','colspan','rowspan'],
                }) }}
              />
            </div>

            {/* Signature Section */}
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                <PenTool className="h-4 w-4" style={{ color: primary }} /> Sign Here
              </h2>

              <div className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Signature *</Label>
                  <div className="rounded-xl border-2 border-dashed border-border bg-slate-50 p-2">
                    <canvas
                      ref={canvasRef}
                      width={700}
                      height={180}
                      onPointerDown={startDraw}
                      onPointerMove={draw}
                      onPointerUp={endDraw}
                      onPointerLeave={endDraw}
                      className="w-full touch-none cursor-crosshair rounded-lg bg-card"
                      style={{ aspectRatio: '700 / 180' }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-muted-foreground">
                      Draw your signature using your finger or mouse.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm" variant="outline" onClick={clearSignature}
                        className="h-8 border-border bg-card text-xs"
                      >
                        <Eraser className="mr-1.5 h-3.5 w-3.5" /> Clear
                      </Button>
                      <Button
                        size="sm" variant="outline" onClick={saveSignature}
                        className="h-8 border-border bg-card text-xs"
                      >
                        <Check className="mr-1.5 h-3.5 w-3.5" /> Confirm
                      </Button>
                    </div>
                  </div>
                  {signatureDataUrl && (
                    <div className="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2">
                      <Check className="h-4 w-4 text-success" />
                      <span className="text-xs font-medium text-success">Signature captured</span>
                    </div>
                  )}
                </div>

                {error && (
                  <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" /> {error}
                  </div>
                )}

                {/* Honeypot field — hidden from real users, traps bots */}
                <input
                  type="text"
                  name="website"
                  value={hp}
                  onChange={(e) => setHp(e.target.value)}
                  style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', opacity: 0 }}
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                />

                <Button
                  onClick={submit}
                  disabled={submitting || !signatureDataUrl}
                  className="w-full text-white hover:opacity-90"
                  style={{ backgroundColor: primary }}
                >
                  {submitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileSignature className="mr-2 h-4 w-4" />
                  )}
                  Sign & Submit Document
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
