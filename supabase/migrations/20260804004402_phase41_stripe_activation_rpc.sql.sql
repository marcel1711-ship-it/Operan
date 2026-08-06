-- RPC for Super Admin Stripe activation status
CREATE OR REPLACE FUNCTION public.get_stripe_activation_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_app_url text;
  v_webhook_url text;
  v_secret_configured boolean := false;
  v_webhook_secret_configured boolean := false;
  v_app_url_configured boolean := false;
  v_outbox_deployed boolean := false;
  v_adapter_active boolean := true; -- adapter is code-level, always active if code deployed
BEGIN
  -- Check if Stripe secrets are configured (via platform_integrations or environment)
  -- We can't directly read env vars from SQL, but we can check if any tenant has a connected Stripe integration
  SELECT EXISTS(
    SELECT 1 FROM platform_integrations
    WHERE category = 'payments' AND provider = 'stripe' AND connection_status = 'connected'
  ) INTO v_secret_configured;

  -- Check webhook secret: if webhook_events table has any stripe entries, it's been receiving
  SELECT EXISTS(
    SELECT 1 FROM webhook_events WHERE provider = 'stripe' LIMIT 1
  ) INTO v_webhook_secret_configured;

  -- App URL: check if any tenant has a custom domain or if tenants table has slug-based URLs
  SELECT COALESCE(
    (SELECT value FROM platform_settings WHERE key = 'app_url' LIMIT 1),
    ''
  ) INTO v_app_url;

  v_app_url_configured := v_app_url IS NOT NULL AND v_app_url != '';
  v_webhook_url := CASE WHEN v_app_url != '' THEN v_app_url || '/api/stripe-webhook' ELSE '' END;

  -- Check if outbox function has processed anything (proxy for deployed)
  SELECT EXISTS(
    SELECT 1 FROM event_outbox WHERE status IN ('completed', 'processing', 'dead_letter') LIMIT 1
  ) INTO v_outbox_deployed;

  v_result := jsonb_build_object(
    'stripe_secret_configured', v_secret_configured,
    'stripe_webhook_secret_configured', v_webhook_secret_configured,
    'app_url_configured', v_app_url_configured,
    'app_url', v_app_url,
    'webhook_endpoint_url', v_webhook_url,
    'environment', 'test',
    'outbox_function_deployed', v_outbox_deployed,
    'outbox_scheduler_configured', v_outbox_deployed,
    'stripe_adapter_active', v_adapter_active,
    'test_mode_ready', v_secret_configured AND v_webhook_secret_configured AND v_app_url_configured
  );

  RETURN v_result;
END;
$$;

-- Only super_admin can call this
REVOKE EXECUTE ON FUNCTION public.get_stripe_activation_status() FROM PUBLIC, anon, authenticated;
