import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_FEEDS_PER_RUN = 20;
const FETCH_TIMEOUT_MS = 15000;
const MAX_RESPONSE_SIZE = 1024 * 1024; // 1MB

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "0.0.0.0" ||
    h === "[::1]" ||
    h.startsWith("10.") ||
    h.startsWith("192.168.") ||
    h.startsWith("172.16.") ||
    h.startsWith("172.17.") ||
    h.startsWith("172.18.") ||
    h.startsWith("172.19.") ||
    h.startsWith("172.20.") ||
    h.startsWith("172.21.") ||
    h.startsWith("172.22.") ||
    h.startsWith("172.23.") ||
    h.startsWith("172.24.") ||
    h.startsWith("172.25.") ||
    h.startsWith("172.26.") ||
    h.startsWith("172.27.") ||
    h.startsWith("172.28.") ||
    h.startsWith("172.29.") ||
    h.startsWith("172.30.") ||
    h.startsWith("172.31.") ||
    h.endsWith(".internal") ||
    h.endsWith(".local") ||
    h === "169.254.169.254" // cloud metadata
  );
}

function parseIcal(text: string): Array<{ uid: string; start: string; end: string; summary: string; allDay: boolean }> {
  const events: Array<{ uid: string; start: string; end: string; summary: string; allDay: boolean }> = [];
  const veventBlocks = text.split("BEGIN:VEVENT");

  for (const block of veventBlocks) {
    if (!block.includes("END:VEVENT")) continue;

    const lines = block.split("\r\n").map(l => l.trim()).filter(Boolean);

    let uid = "";
    let dtstart = "";
    let dtend = "";
    let summary = "";
    let allDay = false;

    for (const line of lines) {
      if (line.startsWith("UID:")) uid = line.substring(4);
      else if (line.startsWith("DTSTART")) {
        const val = line.split(":")[1] || "";
        allDay = !line.includes("T");
        dtstart = allDay
          ? `${val.substring(0,4)}-${val.substring(4,6)}-${val.substring(6,8)}T00:00:00Z`
          : `${val.substring(0,4)}-${val.substring(4,6)}-${val.substring(6,8)}T${val.substring(9,11)}:${val.substring(11,13)}:${val.substring(13,15)}Z`;
      }
      else if (line.startsWith("DTEND")) {
        const val = line.split(":")[1] || "";
        dtend = allDay
          ? `${val.substring(0,4)}-${val.substring(4,6)}-${val.substring(6,8)}T23:59:59Z`
          : `${val.substring(0,4)}-${val.substring(4,6)}-${val.substring(6,8)}T${val.substring(9,11)}:${val.substring(11,13)}:${val.substring(13,15)}Z`;
      }
      else if (line.startsWith("SUMMARY:")) summary = line.substring(8);
    }

    if (uid && dtstart) {
      events.push({ uid, start: dtstart, end: dtend || dtstart, summary, allDay });
    }
  }

  return events;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startTime = Date.now();
  let processedCount = 0;
  let successCount = 0;
  let failedCount = 0;

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

    // Select active import feeds that are due for sync
    // Feeds with sync_frequency = 'hourly' are due if last_sync > 1 hour ago
    // Feeds with sync_frequency = 'daily' are due if last_sync > 1 day ago
    // Feeds with sync_frequency = 'manual' are only synced on demand
    const now = new Date().toISOString();
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const oneDayAgo = new Date(Date.now() - 86400000).toISOString();

    const { data: feeds, error: feedError } = await supabase
      .from("tenant_ical_feeds")
      .select("*")
      .eq("feed_type", "import")
      .eq("status", "active")
      .not("source_url", "is", null)
      .or(`and(sync_frequency.eq.hourly,last_sync_at.lt.${oneHourAgo}),and(sync_frequency.eq.daily,last_sync_at.lt.${oneDayAgo}),last_sync_at.is.null`)
      .limit(MAX_FEEDS_PER_RUN);

    if (feedError) throw new Error(`Failed to fetch feeds: ${feedError.message}`);

    if (!feeds || feeds.length === 0) {
      await logWorkerInvocation(supabase, "sync-ical-imports", true, 0, 0, 0, Date.now() - startTime);
      return new Response(JSON.stringify({ success: true, processed: 0, message: "No feeds due for sync" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const feed of feeds) {
      processedCount++;

      try {
        // Validate URL again (SSRF protection)
        const parsedUrl = new URL(feed.source_url);
        if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
          throw new Error("Invalid protocol");
        }
        if (isPrivateHost(parsedUrl.hostname)) {
          throw new Error("Private/localhost URLs are not allowed");
        }

        // Fetch the iCal feed with timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

        const response = await fetch(feed.source_url, {
          signal: controller.signal,
          headers: { "User-Agent": "OPERAN-iCal-Sync/1.0" },
        });

        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        // Check response size
        const contentLength = response.headers.get("content-length");
        if (contentLength && parseInt(contentLength) > MAX_RESPONSE_SIZE) {
          throw new Error("Response too large");
        }

        const text = await response.text();
        if (text.length > MAX_RESPONSE_SIZE) {
          throw new Error("Response too large");
        }

        // Parse iCal
        if (!text.includes("BEGIN:VCALENDAR")) {
          throw new Error("Invalid iCal format");
        }

        const events = parseIcal(text);

        // Get assigned listings for this feed
        const listingIds = feed.assigned_listing_ids || [];
        if (listingIds.length === 0) {
          // If no listings assigned, skip
          await supabase
            .from("tenant_ical_feeds")
            .update({
              last_sync_at: now,
              last_error: null,
              updated_at: now,
            })
            .eq("id", feed.id);
          successCount++;
          continue;
        }

        // Get existing external UIDs for this feed
        const { data: existingBlocks } = await supabase
          .from("listing_availability_blocks")
          .select("id, external_uid, listing_id")
          .eq("source_type", "ical_import")
          .eq("source_id", feed.id)
          .eq("status", "active")
          .in("listing_id", listingIds);

        const existingUids = new Set((existingBlocks || []).map((b: { external_uid: string }) => b.external_uid));
        const currentUids = new Set(events.map(e => e.uid));

        // Create or update blocks
        let blocksCreated = 0;
        for (const event of events) {
          for (const listingId of listingIds) {
            const { error: upsertError } = await supabase
              .from("listing_availability_blocks")
              .upsert({
                tenant_id: feed.tenant_id,
                listing_id: listingId,
                source_type: "ical_import",
                source_id: feed.id,
                external_uid: event.uid,
                external_source_url: feed.source_url,
                title: event.summary || "Imported (iCal)",
                start_at: event.start,
                end_at: event.end,
                is_all_day: event.allDay,
                status: "active",
                raw_data: { source: "ical", uid: event.uid },
              }, { onConflict: "tenant_id,listing_id,external_uid" });

            if (!upsertError) blocksCreated++;
          }
        }

        // Mark stale blocks as cancelled (exist in DB but not in feed anymore)
        const staleUids = [...existingUids].filter(uid => !currentUids.has(uid));
        if (staleUids.length > 0) {
          for (const listingId of listingIds) {
            await supabase
              .from("listing_availability_blocks")
              .update({ status: "cancelled", updated_at: now })
              .eq("source_type", "ical_import")
              .eq("source_id", feed.id)
              .eq("listing_id", listingId)
              .in("external_uid", staleUids)
              .eq("status", "active");
          }
        }

        // Update feed sync status
        await supabase
          .from("tenant_ical_feeds")
          .update({
            last_sync_at: now,
            last_error: null,
            updated_at: now,
          })
          .eq("id", feed.id);

        // Log activity
        await supabase.rpc("log_integration_activity", {
          p_tenant_id: feed.tenant_id,
          p_category: "calendar",
          p_provider: "ical",
          p_action: "import_synced",
          p_status: "success",
          p_message: `Synced ${events.length} events from ${feed.name}`,
          p_metadata: { feed_id: feed.id, events_count: events.length, blocks_created: blocksCreated, stale_removed: staleUids.length },
        });

        successCount++;
      } catch (err) {
        failedCount++;
        const errMsg = err instanceof Error ? err.message : "Unknown error";

        // Update feed with error
        await supabase
          .from("tenant_ical_feeds")
          .update({
            last_sync_at: now,
            last_error: errMsg,
            updated_at: now,
          })
          .eq("id", feed.id);

        // Log the error
        await supabase.rpc("log_integration_activity", {
          p_tenant_id: feed.tenant_id,
          p_category: "calendar",
          p_provider: "ical",
          p_action: "import_sync_failed",
          p_status: "failed",
          p_message: `Sync failed for ${feed.name}: ${errMsg}`,
          p_metadata: { feed_id: feed.id, error: errMsg },
        });
      }
    }

    const durationMs = Date.now() - startTime;
    await logWorkerInvocation(supabase, "sync-ical-imports", failedCount === 0, processedCount, successCount, failedCount, durationMs);

    return new Response(JSON.stringify({
      success: true,
      processed: processedCount,
      succeeded: successCount,
      failed: failedCount,
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
      await logWorkerInvocation(supabase, "sync-ical-imports", false, processedCount, successCount, failedCount, durationMs, errMsg);
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
  durationMs: number,
  errorMessage?: string
): Promise<void> {
  try {
    await supabase.rpc("log_worker_invocation", {
      p_worker_name: workerName,
      p_success: success,
      p_processed_count: processedCount,
      p_failed_count: failedCount,
      p_duration_ms: durationMs,
      p_error_message: errorMessage || null,
    });
  } catch {
    // Non-critical
  }
}
