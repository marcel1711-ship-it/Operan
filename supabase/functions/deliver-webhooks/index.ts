import { createClient } from "jsr:@supabase/supabase-js@2";
import { createHmac } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_DELIVERIES_PER_RUN = 50;
const DELIVERY_TIMEOUT_MS = 15000;
const MAX_RESPONSE_BODY = 2048; // Store only first 2KB of response
const STUCK_TIMEOUT_MINUTES = 5;
const MAX_ATTEMPTS = 5;

// Retryable HTTP status codes: 408 (timeout), 429 (rate limit), 5xx (server errors)
function isRetryable(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status < 600);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startTime = Date.now();
  let processedCount = 0;
  let successCount = 0;
  let failedCount = 0;
  let deadLetterCount = 0;

  try {
    // Auth check
    const cronSecret = req.headers.get("x-cron-secret");
    const authHeader = req.headers.get("authorization") || "";
    const isInternal = req.headers.get("x-cron-internal") === "db-cron";

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabaseUrl = Deno.env.get("NEXT_PUBLIC_SUPABASE_URL") || Deno.env.get("SUPABASE_URL") || "";

    if (!cronSecret && !authHeader.includes(serviceRoleKey) && !isInternal) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Step 1: Recover stuck deliveries
    const stuckCutoff = new Date(Date.now() - STUCK_TIMEOUT_MINUTES * 60000).toISOString();
    await supabase
      .from("webhook_outbox")
      .update({ status: "pending", locked_at: null, locked_by: null })
      .eq("status", "delivering")
      .lt("locked_at", stuckCutoff);

    // Step 2: Select pending deliveries (and failed ones past their retry time)
    const now = new Date().toISOString();
    const { data: deliveries, error: deliveryError } = await supabase
      .from("webhook_outbox")
      .select(`
        id, tenant_id, endpoint_id, domain_event_type, entity_id, payload,
        idempotency_key, status, attempt_count, max_attempts,
        tenant_webhook_endpoints!inner(id, url, signing_secret, is_active, name)
      `)
      .in("status", ["pending", "failed"])
      .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
      .limit(MAX_DELIVERIES_PER_RUN);

    if (deliveryError) throw new Error(`Failed to fetch deliveries: ${deliveryError.message}`);

    if (!deliveries || deliveries.length === 0) {
      await logWorkerInvocation(supabase, "deliver-webhooks", true, 0, 0, 0, 0, Date.now() - startTime);
      return new Response(JSON.stringify({ success: true, processed: 0, message: "No deliveries pending" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const delivery of deliveries as Array<Record<string, unknown>>) {
      processedCount++;
      const endpoint = delivery.tenant_webhook_endpoints as { id: string; url: string; signing_secret: string; is_active: boolean; name: string };

      if (!endpoint || !endpoint.is_active) {
        // Endpoint is inactive, skip
        continue;
      }

      // Lock the delivery
      const workerId = `wh-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const { error: lockError } = await supabase
        .from("webhook_outbox")
        .update({ status: "delivering", locked_at: now, locked_by: workerId })
        .eq("id", delivery.id)
        .in("status", ["pending", "failed"]);

      if (lockError) continue;

      // Build payload
      const payloadBody = JSON.stringify({
        event: delivery.domain_event_type,
        entity_id: delivery.entity_id,
        tenant_id: delivery.tenant_id,
        timestamp: now,
        data: delivery.payload,
      });

      // Sign the payload
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = createHmac("sha256", endpoint.signing_secret)
        .update(`${timestamp}.${payloadBody}`)
        .digest("hex");

      const newAttemptCount = (delivery.attempt_count as number) + 1;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

        const response = await fetch(endpoint.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-OPERAN-Signature": `t=${timestamp},v1=${signature}`,
            "X-OPERAN-Event": delivery.domain_event_type as string,
            "X-OPERAN-Delivery": delivery.id as string,
          },
          body: payloadBody,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        const responseText = await response.text();
        const responseExcerpt = responseText.substring(0, MAX_RESPONSE_BODY);

        if (response.ok) {
          // Success
          await supabase
            .from("webhook_outbox")
            .update({
              status: "delivered",
              attempt_count: newAttemptCount,
              response_code: response.status,
              response_body: responseExcerpt,
              error_message: null,
              delivered_at: new Date().toISOString(),
              locked_at: null,
              locked_by: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", delivery.id);

          // Update endpoint's last delivery info
          await supabase
            .from("tenant_webhook_endpoints")
            .update({
              last_delivery_at: new Date().toISOString(),
              last_delivery_status: "delivered",
              updated_at: new Date().toISOString(),
            })
            .eq("id", endpoint.id);

          successCount++;
        } else if (isRetryable(response.status) && newAttemptCount < (delivery.max_attempts as number)) {
          // Retryable failure
          const retryDelay = Math.pow(2, newAttemptCount) * 60000; // Exponential backoff: 2min, 4min, 8min, 16min, 32min
          await supabase
            .from("webhook_outbox")
            .update({
              status: "failed",
              attempt_count: newAttemptCount,
              response_code: response.status,
              response_body: responseExcerpt,
              error_message: `HTTP ${response.status}`,
              next_retry_at: new Date(Date.now() + retryDelay).toISOString(),
              locked_at: null,
              locked_by: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", delivery.id);

          failedCount++;
        } else if (newAttemptCount >= (delivery.max_attempts as number)) {
          // Exhausted retries → dead letter
          await supabase
            .from("webhook_outbox")
            .update({
              status: "dead_letter",
              attempt_count: newAttemptCount,
              response_code: response.status,
              response_body: responseExcerpt,
              error_message: `Max attempts reached (HTTP ${response.status})`,
              locked_at: null,
              locked_by: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", delivery.id);

          deadLetterCount++;
        } else {
          // Non-retryable 4xx → dead letter immediately
          await supabase
            .from("webhook_outbox")
            .update({
              status: "dead_letter",
              attempt_count: newAttemptCount,
              response_code: response.status,
              response_body: responseExcerpt,
              error_message: `Non-retryable HTTP ${response.status}`,
              locked_at: null,
              locked_by: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", delivery.id);

          deadLetterCount++;
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Delivery failed";

        if (newAttemptCount < (delivery.max_attempts as number)) {
          const retryDelay = Math.pow(2, newAttemptCount) * 60000;
          await supabase
            .from("webhook_outbox")
            .update({
              status: "failed",
              attempt_count: newAttemptCount,
              error_message: errMsg,
              next_retry_at: new Date(Date.now() + retryDelay).toISOString(),
              locked_at: null,
              locked_by: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", delivery.id);

          failedCount++;
        } else {
          await supabase
            .from("webhook_outbox")
            .update({
              status: "dead_letter",
              attempt_count: newAttemptCount,
              error_message: errMsg,
              locked_at: null,
              locked_by: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", delivery.id);

          deadLetterCount++;
        }
      }
    }

    const durationMs = Date.now() - startTime;
    await logWorkerInvocation(supabase, "deliver-webhooks", failedCount === 0 && deadLetterCount === 0, processedCount, successCount, failedCount, deadLetterCount, durationMs);

    return new Response(JSON.stringify({
      success: true,
      processed: processedCount,
      delivered: successCount,
      failed: failedCount,
      dead_letter: deadLetterCount,
      duration_ms: durationMs,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errMsg = err instanceof Error ? err.message : "Unknown error";

    const supabaseUrl = Deno.env.get("NEXT_PUBLIC_SUPABASE_URL") || Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (supabaseUrl && serviceRoleKey) {
      const supabase = createClient(supabaseUrl, serviceRoleKey);
      await logWorkerInvocation(supabase, "deliver-webhooks", false, processedCount, successCount, failedCount, deadLetterCount, durationMs, errMsg);
    }

    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function logWorkerInvocation(
  supabase: ReturnType<typeof createClient>,
  workerName: string,
  success: boolean,
  processedCount: number,
  successCount: number,
  failedCount: number,
  deadLetterCount: number,
  durationMs: number,
  errorMessage?: string
): Promise<void> {
  try {
    await supabase.rpc("log_worker_invocation", {
      p_worker_name: workerName,
      p_success: success,
      p_processed_count: processedCount,
      p_failed_count: failedCount,
      p_dead_letter_count: deadLetterCount,
      p_duration_ms: durationMs,
      p_error_message: errorMessage || null,
    });
  } catch {
    // Non-critical
  }
}
