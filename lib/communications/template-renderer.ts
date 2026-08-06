import { supabaseAdmin } from '@/lib/supabase-server';
import { formatCurrency, formatDate } from '@/lib/format';

export type TemplateVariableContext = {
  customer?: {
    first_name?: string;
    last_name?: string;
    full_name?: string;
    email?: string;
    phone?: string;
  };
  reservation?: {
    booking_reference?: string;
    start_at?: string;
    end_at?: string;
    guest_count?: number;
    total_amount?: number;
    amount_paid?: number;
    balance_due?: number;
    booking_status?: string;
    payment_status?: string;
  };
  listing?: {
    name?: string;
    location?: string;
    meeting_point?: string;
    customer_instructions?: string;
  };
  tenant?: {
    name?: string;
    phone?: string;
    email?: string;
    logo_url?: string;
  };
  payment?: {
    amount?: number;
    payment_type?: string;
    status?: string;
  };
  waiver?: {
    signing_url?: string;
    signed_count?: number;
    required_count?: number;
  };
};

const ALLOWED_PREFIXES = ['customer', 'reservation', 'listing', 'tenant', 'payment', 'waiver'];

const SENSITIVE_KEYS = ['token', 'secret', 'password', 'api_key', 'access_token', 'provider_secret', 'metadata'];

export function renderTemplate(template: string, context: TemplateVariableContext): string {
  return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (match, path: string) => {
    const trimmed = path.trim();
    const parts = trimmed.split('.');
    const prefix = parts[0];

    if (!ALLOWED_PREFIXES.includes(prefix)) {
      return match;
    }

    for (const part of parts) {
      if (SENSITIVE_KEYS.some(sk => part.toLowerCase().includes(sk))) {
        return match;
      }
    }

    let value: unknown = context;
    for (const part of parts) {
      if (value == null || typeof value !== 'object') return match;
      value = (value as Record<string, unknown>)[part];
    }

    if (value == null || value === undefined) return '';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return String(value);
    if (typeof value === 'string') {
      if (parts[0] === 'reservation' && (parts[1] === 'total_amount' || parts[1] === 'amount_paid' || parts[1] === 'balance_due')) {
        return formatCurrency(parseFloat(value));
      }
      if (parts[0] === 'reservation' && (parts[1] === 'start_at' || parts[1] === 'end_at')) {
        return formatDate(value);
      }
      if (parts[0] === 'payment' && parts[1] === 'amount') {
        return formatCurrency(parseFloat(value));
      }
      return value;
    }

    return match;
  });
}

export function validateTemplateVariables(template: string): { valid: boolean; unknown: string[] } {
  const unknown: string[] = [];
  const regex = /\{\{\s*([^}]+)\s*\}\}/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(template)) !== null) {
    const path = match[1].trim();
    const prefix = path.split('.')[0];
    if (!ALLOWED_PREFIXES.includes(prefix)) {
      unknown.push(path);
    }
    for (const part of path.split('.')) {
      if (SENSITIVE_KEYS.some(sk => part.toLowerCase().includes(sk))) {
        unknown.push(path);
        break;
      }
    }
  }

  return { valid: unknown.length === 0, unknown };
}

export async function buildTemplateContext(
  tenantId: string,
  reservationId?: string,
  customerId?: string
): Promise<TemplateVariableContext> {
  const context: TemplateVariableContext = {};

  if (tenantId) {
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('name, slug')
      .eq('id', tenantId)
      .maybeSingle();
    if (tenant) {
      context.tenant = { name: tenant.name };
    }
  }

  if (customerId) {
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('first_name, last_name, full_name, email, phone')
      .eq('id', customerId)
      .maybeSingle();
    if (customer) {
      context.customer = {
        first_name: customer.first_name,
        last_name: customer.last_name,
        full_name: customer.full_name,
        email: customer.email,
        phone: customer.phone,
      };
    }
  }

  if (reservationId) {
    const { data: reservation } = await supabaseAdmin
      .from('reservations')
      .select(`
        booking_reference, start_at, end_at, guest_count,
        total_amount, amount_paid, balance_due,
        booking_status, payment_status,
        customer:customer_id (first_name, last_name, full_name, email, phone),
        listing:listing_id (name, location, meeting_point, customer_instructions)
      `)
      .eq('id', reservationId)
      .maybeSingle();

    if (reservation) {
      context.reservation = {
        booking_reference: reservation.booking_reference,
        start_at: reservation.start_at,
        end_at: reservation.end_at,
        guest_count: reservation.guest_count,
        total_amount: reservation.total_amount,
        amount_paid: reservation.amount_paid,
        balance_due: reservation.balance_due,
        booking_status: reservation.booking_status,
        payment_status: reservation.payment_status,
      };

      if (reservation.customer) {
        const cust = Array.isArray(reservation.customer) ? reservation.customer[0] : reservation.customer;
        context.customer = {
          first_name: cust.first_name,
          last_name: cust.last_name,
          full_name: cust.full_name,
          email: cust.email,
          phone: cust.phone,
        };
      }

      if (reservation.listing) {
        const lst = Array.isArray(reservation.listing) ? reservation.listing[0] : reservation.listing;
        context.listing = {
          name: lst.name,
          location: lst.location,
          meeting_point: lst.meeting_point,
          customer_instructions: lst.customer_instructions,
        };
      }
    }
  }

  return context;
}

export function sanitizeHtml(html: string): string {
  const xss = require('xss');
  return xss(html, {
    whiteList: {
      p: [], br: [], strong: [], em: [], u: [], a: ['href'], ul: [], ol: [], li: [],
      h1: [], h2: [], h3: [], span: ['style'], div: ['style'], img: ['src', 'alt'],
      table: [], thead: [], tbody: [], tr: [], th: [], td: [],
    },
    stripIgnoreTagBody: ['script', 'style'],
  });
}
