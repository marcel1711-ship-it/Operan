import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  renderTemplate,
  buildTemplateContext,
  validateTemplateVariables,
  sanitizeHtml,
} from './canonical-renderer.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const STUCK_TIMEOUT_MINUTES = 5;
const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 5;
const MAX_REDIRECTS = 3;
const MAX_BODY_SIZE = 1024 * 100; // 100KB
const MAX_RENDER_SIZE = 1024 * 256; // 256KB

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const authHeader = req.headers.get('authorization') || '';
  const cronSecret = req.headers.get('x-cron-secret') || '';
  const serviceKeyHeader = req.headers.get('x-service-key') || '';
  const url = new URL(req.url);
  const querySecret = url.searchParams.get('secret') || '';

  const expectedSecret = Deno.env.get('CRON_SECRET') || '';
  const expectedServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const isAuthorized = (expectedSecret && (cronSecret === expectedSecret || querySecret === expectedSecret))
    || (expectedServiceKey && (serviceKeyHeader === expectedServiceKey || authHeader.includes(expectedServiceKey)))
    || (expectedServiceKey && querySecret === expectedServiceKey)
    || (req.headers.get('x-cron-internal') === 'db-cron');

  if (!isAuthorized) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const startTime = Date.now();

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

    let totalRuns = 0;
    let totalSteps = 0;
    let totalFailed = 0;
    let totalDeadLetter = 0;
    let totalMessages = 0;

    // Step 1: Recover stuck step runs
    const stuckCutoff = new Date(Date.now() - STUCK_TIMEOUT_MINUTES * 60 * 1000).toISOString();
    await supabase
      .from('automation_step_runs')
      .update({ status: 'pending', started_at: null })
      .eq('status', 'running')
      .lt('started_at', stuckCutoff);

    // Step 2: Process pending runs (find runs that need their first step)
    const { data: pendingRuns } = await supabase
      .from('automation_runs')
      .select('id, tenant_id, workflow_id, workflow_version_id, reservation_id, customer_id, opportunity_id, entity_type, entity_id, context')
      .eq('status', 'running')
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (pendingRuns) {
      for (const run of pendingRuns) {
        await processRun(supabase, run);
        totalRuns++;
      }
    }

    // Step 3: Process due scheduled steps
    const { data: scheduledSteps } = await supabase
      .from('automation_step_runs')
      .select('id, automation_run_id, node_id, action_type, input, attempt_count, max_attempts')
      .eq('status', 'scheduled')
      .lte('scheduled_for', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (scheduledSteps) {
      for (const step of scheduledSteps) {
        const result = await processStep(supabase, step);
        if (result.failed) totalFailed++;
        if (result.deadLetter) totalDeadLetter++;
        totalSteps++;
      }
    }

    // Step 4: Process pending steps
    const { data: pendingSteps } = await supabase
      .from('automation_step_runs')
      .select('id, automation_run_id, node_id, action_type, input, attempt_count, max_attempts')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (pendingSteps) {
      for (const step of pendingSteps) {
        const result = await processStep(supabase, step);
        if (result.failed) totalFailed++;
        if (result.deadLetter) totalDeadLetter++;
        totalSteps++;
      }
    }

    // Step 5: Process queued communication messages
    const { data: queuedMessages } = await supabase
      .from('communication_messages')
      .select('id, tenant_id, channel, provider, recipient, rendered_subject, rendered_body, template_id, customer_id, reservation_id, metadata')
      .eq('status', 'queued')
      .order('queued_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (queuedMessages) {
      for (const msg of queuedMessages) {
        await processMessage(supabase, msg);
        totalMessages++;
      }
    }

    const durationMs = Date.now() - startTime;

    // Log worker invocation
    await supabase.rpc('log_worker_invocation', {
      p_worker_name: 'process-workflows',
      p_success: true,
      p_processed_count: totalRuns + totalSteps + totalMessages,
      p_failed_count: totalFailed,
      p_dead_letter_count: totalDeadLetter,
      p_duration_ms: durationMs,
      p_error_message: null,
    });

    return new Response(JSON.stringify({
      success: true,
      runs_processed: totalRuns,
      steps_processed: totalSteps,
      failed: totalFailed,
      dead_letter: totalDeadLetter,
      messages_processed: totalMessages,
      duration_ms: durationMs,
      timestamp: new Date().toISOString(),
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : 'Internal error';

    // Log failed invocation
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
      if (supabaseUrl && serviceRoleKey) {
        const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
        const supabase = createClient(supabaseUrl, serviceRoleKey);
        await supabase.rpc('log_worker_invocation', {
          p_worker_name: 'process-workflows',
          p_success: false,
          p_processed_count: 0,
          p_failed_count: 1,
          p_dead_letter_count: 0,
          p_duration_ms: durationMs,
          p_error_message: errorMsg,
        });
      }
    } catch { /* ignore logging errors */ }

    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ============================================================
// Process a workflow run — reads from immutable published version
// ============================================================
async function processRun(supabase: any, run: any) {
  const { data: version } = await supabase
    .from('automation_workflow_versions')
    .select('definition')
    .eq('id', run.workflow_version_id)
    .maybeSingle();

  if (!version?.definition) {
    await supabase.rpc('update_workflow_run_status', {
      p_run_id: run.id,
      p_status: 'failed',
      p_error_message: 'No definition found for version',
    });
    return;
  }

  const definition = typeof version.definition === 'string' ? JSON.parse(version.definition) : version.definition;
  const nodes = definition.nodes || [];
  const edges = definition.edges || [];

  const triggerNode = nodes.find((n: any) => n.type === 'trigger' || n.action_type === 'trigger');
  if (!triggerNode) {
    await supabase.rpc('update_workflow_run_status', {
      p_run_id: run.id,
      p_status: 'failed',
      p_error_message: 'No trigger node found',
    });
    return;
  }

  const nextEdges = edges.filter((e: any) => e.source === triggerNode.node_id);
  for (const edge of nextEdges) {
    const nextNode = nodes.find((n: any) => n.node_id === edge.target);
    if (nextNode) {
      await supabase.rpc('create_workflow_step_run', {
        p_tenant_id: run.tenant_id,
        p_automation_run_id: run.id,
        p_node_id: nextNode.node_id,
        p_action_type: nextNode.action_type,
        p_input: {
          config: nextNode.configuration || {},
          tenant_id: run.tenant_id,
          workflow_id: run.workflow_id,
          workflow_version_id: run.workflow_version_id,
          reservation_id: run.reservation_id,
          customer_id: run.customer_id,
          opportunity_id: run.opportunity_id,
          entity_type: run.entity_type,
          entity_id: run.entity_id,
          payload: run.context?.payload || {},
          node_id: nextNode.node_id,
        },
      });
    }
  }
}

// ============================================================
// Process a step — reads config from immutable version
// Uses canonical renderer. No mock fallback for published workflows.
// ============================================================
async function processStep(supabase: any, step: any): Promise<{ failed: boolean; deadLetter: boolean }> {
  await supabase.rpc('update_step_run_status', {
    p_step_run_id: step.id,
    p_status: 'running',
  });

  try {
    const input = typeof step.input === 'string' ? JSON.parse(step.input) : step.input;
    const config = input?.config || {};
    const ctx = {
      run_id: step.automation_run_id,
      tenant_id: input?.tenant_id,
      workflow_id: input?.workflow_id,
      workflow_version_id: input?.workflow_version_id,
      reservation_id: input?.reservation_id,
      customer_id: input?.customer_id,
      opportunity_id: input?.opportunity_id,
      entity_type: input?.entity_type,
      entity_id: input?.entity_id,
      trigger_payload: input?.payload || {},
      node_id: input?.node_id,
    };

    // Load the immutable version definition for navigation
    const { data: version } = await supabase
      .from('automation_workflow_versions')
      .select('definition')
      .eq('id', ctx.workflow_version_id)
      .maybeSingle();

    const definition = version?.definition
      ? (typeof version.definition === 'string' ? JSON.parse(version.definition) : version.definition)
      : { nodes: [], edges: [] };
    const nodes = definition.nodes || [];
    const edges = definition.edges || [];

    // Re-validate node configuration at execution time
    if (!config || typeof config !== 'object') {
      throw new Error(`Invalid configuration for node ${step.node_id}`);
    }

    // Handle wait
    if (step.action_type === 'wait') {
      const duration = config.duration_value as number;
      const unit = config.duration_unit as string;
      if (!duration || duration <= 0 || !['minutes', 'hours', 'days'].includes(unit)) {
        throw new Error(`Invalid wait configuration: duration=${duration}, unit=${unit}`);
      }
      let scheduledFor: Date | null = null;
      const now = new Date();
      if (unit === 'minutes') scheduledFor = new Date(now.getTime() + duration * 60 * 1000);
      if (unit === 'hours') scheduledFor = new Date(now.getTime() + duration * 60 * 60 * 1000);
      if (unit === 'days') scheduledFor = new Date(now.getTime() + duration * 24 * 60 * 60 * 1000);

      if (scheduledFor) {
        const nextEdges = edges.filter((e: any) => e.source === step.node_id && !e.source_handle);
        for (const edge of nextEdges) {
          const nextNode = nodes.find((n: any) => n.node_id === edge.target);
          if (nextNode) {
            await supabase.rpc('create_workflow_step_run', {
              p_tenant_id: ctx.tenant_id,
              p_automation_run_id: step.automation_run_id,
              p_node_id: nextNode.node_id,
              p_action_type: nextNode.action_type,
              p_scheduled_for: scheduledFor.toISOString(),
              p_input: { ...step.input, config: nextNode.configuration || {} },
            });
          }
        }
        await supabase.rpc('update_step_run_status', {
          p_step_run_id: step.id,
          p_status: 'completed',
          p_output: { scheduled_for: scheduledFor.toISOString() },
        });
        return { failed: false, deadLetter: false };
      }
    }

    // Handle wait_until
    if (step.action_type === 'wait_until') {
      let scheduledFor: Date | null = null;
      const targetType = config.target_type as string;
      if (targetType === 'specific_time' && config.target_timestamp) {
        scheduledFor = new Date(config.target_timestamp);
      } else if (targetType === 'reservation_start' && ctx.reservation_id) {
        const { data: reservation } = await supabase
          .from('reservations').select('start_at').eq('id', ctx.reservation_id).maybeSingle();
        if (reservation?.start_at) {
          const offset = (config.offset_value as number) || 0;
          const offsetUnit = (config.offset_unit as string) || 'hours';
          let offsetMs = 0;
          if (offsetUnit === 'minutes') offsetMs = offset * 60 * 1000;
          if (offsetUnit === 'hours') offsetMs = offset * 60 * 60 * 1000;
          if (offsetUnit === 'days') offsetMs = offset * 24 * 60 * 60 * 1000;
          scheduledFor = new Date(new Date(reservation.start_at).getTime() - offsetMs);
        }
      }

      if (scheduledFor && scheduledFor > new Date()) {
        const nextEdges = edges.filter((e: any) => e.source === step.node_id && !e.source_handle);
        for (const edge of nextEdges) {
          const nextNode = nodes.find((n: any) => n.node_id === edge.target);
          if (nextNode) {
            await supabase.rpc('create_workflow_step_run', {
              p_tenant_id: ctx.tenant_id, p_automation_run_id: step.automation_run_id,
              p_node_id: nextNode.node_id, p_action_type: nextNode.action_type,
              p_scheduled_for: scheduledFor.toISOString(),
              p_input: { ...step.input, config: nextNode.configuration || {} },
            });
          }
        }
        await supabase.rpc('update_step_run_status', {
          p_step_run_id: step.id, p_status: 'completed',
          p_output: { scheduled_for: scheduledFor.toISOString() },
        });
        return { failed: false, deadLetter: false };
      } else if (scheduledFor && scheduledFor <= new Date()) {
        await supabase.rpc('update_step_run_status', {
          p_step_run_id: step.id, p_status: 'completed',
          p_output: { scheduled_for: scheduledFor.toISOString(), note: 'already_past' },
        });
      } else {
        throw new Error('Could not determine wait_until target time');
      }
    }

    // Handle stop_workflow
    if (step.action_type === 'stop_workflow') {
      await supabase.rpc('update_step_run_status', {
        p_step_run_id: step.id, p_status: 'completed',
        p_output: { stopped: true, reason: config.reason || '' },
      });
      await supabase.rpc('update_workflow_run_status', {
        p_run_id: step.automation_run_id, p_status: 'completed',
      });
      return { failed: false, deadLetter: false };
    }

    // Handle condition/if_else
    if (step.action_type === 'condition' || step.action_type === 'if_else') {
      const fieldPath = config.field_path as string;
      const operator = config.operator as string;
      const comparisonValue = config.comparison_value as string;

      if (!fieldPath) throw new Error('Condition missing field_path');

      // Resolve actual value from trigger payload
      const parts = fieldPath.split('.');
      let actualValue: unknown = ctx.trigger_payload;
      for (const part of parts.slice(1)) {
        if (actualValue && typeof actualValue === 'object') {
          actualValue = (actualValue as Record<string, unknown>)[part];
        }
      }
      if (actualValue === undefined || actualValue === ctx.trigger_payload) {
        actualValue = ctx.trigger_payload[parts[parts.length - 1]];
      }

      let result = false;
      switch (operator) {
        case 'equals': result = String(actualValue) === String(comparisonValue); break;
        case 'not_equals': result = String(actualValue) !== String(comparisonValue); break;
        case 'greater_than': result = Number(actualValue) > Number(comparisonValue); break;
        case 'less_than': result = Number(actualValue) < Number(comparisonValue); break;
        case 'contains': result = Array.isArray(actualValue) ? actualValue.includes(comparisonValue) : String(actualValue).includes(String(comparisonValue)); break;
        case 'not_contains': result = Array.isArray(actualValue) ? !actualValue.includes(comparisonValue) : !String(actualValue).includes(String(comparisonValue)); break;
        case 'exists': result = actualValue != null && actualValue !== undefined; break;
        case 'not_exists': result = actualValue == null || actualValue === undefined; break;
        case 'is_true': result = actualValue === true; break;
        case 'is_false': result = actualValue === false; break;
      }

      await supabase.rpc('update_step_run_status', {
        p_step_run_id: step.id, p_status: 'completed',
        p_output: { result, branch: result ? 'true' : 'false', field_path: fieldPath, operator, comparison_value: comparisonValue, actual_value: actualValue },
      });

      const branchHandle = result ? 'true' : 'false';
      const nextEdges = edges.filter((e: any) =>
        e.source === step.node_id &&
        (!e.source_handle || e.source_handle === branchHandle)
      );

      for (const edge of nextEdges) {
        const nextNode = nodes.find((n: any) => n.node_id === edge.target);
        if (nextNode) {
          await supabase.rpc('create_workflow_step_run', {
            p_tenant_id: ctx.tenant_id, p_automation_run_id: step.automation_run_id,
            p_node_id: nextNode.node_id, p_action_type: nextNode.action_type,
            p_input: { ...step.input, config: nextNode.configuration || {}, node_id: nextNode.node_id },
          });
        }
      }
      return { failed: false, deadLetter: false };
    }

    // Handle communication actions — NO mock fallback for published workflows
    if (step.action_type === 'send_email' || step.action_type === 'send_sms' || step.action_type === 'send_whatsapp') {
      const channel = step.action_type.replace('send_', '');
      const templateId = config.template_id as string;

      if (!templateId) {
        throw new Error(`Missing template_id for ${step.action_type}`);
      }

      // Check provider readiness
      const { data: readinessResult } = await supabase.rpc('check_provider_readiness', {
        p_tenant_id: ctx.tenant_id,
        p_channel: channel,
      });
      const readiness = readinessResult as { ready?: boolean; reason?: string; integration_id?: string; provider?: string } | null;

      if (!readiness?.ready) {
        // Provider not ready — record action_required, notify tenant, do NOT use mock
        await supabase.rpc('update_step_run_status', {
          p_step_run_id: step.id,
          p_status: 'action_required',
          p_error_message: `Provider not ready: ${readiness?.reason || 'no connected integration'}`,
        });

        // Create in-app notification for tenant
        await supabase.from('notifications').insert({
          tenant_id: ctx.tenant_id,
          type: 'provider_disconnected',
          title: 'Communication provider not connected',
          message: `Workflow step "${step.action_type}" could not execute because no ${channel} provider is connected. Please connect a provider in Settings.`,
          entity_type: 'workflow',
          entity_id: ctx.workflow_id,
          priority: 'high',
        });

        // Record a failed message (not sent, not mock)
        await supabase.rpc('queue_communication_message', {
          p_tenant_id: ctx.tenant_id,
          p_channel: channel,
          p_recipient: '',
          p_rendered_body: '[NOT SENT — provider not connected]',
          p_provider: 'none',
          p_template_id: templateId,
          p_customer_id: ctx.customer_id || null,
          p_reservation_id: ctx.reservation_id || null,
          p_workflow_id: ctx.workflow_id || null,
          p_workflow_run_id: ctx.run_id || null,
          p_workflow_step_run_id: step.id,
          p_idempotency_key: `msg-${step.id}`,
          p_metadata: { status: 'action_required', reason: readiness?.reason, test_mode: false },
        });

        // Continue to next nodes where safe (other branches may proceed)
        await proceedToNext(supabase, step, nodes, edges, ctx);
        return { failed: false, deadLetter: false };
      }

      // Provider is ready — resolve recipient
      let recipient = '';
      if (config.recipient_type === 'custom' && config.recipient_override) {
        recipient = config.recipient_override as string;
      } else if (ctx.customer_id) {
        const { data: customer } = await supabase
          .from('customers')
          .select(channel === 'email' ? 'email' : 'phone')
          .eq('id', ctx.customer_id)
          .maybeSingle();
        recipient = customer?.email || customer?.phone || '';
      }

      if (!recipient) {
        await supabase.rpc('update_step_run_status', {
          p_step_run_id: step.id, p_status: 'skipped',
          p_output: { reason: 'no_recipient' },
        });
        await proceedToNext(supabase, step, nodes, edges, ctx);
        return { failed: false, deadLetter: false };
      }

      // Check consent for marketing messages
      const classification = config.message_classification || 'transactional';
      if (ctx.customer_id) {
        const { data: consentResult } = await supabase.rpc('check_communication_consent', {
          p_customer_id: ctx.customer_id,
          p_channel: channel,
          p_is_transactional: classification === 'transactional',
        });
        const consent = consentResult as { allowed?: boolean; reason?: string } | null;
        if (consent && !consent.allowed) {
          await supabase.rpc('queue_communication_message', {
            p_tenant_id: ctx.tenant_id, p_channel: channel, p_recipient: recipient,
            p_rendered_body: '[SKIPPED — consent denied]',
            p_provider: readiness.provider,
            p_integration_id: readiness.integration_id,
            p_customer_id: ctx.customer_id, p_reservation_id: ctx.reservation_id,
            p_workflow_id: ctx.workflow_id, p_workflow_run_id: ctx.run_id,
            p_workflow_step_run_id: step.id, p_idempotency_key: `msg-${step.id}`,
            p_metadata: { skipped_reason: consent.reason, test_mode: false },
          });
          await supabase.rpc('update_step_run_status', {
            p_step_run_id: step.id, p_status: 'skipped',
            p_output: { reason: 'consent_denied', detail: consent.reason },
          });
          await proceedToNext(supabase, step, nodes, edges, ctx);
          return { failed: false, deadLetter: false };
        }
      }

      // Render template using CANONICAL renderer
      const { data: template } = await supabase
        .from('communication_templates')
        .select('subject, body, channel')
        .eq('id', templateId)
        .maybeSingle();

      if (!template) {
        throw new Error(`Template ${templateId} not found`);
      }

      // Validate template channel matches action channel
      if (template.channel !== channel) {
        throw new Error(`Template channel ${template.channel} does not match action channel ${channel}`);
      }

      // Build context using canonical builder
      const tplContext = await buildTemplateContext(supabase, ctx.tenant_id, ctx.reservation_id, ctx.customer_id);

      // Validate template variables
      const varCheck = validateTemplateVariables(template.body);
      if (!varCheck.valid) {
        throw new Error(`Template contains unknown variables: ${varCheck.unknown.join(', ')}`);
      }

      let renderedBody = renderTemplate(template.body, tplContext);
      let renderedSubject = template.subject ? renderTemplate(template.subject, tplContext) : '';

      // Sanitize HTML for email channel
      if (channel === 'email') {
        renderedBody = sanitizeHtml(renderedBody);
      }

      // Enforce output size limit
      if (renderedBody.length > MAX_RENDER_SIZE) {
        renderedBody = renderedBody.slice(0, MAX_RENDER_SIZE);
      }

      // Queue the message through real provider
      const { data: msgResult } = await supabase.rpc('queue_communication_message', {
        p_tenant_id: ctx.tenant_id,
        p_channel: channel,
        p_recipient: recipient,
        p_rendered_body: renderedBody,
        p_provider: readiness.provider,
        p_rendered_subject: renderedSubject || null,
        p_template_id: templateId,
        p_integration_id: readiness.integration_id,
        p_customer_id: ctx.customer_id || null,
        p_reservation_id: ctx.reservation_id || null,
        p_workflow_id: ctx.workflow_id || null,
        p_workflow_run_id: ctx.run_id || null,
        p_workflow_step_run_id: step.id,
        p_idempotency_key: `msg-${step.id}`,
        p_metadata: {
          message_classification: classification,
          test_mode: false,
          provider_environment: 'production',
        },
      });

      await supabase.rpc('update_step_run_status', {
        p_step_run_id: step.id, p_status: 'completed',
        p_output: { message_id: (msgResult as any)?.message_id, status: 'queued', channel, provider: readiness.provider },
      });

      await proceedToNext(supabase, step, nodes, edges, ctx);
      return { failed: false, deadLetter: false };
    }

    // Handle in-app notification
    if (step.action_type === 'create_in_app_notification') {
      const tplContext = await buildTemplateContext(supabase, ctx.tenant_id, ctx.reservation_id, ctx.customer_id);
      const title = config.title ? renderTemplate(config.title, tplContext) : 'Notification';
      const message = config.message ? renderTemplate(config.message, tplContext) : '';
      await supabase.from('notifications').insert({
        tenant_id: ctx.tenant_id,
        type: 'workflow_notification',
        title,
        message,
        entity_type: ctx.entity_type || 'reservation',
        entity_id: ctx.entity_id || ctx.reservation_id,
        priority: config.priority || 'normal',
      });
      await supabase.rpc('update_step_run_status', {
        p_step_run_id: step.id, p_status: 'completed',
        p_output: { status: 'sent' },
      });
      await proceedToNext(supabase, step, nodes, edges, ctx);
      return { failed: false, deadLetter: false };
    }

    // Handle add_customer_tag
    if (step.action_type === 'add_customer_tag' && ctx.customer_id) {
      const tag = config.tag as string;
      if (!tag) throw new Error('Missing tag');
      const { data: customer } = await supabase
        .from('customers').select('tags').eq('id', ctx.customer_id).maybeSingle();
      if (customer?.tags && !customer.tags.includes(tag)) {
        await supabase.from('customers')
          .update({ tags: [...customer.tags, tag] }).eq('id', ctx.customer_id);
      }
      await supabase.rpc('update_step_run_status', {
        p_step_run_id: step.id, p_status: 'completed',
        p_output: { status: 'tagged', tag },
      });
      await proceedToNext(supabase, step, nodes, edges, ctx);
      return { failed: false, deadLetter: false };
    }

    // Handle add_reservation_note
    if (step.action_type === 'add_reservation_note' && ctx.reservation_id) {
      const tplContext = await buildTemplateContext(supabase, ctx.tenant_id, ctx.reservation_id, ctx.customer_id);
      const noteBody = config.body ? renderTemplate(config.body, tplContext) : '';
      await supabase.from('activity_log').insert({
        tenant_id: ctx.tenant_id,
        entity_type: 'reservation',
        entity_id: ctx.reservation_id,
        action: 'workflow_note',
        actor_name: 'workflow',
        metadata: { note: noteBody, visibility: config.visibility || 'internal' },
      });
      await supabase.rpc('update_step_run_status', {
        p_step_run_id: step.id, p_status: 'completed',
        p_output: { status: 'noted' },
      });
      await proceedToNext(supabase, step, nodes, edges, ctx);
      return { failed: false, deadLetter: false };
    }

    // Handle call_webhook with SSRF protection
    if (step.action_type === 'call_webhook') {
      const webhookUrl = config.url as string;
      if (!webhookUrl) throw new Error('No webhook URL configured');

      const ssrfCheck = await validateWebhookUrl(webhookUrl);
      if (!ssrfCheck.allowed) {
        await supabase.rpc('update_step_run_status', {
          p_step_run_id: step.id, p_status: 'failed',
          p_error_message: `Blocked URL: ${ssrfCheck.reason}`,
        });
        return { failed: true, deadLetter: false };
      }

      try {
        const method = (config.method as string) || 'POST';
        const timeout = ((config.timeout_seconds as number) || 10) * 1000;
        const body = config.body_template as string;
        const response = await fetchWithRedirectProtection(webhookUrl, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: method !== 'GET' && body ? body.slice(0, MAX_BODY_SIZE) : undefined,
          signal: AbortSignal.timeout(timeout),
        }, MAX_REDIRECTS);

        await supabase.rpc('update_step_run_status', {
          p_step_run_id: step.id,
          p_status: response.ok ? 'completed' : 'failed',
          p_output: { status_code: response.status, hostname: new URL(webhookUrl).hostname },
          p_error_message: response.ok ? null : `HTTP ${response.status}`,
        });
        return { failed: !response.ok, deadLetter: false };
      } catch (err) {
        await supabase.rpc('update_step_run_status', {
          p_step_run_id: step.id, p_status: 'failed',
          p_error_message: err instanceof Error ? err.message : 'fetch_error',
        });
        return { failed: true, deadLetter: false };
      }
    }

    // Unknown action — fail safely, do not execute
    await supabase.rpc('update_step_run_status', {
      p_step_run_id: step.id, p_status: 'failed',
      p_error_message: `Unknown action type: ${step.action_type}`,
    });

    // Notify tenant of malformed node
    await supabase.from('notifications').insert({
      tenant_id: ctx.tenant_id,
      type: 'workflow_error',
      title: 'Workflow execution error',
      message: `Unknown action type "${step.action_type}" encountered in workflow. This may indicate a malformed workflow definition.`,
      entity_type: 'workflow',
      entity_id: ctx.workflow_id,
      priority: 'high',
    });

    return { failed: true, deadLetter: false };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    const newAttempt = step.attempt_count + 1;

    if (newAttempt >= (step.max_attempts || MAX_ATTEMPTS)) {
      await supabase.rpc('update_step_run_status', {
        p_step_run_id: step.id, p_status: 'dead_letter',
        p_error_message: errorMsg,
      });
      return { failed: true, deadLetter: true };
    } else {
      await supabase.rpc('update_step_run_status', {
        p_step_run_id: step.id, p_status: 'pending',
        p_error_message: errorMsg,
      });
      return { failed: true, deadLetter: false };
    }
  }
}

// ============================================================
// Helper: proceed to next nodes
// ============================================================
async function proceedToNext(supabase: any, step: any, nodes: any[], edges: any[], ctx: any) {
  const nextEdges = edges.filter((e: any) => e.source === step.node_id && !e.source_handle);
  for (const edge of nextEdges) {
    const nextNode = nodes.find((n: any) => n.node_id === edge.target);
    if (nextNode) {
      await supabase.rpc('create_workflow_step_run', {
        p_tenant_id: ctx.tenant_id, p_automation_run_id: step.automation_run_id,
        p_node_id: nextNode.node_id, p_action_type: nextNode.action_type,
        p_input: { ...step.input, config: nextNode.configuration || {}, node_id: nextNode.node_id },
      });
    }
  }
  if (nextEdges.length === 0) {
    await supabase.rpc('update_workflow_run_status', {
      p_run_id: step.automation_run_id, p_status: 'completed',
    });
  }
}

// ============================================================
// SSRF Protection
// ============================================================
async function validateWebhookUrl(url: string): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { allowed: false, reason: 'non-http protocol' };
    }
    const hostname = parsed.hostname.toLowerCase();
    const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1', '169.254.169.254', 'metadata.google.internal', 'metadata.aws.internal'];
    for (const h of blockedHosts) {
      if (hostname === h) return { allowed: false, reason: 'blocked host' };
    }
    const blockedPrefixes = ['10.', '172.16.', '172.17.', '172.18.', '172.19.', '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.', '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.', '192.168.'];
    for (const p of blockedPrefixes) {
      if (hostname.startsWith(p)) return { allowed: false, reason: 'private IP range' };
    }
    if (hostname.endsWith('.internal') || hostname.endsWith('.local')) {
      return { allowed: false, reason: 'internal/local TLD' };
    }
    return { allowed: true };
  } catch {
    return { allowed: false, reason: 'invalid URL' };
  }
}

