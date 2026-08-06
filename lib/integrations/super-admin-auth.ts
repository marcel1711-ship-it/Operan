// Server-side Super Admin authorization helper.
// Verifies the requesting user is authenticated and has the 'super_admin' role.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export type SuperAdminContext = {
  userId: string;
  email: string;
};

export async function requireSuperAdmin(req: NextRequest): Promise<SuperAdminContext | NextResponse> {
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const token = authHeader.replace('Bearer ', '');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // Use anon key to verify the user's JWT (this validates the session)
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
  }

  // Check role in tenant_users using service role
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userRecord, error: roleError } = await adminClient
    .from('tenant_users')
    .select('role')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (roleError || !userRecord || userRecord.role !== 'super_admin') {
    return NextResponse.json({ error: 'Super Admin access required' }, { status: 403 });
  }

  return {
    userId: userData.user.id,
    email: userData.user.email || '',
  };
}
