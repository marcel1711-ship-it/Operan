import { supabase } from '@/lib/supabase';
import type { Customer } from '@/lib/types';

/**
 * Customer service — centralized data access for customers.
 */

export async function fetchCustomersByTenant(
  tenantId: string,
  opts?: { search?: string; page?: number; pageSize?: number }
): Promise<{ data: Customer[]; total: number }> {
  const page = opts?.page ?? 0;
  const pageSize = opts?.pageSize ?? 50;
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('customers')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (opts?.search) {
    const q = opts.search.trim();
    query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,company_name.ilike.%${q}%`);
  }

  const { data, error, count } = await query.range(from, to);
  if (error) throw new Error(error.message);

  return { data: (data as Customer[]) || [], total: count || 0 };
}

export async function createCustomer(
  tenantId: string,
  firstName: string,
  lastName: string,
  email?: string | null,
  phone?: string | null,
  companyName?: string | null,
  tags?: string[],
  source?: string
): Promise<Customer | null> {
  const normalizedEmail = email ? email.toLowerCase().trim() : null;
  const normalizedPhone = phone ? phone.replace(/[^+\d]/g, '') : null;

  const { data, error } = await supabase
    .from('customers')
    .insert({
      tenant_id: tenantId,
      first_name: firstName,
      last_name: lastName || '',
      full_name: `${firstName} ${lastName || ''}`.trim(),
      email,
      normalized_email: normalizedEmail,
      phone,
      normalized_phone: normalizedPhone,
      company_name: companyName || null,
      tags: tags || [],
      source: source || 'manual',
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as Customer;
}
