import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import xss from 'xss';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key, { auth: { persistSession: false } });
}

const MAX_SIGNATURE_SIZE = 500_000;
const MAX_HTML_SIZE = 500_000;

const XSS_OPTIONS = {
  whiteList: {
    p: [], br: [], b: [], i: [], u: [], strong: [], em: [],
    span: ['class', 'id'],
    div: ['class', 'id'],
    table: ['class'], thead: [], tbody: [], tr: [],
    td: ['colspan', 'rowspan', 'class'],
    th: ['colspan', 'rowspan', 'class'],
    ul: [], ol: [], li: [],
    h1: ['class'], h2: ['class'], h3: ['class'],
    h4: ['class'], h5: ['class'], h6: ['class'],
    img: ['src', 'alt', 'width', 'height'],
    hr: [],
    a: ['href'],
    blockquote: ['class'],
    pre: ['class'],
    code: ['class'],
    sub: [], sup: [],
    dl: [], dt: [], dd: [],
    caption: [], colgroup: [],
    col: ['width'],
  },
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style', 'svg', 'form', 'object', 'iframe', 'meta', 'xml'],
  safeAttrValue(tag: string, name: string, value: string): string {
    if ((name === 'href' || name === 'src') && value && value.toLowerCase().indexOf('javascript:') === 0) {
      return '';
    }
    return value;
  },
};

function sanitizeHtmlServer(html: string): string {
  return xss(html, XSS_OPTIONS);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 255;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Honeypot — if filled, silently accept (bot trap)
    if (body._hp && body._hp.length > 0) {
      return NextResponse.json({ success: true }, { status: 200 });
    }

    const { tenant_id, template_id, signer_name, signature_data_url, html_snapshot } = body;

    // Required field validation
    if (!tenant_id || !template_id || !signer_name || !signature_data_url || !html_snapshot) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (typeof signer_name !== 'string' || signer_name.trim().length === 0) {
      return NextResponse.json({ error: 'Signer name is required' }, { status: 400 });
    }

    if (typeof signature_data_url !== 'string' || signature_data_url.length > MAX_SIGNATURE_SIZE) {
      return NextResponse.json({ error: 'Signature is too large' }, { status: 413 });
    }

    if (typeof html_snapshot !== 'string' || html_snapshot.length > MAX_HTML_SIZE) {
      return NextResponse.json({ error: 'Document is too large' }, { status: 413 });
    }

    // Email validation (if provided)
    if (body.signer_email && typeof body.signer_email === 'string' && !isValidEmail(body.signer_email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    // Rate limiting
    const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const supabase = getSupabaseClient();
    const { data: rateLimitResult } = await supabase.rpc('check_rate_limit', {
      p_identifier: clientIp,
      p_endpoint: '/api/submit-waiver',
      p_max_requests: 5,
      p_window_minutes: 1,
    });

    if (rateLimitResult && !rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many submissions. Please try again later.' },
        { status: 429 }
      );
    }

    // Sanitize HTML server-side (primary XSS defense)
    const sanitizedHtml = sanitizeHtmlServer(html_snapshot);

    // Call the SECURITY DEFINER RPC which validates all relationships
    // and performs the INSERT with elevated privileges
    const { data: rpcResult, error: rpcError } = await supabase.rpc('submit_signed_waiver', {
      p_tenant_id: tenant_id,
      p_template_id: template_id,
      p_signer_name: String(signer_name).slice(0, 200),
      p_signature_data_url: String(signature_data_url).slice(0, MAX_SIGNATURE_SIZE),
      p_html_snapshot: sanitizedHtml,
      p_signer_email: body.signer_email || null,
      p_reservation_id: body.reservation_id || null,
      p_listing_id: body.listing_id || null,
    });

    if (rpcError) {
      return NextResponse.json({ error: 'Failed to submit waiver' }, { status: 500 });
    }

    const result = rpcResult as { error?: string; success?: boolean };
    if (result?.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