async function fetchWithRedirectProtection(url: string, options: RequestInit, maxRedirects: number): Promise<Response> {
  let currentUrl = url;
  let redirectCount = 0;
  while (redirectCount <= maxRedirects) {
    const check = await validateWebhookUrl(currentUrl);
    if (!check.allowed) throw new Error(`Redirect to blocked URL: ${check.reason}`);
    const response = await fetch(currentUrl, { ...options, redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirect without Location header');
      currentUrl = new URL(location, currentUrl).href;
      redirectCount++;
      continue;
    }
    return response;
  }
  throw new Error(`Too many redirects (max ${maxRedirects})`);
}

// ============================================================
// Process queued communication messages
// ============================================================
async function processMessage(supabase: any, msg: any) {
  await supabase.rpc('update_communication_message_status', {
    p_message_id: msg.id, p_status: 'sending',
  });

  const metadata = msg.metadata || {};
  const isTestMode = metadata.test_mode === true;

  // Mock provider — ONLY allowed in explicit Test Mode
  if (msg.provider === 'mock' || (!msg.provider && isTestMode)) {
    await supabase.rpc('update_communication_message_status', {
      p_message_id: msg.id,
      p_status: 'sent',
      p_provider_message_id: `mock_${msg.id}`,
      p_provider_status: 'sent_mock',
    });
    return;
  }

  // Provider not connected — record as failed, never use mock
  if (msg.provider === 'none' || !msg.provider) {
    await supabase.rpc('update_communication_message_status', {
      p_message_id: msg.id,
      p_status: 'failed',
      p_failure_code: 'NO_PROVIDER',
      p_failure_reason: 'No communication provider connected for this channel',
    });
    return;
  }

  // Real providers would be handled here when configured
  // For now, record as failed since no real adapter is active
  await supabase.rpc('update_communication_message_status', {
    p_message_id: msg.id,
    p_status: 'failed',
    p_failure_code: 'NO_ADAPTER',
    p_failure_reason: `No adapter configured for provider: ${msg.provider}`,
  });
}
