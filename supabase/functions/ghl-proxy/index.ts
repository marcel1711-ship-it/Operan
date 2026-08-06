const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  if (action === 'listings') {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'MISSING_URL';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 'MISSING_KEY';

    try {
      const { createClient } = await import('npm:@supabase/supabase-js@2');
      const supabase = createClient(supabaseUrl, serviceKey);

      const { data, error } = await supabase
        .from('listings')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      return new Response(JSON.stringify(data || []), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return new Response(
        JSON.stringify({ error: message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
  }

  if (action === 'pipeline') {
    const pipelineId = url.searchParams.get('pipeline_id');
    const accessToken = Deno.env.get('GHL_ACCESS_TOKEN');

    if (!pipelineId) {
      return new Response(
        JSON.stringify({ error: 'pipeline_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (accessToken) {
      try {
        const res = await fetch(
          `${GHL_API_BASE}/opportunities/pipelines/${pipelineId}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/json',
              Version: '2021-07-28',
            },
          },
        );
        if (res.ok) {
          const data = await res.json();
          return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } catch {
        // fall through to fallback
      }
    }

    // Fallback with known pipeline stages
    const fallbackStages = [
      { id: 'stage-new-booking', name: 'New Booking', order: 0, pipelineId },
      { id: 'stage-captain-review', name: 'Captain Review', order: 1, pipelineId },
      { id: 'stage-charter-in-progress', name: 'Charter in Progress', order: 2, pipelineId },
      { id: 'stage-charter-complete', name: 'Charter Complete', order: 3, pipelineId },
      { id: 'stage-cancelled', name: 'Cancelled', order: 4, pipelineId },
    ];
    return new Response(
      JSON.stringify({
        id: pipelineId,
        name: 'BBR Boat Rentals',
        stages: fallbackStages,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  return new Response(
    JSON.stringify({ error: 'Unknown action: ' + action }),
    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
