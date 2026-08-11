import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, businessName, fullName } = body;

    if (!email?.trim() || !password || !businessName?.trim() || !fullName?.trim()) {
      return NextResponse.json(
        { error: 'All fields are required.' },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters.' },
        { status: 400 },
      );
    }

    const admin = getSupabaseAdmin();

    const slug = businessName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const { data: existingSlug } = await admin
      .from('tenants')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    const finalSlug = existingSlug
      ? `${slug}-${Date.now().toString(36)}`
      : slug;

    const { data: tenant, error: tenantError } = await admin
      .from('tenants')
      .insert({
        name: businessName.trim(),
        slug: finalSlug,
        email: email.trim(),
        plan: 'starter',
        status: 'trial',
        trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        next_renewal_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        monthly_amount: 149,
        template: 'default',
        integration_type: 'new_web',
        primary_color: '#0d9488',
        secondary_color: '#0f766e',
      })
      .select('id')
      .single();

    if (tenantError) {
      return NextResponse.json(
        { error: `Failed to create business: ${tenantError.message}` },
        { status: 500 },
      );
    }

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName.trim() },
    });

    if (authError) {
      await admin.from('tenants').delete().eq('id', tenant.id);
      const msg = authError.message.includes('already been registered')
        ? 'An account with this email already exists. Please log in instead.'
        : authError.message;
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    await admin.from('tenant_users').insert({
      tenant_id: tenant.id,
      user_id: authData.user.id,
      role: 'tenant_admin',
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 },
    );
  }
}
