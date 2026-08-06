import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const STUCK_TIMEOUT_MININUTES = 5;
const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 20;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const authHeader = req.headers.get('authorization') || '';
  const cronSecret = req.headers.get('x-cron-secret') || '';
  const url = new URL(req.url);
  const querySecret = url.searchParams.get('secret') || '';

  const expectedSecret = Deno.env.get('CRON_SECRET') || '';
  const isAuthorized = (expectedSecret && (cronSecret === expectedSecret || querySecret === expectedSecret))
    || authHeader.includes(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '')
    || (req.headers.get('x-cron-internal') === 'db-cron');

  if (!isAuthorized) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Missing configuration' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Step 1: Recover stuck records (processing > STUCK_TIMEOUT_MININUTES)
    const stuckCutoff = new Date(Date.now() - STUCK_TIMEOUT_MININUTES * 60 * 1000).toISOString();
    const { data: recovered, error: recoverError } = await supabase
      .from('event_outbox')
      .update({
        status: 'pending',
        locked_at: null,
        locked_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq('status', 'processing')
      .lt('locked_at', stuckCutoff)
      .select('id');

    const recoveredCount = recovered?.length || 0;

    // Step 2: Process outbox batch
    const workerId = `worker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { data: batchResult, error: batchError } = await supabase.rpc('process_outbox_batch', {
      p_batch_size: BATCH_SIZE,
      p_worker_id: workerId,
    });

    if (batchError) {
      return new Response(JSON.stringify({ error: batchError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 3: Check for dead-letter items and create notifications
    const { data: deadLetters } = await supabase
      .from('event_outbox')
      .select('id, tenant_id, topic, last_error, attempt_count')
      .eq('status', 'dead_letter')
      .order('updated_at', { ascending: false })
      .limit(5);

    if (deadLetters && deadLetters.length > 0) {
      for (const dl of deadLetters) {
        // Check if notification already exists for this dead-letter item
        const { data: existingNotif } = await supabase
          .from('notifications')
          .select('id')
          .eq('tenant_id', dl.tenant_id)
          .eq('type', 'webhook_processing_failed')
          .ilike('message', `%${dl.id}%`)
          .limit(1);

        if (!existingNotif || existingNotif.length === 0) {
          await supabase.from('notifications').insert({
            tenant_id: dl.tenant_id,
            type: 'webhook_processing_failed',
            title: 'Background Processing Failed',
            message: `A background task (${dl.topic}) failed after ${dl.attempt_count} attempts: ${dl.last_error || 'Unknown error'}. Item ID: ${dl.id}`,
            entity_type: 'system',
            priority: 'high',
          });
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      recovered_stuck: recoveredCount,
      processed: batchResult,
      dead_letters: deadLetters?.length || 0,
      timestamp: new Date().toISOString(),
      config: {
        stuck_timeout_minutes: STUCK_TIMEOUT_MININUTES,
        max_attempts: MAX_ATTEMPTS,
        batch_size: BATCH_SIZE,
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : 'Internal error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
