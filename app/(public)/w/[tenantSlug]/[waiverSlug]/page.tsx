'use client';

import { useEffect, useState, useRef, useMemo, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Loader2, AlertCircle, Check } from 'lucide-react';
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

type ReservationInfo = {
  booking_reference: string;
  start_at: string;
  end_at: string;
  guest_count: number;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  listing_name: string | null;
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function fmtToday(): string {
  return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function WaiverSigningPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <WaiverSigningInner />
    </Suspense>
  );
}

function WaiverSigningInner() {
  const params = useParams();
  const tenantSlug = params.tenantSlug as string;
  const waiverSlug = params.waiverSlug as string;
  const searchParams = useSearchParams();
  const reservationId = searchParams.get('reservation_id');

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [reservation, setReservation] = useState<ReservationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const signerName = searchParams.get('signer_name') || '';
  const signerEmail = searchParams.get('email') || '';
  const signerPhone = searchParams.get('phone') || '';

  const [formValues, setFormValues] = useState<Record<string, string>>(() => {
    const prefill: Record<string, string> = {};
    if (signerName) { prefill['signer_name'] = signerName; prefill['full_name'] = signerName; prefill['name'] = signerName; }
    if (signerEmail) { prefill['email'] = signerEmail; prefill['signer_email'] = signerEmail; }
    if (signerPhone) { prefill['phone'] = signerPhone; }
    return prefill;
  });

  const prefilled = !!(signerName && signerEmail);
  const hasForm = (template?.form_fields?.length || 0) > 0;
  const [step, setStep] = useState<'form' | 'sign'>(prefilled || !hasForm ? 'sign' : 'form');
  const [formError, setFormError] = useState<string | null>(null);

  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [hp, setHp] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [signed, setSigned] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const hasInk = useRef(false);

  useEffect(() => {
    async function load() {
      try {
        const { data: tenantData } = await supabase
          .from('tenants')
          .select('id, name, slug, primary_color, secondary_color, logo_url')
          .eq('slug', tenantSlug)
          .eq('is_active', true)
          .maybeSingle();

        if (!tenantData) { setError('Business not found'); setLoading(false); return; }
        setTenant(tenantData as Tenant);

        const { data: tmplData } = await supabase
          .from('waiver_templates')
          .select('id, tenant_id, title, html_content, form_fields, is_active')
          .eq('tenant_id', tenantData.id)
          .eq('slug', waiverSlug)
          .eq('is_active', true)
          .maybeSingle();

        if (!tmplData) { setError('Waiver not found or no longer available'); setLoading(false); return; }
        const tmpl = tmplData as Template;
        setTemplate(tmpl);

        if (!tmpl.form_fields || tmpl.form_fields.length === 0) setStep('sign');

        if (reservationId) {
          const { data: regInfo } = await supabase.rpc('get_guest_registration_info', {
            p_reservation_id: reservationId,
          });
          if (regInfo && !regInfo.error) {
            const res = regInfo.reservation;
            setReservation({
              booking_reference: res?.booking_reference || '',
              start_at: res?.start_at || '',
              end_at: res?.end_at || '',
              guest_count: res?.guest_count || 0,
              total_amount: 0,
              amount_paid: 0,
              balance_due: 0,
              listing_name: regInfo.listing?.name || null,
            });
          }
        }
      } catch {
        setError('Failed to load');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [tenantSlug, waiverSlug, reservationId]);

  const filledHtml = useMemo(() => {
    if (!template) return '';
    let html = template.html_content;
    for (const [key, value] of Object.entries(formValues)) {
      const safeValue = value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
      html = html.replaceAll(`{{${key}}}`, safeValue);
    }
    html = html.replaceAll('{{today}}', fmtToday());
    html = html.replace(/\{\{[^}]+\}\}/g, '');
    return html;
  }, [template, formValues]);

  // Canvas setup
  useEffect(() => {
    if (step !== 'sign' || signed) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.parentElement!.getBoundingClientRect();
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = Math.floor(rect.width * ratio);
    canvas.height = Math.floor(210 * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#173a3a';
    hasInk.current = false;
  }, [step, signed]);

  function getPointerPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function startDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    isDrawing.current = true;
    lastPoint.current = getPointerPos(e);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function draw(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const point = getPointerPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPoint.current!.x, lastPoint.current!.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPoint.current = point;
    hasInk.current = true;
  }

  function endDraw() { isDrawing.current = false; lastPoint.current = null; }

  function clearSig() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    hasInk.current = false;
    setSignatureDataUrl(null);
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

  function goToSign() { if (validateForm()) setStep('sign'); }

  async function submit() {
    if (!template || !tenant) return;
    if (!acceptedTerms) { setError('Please accept the terms before signing'); return; }
    if (!hasInk.current && !signatureDataUrl) { setError('Please draw your signature'); return; }

    const dataUrl = signatureDataUrl || canvasRef.current?.toDataURL('image/png') || '';
    if (!dataUrl) { setError('Please draw your signature'); return; }

    setSubmitting(true);
    setError(null);

    const name = formValues['signer_name'] || formValues['full_name'] || formValues['name'] || signerName || 'Signed Customer';
    const sanitizedHtml = DOMPurify.sanitize(filledHtml, {
      ALLOWED_TAGS: ['h1','h2','h3','h4','h5','h6','p','br','hr','ul','ol','li','strong','em','u','s','a','span','div','table','thead','tbody','tr','th','td','blockquote','pre','code','img','sub','sup','section','article','header','main','label','input'],
      ALLOWED_ATTR: ['class','id','src','alt','href','width','height','colspan','rowspan','style','type','name','value'],
    });

    try {
      const response = await fetch('/api/submit-waiver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenant.id,
          template_id: template.id,
          reservation_id: reservationId || null,
          signer_name: name,
          signer_email: formValues['email'] || formValues['signer_email'] || signerEmail || null,
          signature_data_url: dataUrl,
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
      <div className="flex min-h-screen items-center justify-center" style={{ background: 'linear-gradient(135deg, #1f8f8f, #3dbfbf)' }}>
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  if (error && !template) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4">
        <AlertCircle className="h-12 w-12 text-slate-300" />
        <div className="text-center">
          <h1 className="text-lg font-bold text-slate-800">{error}</h1>
          <p className="mt-1 text-sm text-slate-500">Please check your link and try again.</p>
        </div>
      </div>
    );
  }

  const primary = tenant?.primary_color || '#3dbfbf';
  const primaryDark = tenant?.secondary_color || primary;
  const displayName = signerName || formValues['signer_name'] || formValues['full_name'] || 'Guest';

  if (signed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4" style={{ background: `linear-gradient(135deg, ${primaryDark}, ${primary})` }}>
        <div className="w-full max-w-md rounded-3xl bg-white p-10 text-center shadow-2xl">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full" style={{ backgroundColor: `${primary}18` }}>
            <Check className="h-10 w-10" style={{ color: primary }} />
          </div>
          <h1 className="mt-6 text-2xl font-extrabold text-slate-800">Document Signed</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-500">
            Your signature for &ldquo;{template?.title}&rdquo; has been recorded successfully. You may now close this page.
          </p>
          <p className="mt-6 text-xs text-slate-400">{tenant?.name}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: `linear-gradient(115deg, rgba(${hexToRgb(primaryDark)},0.93), rgba(${hexToRgb(primary)},0.65)), #f1f5f9` }}>
      <style>{`
        .waiver-shell{width:min(100%,1040px);margin:0 auto;background:#fff;border-radius:28px;overflow:hidden;box-shadow:0 24px 80px rgba(12,68,68,.28)}
        .waiver-hero{display:flex;justify-content:space-between;align-items:center;gap:24px;padding:30px 36px;color:#fff}
        .waiver-hero-logo{font:900 38px/1 system-ui,sans-serif}
        .waiver-hero-logo small{display:block;margin-top:7px;font-size:9px;letter-spacing:.22em;text-transform:uppercase;opacity:.78}
        .waiver-hero-logo img{height:48px;width:auto;max-width:180px;border-radius:10px;object-fit:contain}
        .waiver-hero h1{margin:0;text-align:right;font:800 clamp(20px,3.5vw,32px)/1.1 system-ui,sans-serif;text-transform:uppercase}
        .waiver-content{padding:34px 38px 42px}
        .waiver-notice{margin-bottom:24px;padding:15px 17px;border-radius:16px;font-size:13px;line-height:1.6}
        .waiver-details{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:28px}
        .waiver-detail{padding:14px;border:1px solid #dceeee;border-radius:14px;background:#fbfefe}
        .waiver-detail span{display:block;margin-bottom:6px;color:#6c8f8f;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
        .waiver-detail strong{display:block;font-size:14px;color:#173a3a;overflow-wrap:anywhere}
        .waiver-legal{font-size:13px;line-height:1.72;color:#173a3a}
        .waiver-legal section,.waiver-legal>div{margin-bottom:25px;padding-bottom:22px;border-bottom:1px solid #edf4f4}
        .waiver-legal h2{margin:0 0 11px;font:800 16px/1.3 system-ui,sans-serif;color:#173a3a}
        .waiver-legal p{margin:7px 0}
        .waiver-legal ol{margin:8px 0 0;padding-left:22px}
        .waiver-legal li{margin:7px 0}
        .waiver-acceptance{display:flex;gap:11px;margin:22px 0;padding:16px;border:1px solid #dceeee;border-radius:15px;background:#fbfefe;cursor:pointer}
        .waiver-acceptance input{width:18px;height:18px;flex-shrink:0}
        .waiver-acceptance span{font-size:13px;line-height:1.5;color:#173a3a}
        .waiver-sig-box{margin-top:18px;padding:18px;border:1px solid #dceeee;border-radius:18px;background:#fbfefe}
        .waiver-sig-box h3{margin:0 0 4px;font:700 15px/1.3 system-ui,sans-serif;color:#173a3a}
        .waiver-sig-box>p{margin:0 0 12px;font-size:12px;color:#6c8f8f}
        .waiver-canvas-wrap{height:210px;border:2px dashed #bcdede;border-radius:14px;background:#fff;overflow:hidden}
        .waiver-canvas-wrap canvas{width:100%;height:100%;display:block;touch-action:none;cursor:crosshair}
        .waiver-sig-actions{display:flex;justify-content:space-between;align-items:center;margin-top:10px}
        .waiver-sig-actions .sig-date{font-size:12px;color:#6c8f8f}
        .waiver-sig-actions .sig-date strong{color:#173a3a}
        .waiver-clear-btn{padding:8px 16px;border:1px solid #dceeee;border-radius:999px;background:#fff;color:#1f8f8f;font:700 11px system-ui,sans-serif;cursor:pointer}
        .waiver-submit{width:100%;min-height:54px;margin-top:22px;border:0;border-radius:999px;color:#fff;font:800 13px system-ui,sans-serif;text-transform:uppercase;letter-spacing:.06em;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:opacity .2s}
        .waiver-submit:disabled{opacity:.62;cursor:not-allowed}
        .waiver-msg{margin-top:16px;padding:14px;border-radius:13px;font-size:13px}
        .waiver-msg.error{color:#b42318;background:#fef3f2}
        .waiver-form-step{padding:34px 38px}
        .waiver-form-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
        .waiver-form-field label{display:block;margin-bottom:6px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#6c8f8f}
        .waiver-form-field input{width:100%;padding:12px 14px;border:1px solid #dceeee;border-radius:12px;font-size:14px;color:#173a3a;background:#fff;outline:none;transition:border-color .2s}
        .waiver-form-field input:focus{border-color:var(--waiver-primary)}
        .waiver-form-next{width:100%;min-height:50px;margin-top:20px;border:0;border-radius:999px;color:#fff;font:700 13px system-ui,sans-serif;text-transform:uppercase;letter-spacing:.06em;cursor:pointer}
        @media(max-width:760px){
          .waiver-shell{border-radius:0;min-height:100vh}
          .waiver-hero{padding:24px 20px;flex-direction:column;align-items:flex-start;gap:12px}
          .waiver-hero h1{text-align:left;font-size:22px}
          .waiver-content,.waiver-form-step{padding:25px 18px 34px}
          .waiver-details{grid-template-columns:1fr}
          .waiver-form-grid{grid-template-columns:1fr}
        }
      `}</style>

      <div style={{ padding: '28px 16px' }}>
        <main className="waiver-shell">
          {/* Hero */}
          <header className="waiver-hero" style={{ background: `linear-gradient(135deg, ${primaryDark}, ${primary})` }}>
            <div className="waiver-hero-logo">
              {tenant?.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tenant.logo_url} alt={tenant?.name || ''} />
              ) : (
                <>{tenant?.name}</>
              )}
              <small>{tenant?.name}</small>
            </div>
            <h1>{template?.title || 'Waiver'}</h1>
          </header>

          {/* Step 1: Form fields (if any and not prefilled) */}
          {step === 'form' && hasForm && (
            <div className="waiver-form-step">
              <div className="waiver-notice" style={{ border: `1px solid ${primary}40`, background: `${primary}10` }}>
                Please fill in your details below. This information will be added to the document automatically.
              </div>
              <div className="waiver-form-grid" style={{ '--waiver-primary': primary } as React.CSSProperties}>
                {template!.form_fields.map((field) => (
                  <div key={field.key} className="waiver-form-field">
                    <label>{field.label}{field.required ? ' *' : ''}</label>
                    <input
                      type={field.type === 'phone' ? 'tel' : field.type}
                      value={formValues[field.key] || ''}
                      onChange={(e) => setFormValues((v) => ({ ...v, [field.key]: e.target.value }))}
                      placeholder={field.label}
                    />
                  </div>
                ))}
              </div>
              {formError && <div className="waiver-msg error">{formError}</div>}
              <button type="button" className="waiver-form-next" style={{ background: primary }} onClick={goToSign}>
                Continue to Document
              </button>
            </div>
          )}

          {/* Step 2: Document + Signature */}
          {step === 'sign' && (
            <div className="waiver-content">
              {/* Notice */}
              <div className="waiver-notice" style={{ border: `1px solid ${primary}40`, background: `${primary}10` }}>
                Please review the agreement carefully. Your digital signature confirms that you have read, understood, and accepted the terms below.
              </div>

              {/* Reservation details grid */}
              {reservation && (
                <div className="waiver-details">
                  <div className="waiver-detail"><span>Guest</span><strong>{displayName}</strong></div>
                  {signerEmail && <div className="waiver-detail"><span>Email</span><strong>{signerEmail}</strong></div>}
                  {signerPhone && <div className="waiver-detail"><span>Phone</span><strong>{signerPhone}</strong></div>}
                  {reservation.listing_name && <div className="waiver-detail"><span>Vessel</span><strong>{reservation.listing_name}</strong></div>}
                  <div className="waiver-detail"><span>Date</span><strong>{fmtDate(reservation.start_at)}</strong></div>
                  <div className="waiver-detail"><span>Departure</span><strong>{fmtTime(reservation.start_at)}</strong></div>
                  {reservation.end_at && <div className="waiver-detail"><span>End Time</span><strong>{fmtTime(reservation.end_at)}</strong></div>}
                  {reservation.guest_count > 0 && <div className="waiver-detail"><span>Guests</span><strong>{reservation.guest_count}</strong></div>}
                  <div className="waiver-detail"><span>Reservation</span><strong>{reservation.booking_reference}</strong></div>
                </div>
              )}

              {/* Legal content from template */}
              <article
                className="waiver-legal"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(filledHtml, {
                  ALLOWED_TAGS: ['h1','h2','h3','h4','h5','h6','p','br','hr','ul','ol','li','strong','em','u','s','a','span','div','table','thead','tbody','tr','th','td','blockquote','pre','code','img','sub','sup','section','article'],
                  ALLOWED_ATTR: ['href','target','rel','src','alt','width','height','class','style','colspan','rowspan','type'],
                }) }}
              />

              {/* Acceptance checkbox */}
              <label className="waiver-acceptance">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  style={{ accentColor: primary }}
                />
                <span>
                  I have read and agree to the complete {template?.title}. I understand and accept all terms and conditions.
                </span>
              </label>

              {/* Signature box */}
              <div className="waiver-sig-box">
                <h3>Digital Signature</h3>
                <p>Sign inside the box using your finger, mouse, or trackpad.</p>
                <div className="waiver-canvas-wrap">
                  <canvas
                    ref={canvasRef}
                    onPointerDown={startDraw}
                    onPointerMove={draw}
                    onPointerUp={endDraw}
                    onPointerLeave={endDraw}
                  />
                </div>
                <div className="waiver-sig-actions">
                  <span className="sig-date">Signed on: <strong>{fmtToday()}</strong></span>
                  <button type="button" className="waiver-clear-btn" onClick={clearSig}>Clear signature</button>
                </div>
              </div>

              {error && <div className="waiver-msg error">{error}</div>}

              {/* Honeypot */}
              <input
                type="text" name="website" value={hp} onChange={(e) => setHp(e.target.value)}
                style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', opacity: 0 }}
                tabIndex={-1} autoComplete="off" aria-hidden="true"
              />

              {/* Submit */}
              <button
                type="button"
                className="waiver-submit"
                style={{ background: primary, boxShadow: `0 8px 24px ${primary}40` }}
                disabled={submitting || !acceptedTerms}
                onClick={submit}
              >
                {submitting && <Loader2 className="h-5 w-5 animate-spin" />}
                Sign and submit waiver
              </button>
            </div>
          )}

          {/* Back to form button */}
          {step === 'sign' && hasForm && !prefilled && (
            <div style={{ padding: '0 38px 24px' }}>
              <button
                type="button"
                onClick={() => setStep('form')}
                style={{ background: 'none', border: 'none', color: '#6c8f8f', fontSize: '12px', cursor: 'pointer', padding: '8px 0' }}
              >
                ← Back to form
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  return `${r},${g},${b}`;
}
