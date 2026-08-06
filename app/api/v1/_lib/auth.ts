import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export type ApiAuthResult = {
  authenticated: boolean;
  tenant_id?: string;
  tenant_name?: string;
  tenant_slug?: string;
  key_id?: string;
  key_name?: string;
  scopes?: string[];
};

export async function authenticateApiKey(req: NextRequest): Promise<ApiAuthResult | null> {
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;

  const key = authHeader.replace('Bearer ', '');
  if (!key.startsWith('opk_')) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await admin.rpc('authenticate_api_key', { p_key: key });

  if (error || !data || data.length === 0) return null;

  const result = data[0];
  if (!result.is_valid) return null;

  return {
    authenticated: true,
    tenant_id: result.tenant_id,
    tenant_name: result.tenant_name,
    tenant_slug: result.tenant_slug,
    key_id: result.key_id,
    key_name: result.key_name,
    scopes: result.scopes || [],
  };
}

export function hasScope(auth: ApiAuthResult, scope: string): boolean {
  if (!auth.scopes || auth.scopes.length === 0) return false;
  return auth.scopes.includes(scope) || auth.scopes.includes('*');
}

export function unauthorized(message: string = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbidden(message: string = 'Insufficient permissions') {
  return NextResponse.json({ error: message }, { status: 403 });
}
