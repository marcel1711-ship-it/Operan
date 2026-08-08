import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { sendResendEmail, getTenantResendCredentials } from '@/lib/integrations/resend-server';

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

    const tenantCreds = await getTenantResendCredentials(tenantId);

    if (tenantCreds) {
      const fromName = tenantCreds.from_name || 'OPERAN';
      const fromEmail = tenantCreds.from_email || 'onboarding@resend.dev';
      const fromStr = `${fromName} <${fromEmail}>`;
      const testSubject = subject || 'Test Email from OPERAN';
      const testHtml = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Test Email</h2>
          <p>This is a test email sent from your OPERAN platform.</p>
          <p><strong>From:</strong> ${fromEmail}</p>
          <p>If you received this email, your email configuration is working correctly.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">This is an automated test email. Do not reply.</p>
        </div>
      `;

      const result = await sendResendEmail({
        from: fromStr,
        to: recipient,
        subject: testSubject,
        html: testHtml,
        tenant_id: tenantId,
        tags: [{ name: 'type', value: 'test_email' }],
      });

      if (!result.success) {
        return NextResponse.json({ error: result.error || 'Failed to send test email' }, { status: 502 });
      }

      return NextResponse.json({
        success: true,
        status: 'accepted',
        provider_message_id: result.provider_message_id,
      });
    }

    // Fallback: legacy domain/sender flow
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
      return NextResponse.json({ error: 'No email configuration found. Add your Resend API key in Integrations.' }, { status: 400 });
    }

    const { data: domain } = await supabaseAdmin
      .from('tenant_email_domains')
      .select('domain, status')
      .eq('id', sender.email_domain_id)
      .maybeSingle();

    if (!domain || (domain.status !== 'verified' && domain.status !== 'ready')) {
      return NextResponse.json({ error: 'Sending domain is not verified' }, { status: 400 });
    }

    const fromEmailLegacy = `${sender.sender_name} <${sender.from_email}>`;
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

    const result = await sendResendEmail({
      from: fromEmailLegacy,
      to: recipient,
      subject: testSubject,
      html: testHtml,
      reply_to: sender.reply_to_email || undefined,
      tags: [{ name: 'type', value: 'test_email' }],
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to send test email' }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      status: 'accepted',
      provider_message_id: result.provider_message_id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg.replace(/re_[a-zA-Z0-9_]+/g, '[REDACTED]') }, { status: 500 });
  }
}
