-- Fix check_provider_readiness to match by provider name, not just capabilities flag
CREATE OR REPLACE FUNCTION public.check_provider_readiness(
  p_tenant_id uuid,
  p_channel text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_integration RECORD;
  v_provider_names text[];
BEGIN
  IF p_channel = 'email' THEN
    v_provider_names := ARRAY['resend'];
  ELSIF p_channel = 'sms' THEN
    v_provider_names := ARRAY['twilio', 'twilio_sms'];
  ELSIF p_channel = 'whatsapp' THEN
    v_provider_names := ARRAY['twilio_whatsapp', 'whatsapp'];
  ELSE
    v_provider_names := ARRAY[]::text[];
  END IF;

  SELECT * INTO v_integration FROM tenant_integrations
  WHERE tenant_id = p_tenant_id
    AND category = 'communication'
    AND enabled = true
    AND connection_status = 'connected'
    AND (
      (capabilities->>p_channel) = 'true'
      OR provider = ANY(v_provider_names)
    )
  ORDER BY is_default DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ready', false,
      'reason', 'No connected integration found for channel: ' || p_channel
    );
  END IF;

  RETURN jsonb_build_object(
    'ready', true,
    'integration_id', v_integration.id,
    'provider', v_integration.provider
  );
END;
$function$;
