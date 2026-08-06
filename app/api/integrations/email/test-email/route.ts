import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { sendResendEmail, isResendConfigured } from '@/lib/integrations/resend-server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { recipient, subject, sender_id } = body as { recipient?: string; subject?: string; sender_id?: string };

    if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      return NextResponse.json({ error: 'Valid recipient email is required' }, { status: 400 });
    }

    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: membership } = await supabaseAdmin
      .from('tenant_members')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .eq('role', 'tenant_admin')
      .maybeSingle();

    if (!membership?.tenant_id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const tenantId = membership.tenant_id;

    const { data: readinessResult } = await supabaseAdmin.rpc('check_tenant_email_readiness', {
      p_tenant_id: tenantId,
      p_recipient: recipient,
    });

    const readiness = readinessResult as { ready?: boolean; reason?: string } | null;
    if (readiness && !readiness.ready) {
      return NextResponse.json({ error: `Email not ready: ${readiness.reason}` }, { status: 400 });
    }

    let sender;
    if (sender_id) {
      const { data: s } = await supabaseAdmin
        .from('tenant_email_senders')
        .select('*')
        .eq('id', sender_id)
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .is('archived_at', null)
        .maybeSingle();
      sender = s;
    } else {
      const { data: s } = await supabaseAdmin
        .from('tenant_email_senders')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_default', true)
        .eq('is_active', true)
        .is('archived_at', null)
        .maybeSingle();
      sender = s;
    }

    if (!sender) {
      return NextResponse.json({ error: 'No active sender configured' }, { status: 400 });
    }

    const { data: domain } = await supabaseAdmin
      .from('tenant_email_domains')
      .select('domain, status')
      .eq('id', sender.email_domain_id)
      .maybeSingle();

    if (!domain || domain.status !== 'verified' && domain.status !== 'ready') {
      return NextResponse.json({ error: 'Sending domain is not verified' }, { status: 400 });
    }

    const { data: testToday } = await supabaseAdmin
      .from('email_usage_daily')
      .select('test_emails_sent')
      .eq('tenant_id', tenantId)
      .eq('usage_date', new Date().toISOString().split('T')[0])
      .maybeSingle();

    const testCount = testToday?.test_emails_sent || 0;
    const { data: limitConfig } = await supabaseAdmin
      .from('email_limit_config')
      .select('test_emails_per_hour')
      .or(`scope.eq.global,scope.eq.plan,scope.eq.tenant_override`)
      .order('scope', { ascending: false })
      .limit(1)
      .maybeSingle();

    const testLimit = limitConfig?.test_emails_per_hour || 5;
    if (testCount >= testLimit) {
      return NextResponse.json({ error: 'Test email rate limit reached. Try again later.' }, { status: 429 });
    }

    if (!isResendConfigured()) {
      return NextResponse.json({
        error: 'Resend provider not configured. Test emails require the platform credential.',
      }, { status: 503 });
    }

    const fromEmail = `${sender.sender_name} <${sender.from_email}>`;
    const testSubject = subject || `Test Email from ${domain.domain}`;
    const testHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Test Email</h2>
        <p>This is a test email sent from your charter booking platform.</p>
        <p><strong>Domain:</strong> ${domain.domain}</p>
        <p><strong>Sender:</strong> ${sender.from_email}</p>
        <p>If you received this email, your email configuration is working correctly.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #999; font-size: 12px;">This is an automated test email. Do not reply.</p>
      </div>
    `;

    const idempotencyKey = `test-${tenantId}-${Date.now()}`;
    const result = await sendResendEmail({
      from: fromEmail,
      to: recipient,
      subject: testSubject,
      html: testHtml,
      reply_to: sender.reply_to_email || undefined,
      idempotency_key: idempotencyKey,
      tags: [{ name: 'type', value: 'test_email' }],
    });

    const { data: messageRecord } = await supabaseAdmin
      .from('communication_messages')
      .insert({
        tenant_id: tenantId,
        channel: 'email',
        provider: 'resend',
        recipient,
        sender_name: sender.sender_name,
        from_email: sender.from_email,
        reply_to_email: sender.reply_to_email || null,
        rendered_body: testHtml,
        rendered_subject: testSubject,
        status: result.success ? 'accepted' : 'failed',
        provider_message_id: result.provider_message_id,
        provider_environment: result.metadata?.environment as string || null,
        email_domain_id: sender.email_domain_id,
        email_sender_id: sender.id,
        source: 'test_email',
        idempotency_key: idempotencyKey,
        metadata: { test_mode: false, is_test: true },
        accepted_at: result.success ? new Date().toISOString() : null,
      })
      .select('id')
      .single();

    await supabaseAdmin.rpc('increment_email_usage', {
      p_tenant_id: tenantId,
      p_is_test: true,
    });

    await supabaseAdmin.from('activity_log').insert({
      tenant_id: tenantId,
      entity_type: 'communication_message',
      entity_id: messageRecord?.id,
      action: 'test_email_sent',
      actor_name: user.email || 'tenant_admin',
      metadata: { recipient, domain: domain.domain, provider_message_id: result.provider_message_id },
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to send test email' }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      status: 'accepted',
      provider_message_id: result.provider_message_id,
      message: 'Test email accepted by provider. Delivery status will update via webhook.',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg.replace(/re_[a-zA-Z0-9_]+/g, '[REDACTED]') }, { status: 500 });
  }
}
