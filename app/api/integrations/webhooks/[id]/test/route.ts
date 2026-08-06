import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { requireTenantAdmin } from '@/lib/integrations/api-auth';
import { createHmac } from 'crypto';

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const endpointId = url.pathname.split('/').slice(-2, -1)[0];
  const body = await req.json();

  const auth = await requireTenantAdmin(req, { tenant_id: body.tenant_id });
  if (auth instanceof NextResponse) return auth;
  const ctx = auth as { tenant_id: string };

  const { data: endpoint } = await supabaseAdmin
    .from('tenant_webhook_endpoints')
    .select('*')
    .eq('id', endpointId)
    .eq('tenant_id', ctx.tenant_id)
    .maybeSingle();

  if (!endpoint) {
    return NextResponse.json({ error: 'Endpoint not found' }, { status: 404 });
  }

  const testPayload = {
    event_type: 'webhook.test',
    tenant_id: ctx.tenant_id,
    timestamp: new Date().toISOString(),
    data: { message: 'This is a test webhook delivery from OPERAN', endpoint: endpoint.name },
  };

  const payloadStr = JSON.stringify(testPayload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac('sha256', endpoint.signing_secret)
    .update(`${timestamp}.${payloadStr}`)
    .digest('hex');

  let responseCode: number | null = null;
  let errorBody: string | null = null;
  let success = false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OPERAN-Signature': `t=${timestamp},v1=${signature}`,
        'X-OPERAN-Event': 'webhook.test',
      },
      body: payloadStr,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    responseCode = response.status;
    success = response.ok;

    if (!response.ok) {
      errorBody = `HTTP ${response.status}`;
    }
  } catch (err) {
    errorBody = err instanceof Error ? err.message : 'Delivery failed';
  }

  await supabaseAdmin.from('tenant_webhook_deliveries').insert({
    tenant_id: ctx.tenant_id,
    endpoint_id: endpointId,
    event_type: 'webhook.test',
    payload: testPayload,
    status: success ? 'delivered' : 'failed',
    attempt_count: 1,
    response_code: responseCode,
    error_message: errorBody,
    delivered_at: success ? new Date().toISOString() : null,
  });

  await supabaseAdmin
    .from('tenant_webhook_endpoints')
    .update({
      last_delivery_at: new Date().toISOString(),
      last_delivery_status: success ? 'delivered' : 'failed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', endpointId);

  await supabaseAdmin.rpc('log_integration_activity', {
    p_tenant_id: ctx.tenant_id,
    p_category: 'automation',
    p_provider: 'webhooks',
    p_action: 'test_delivery',
    p_status: success ? 'success' : 'failed',
    p_message: success ? `Test delivery succeeded (${responseCode})` : `Test delivery failed: ${errorBody}`,
    p_metadata: { endpoint_id: endpointId, response_code: responseCode },
  });

  if (!success) {
    return NextResponse.json({
      success: false,
      error: errorBody || 'Delivery failed',
      response_code: responseCode,
    });
  }

  return NextResponse.json({ success: true, response_code: responseCode });
}
