/*
# Phase 2.5 — Dashboard Metrics Aggregate RPC

## Overview
Creates a SECURITY DEFINER function that returns all dashboard metrics
in a single database call, replacing the client-side approach of fetching
all reservations and computing in JavaScript.

## Function: get_dashboard_metrics(p_tenant_id)

### Returns
JSONB with:
- charters_this_week: count
- charters_this_month: count
- revenue_this_week: numeric
- revenue_this_month: numeric
- in_progress_count: count (this week)
- completed_this_month: count
- pipeline_stage_counts: array of {stage_id, stage_name, count, total_value}
- upcoming_charters: array of next 10 reservations with start_at > now
- total_opportunities: count
- total_customers: count
- total_reservations: count

### Security
- SECURITY DEFINER with search_path = public
- Tenant isolation via current_tenant_id() or explicit p_tenant_id
*/

CREATE OR REPLACE FUNCTION get_dashboard_metrics(
  p_tenant_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_now timestamptz := now();
  v_week_start timestamptz;
  v_week_end timestamptz;
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_charters_week int;
  v_charters_month int;
  v_revenue_week numeric;
  v_revenue_month numeric;
  v_in_progress int;
  v_completed_month int;
  v_total_opps int;
  v_total_customers int;
  v_total_reservations int;
  v_stage_counts jsonb;
  v_upcoming jsonb;
BEGIN
  -- Resolve tenant
  IF p_tenant_id IS NOT NULL THEN
    v_tenant_id := p_tenant_id;
  ELSE
    v_tenant_id := current_tenant_id();
  END IF;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unable to determine tenant');
  END IF;

  -- Calculate date ranges
  v_week_start := date_trunc('week', v_now);
  v_week_end := v_week_start + interval '7 days';
  v_month_start := date_trunc('month', v_now);
  v_month_end := v_month_start + interval '1 month';

  -- Aggregate metrics from reservations
  SELECT
    COUNT(*) FILTER (WHERE COALESCE(start_at, charter_date) >= v_week_start AND COALESCE(start_at, charter_date) < v_week_end),
    COUNT(*) FILTER (WHERE COALESCE(start_at, charter_date) >= v_month_start AND COALESCE(start_at, charter_date) < v_month_end),
    COALESCE(SUM(total_amount) FILTER (WHERE COALESCE(start_at, charter_date) >= v_week_start AND COALESCE(start_at, charter_date) < v_week_end), 0),
    COALESCE(SUM(total_amount) FILTER (WHERE COALESCE(start_at, charter_date) >= v_month_start AND COALESCE(start_at, charter_date) < v_month_end), 0),
    COUNT(*) FILTER (WHERE booking_status = 'in_progress' AND COALESCE(start_at, charter_date) >= v_week_start AND COALESCE(start_at, charter_date) < v_week_end),
    COUNT(*) FILTER (WHERE booking_status = 'completed' AND COALESCE(start_at, charter_date) >= v_month_start AND COALESCE(start_at, charter_date) < v_month_end)
  INTO v_charters_week, v_charters_month, v_revenue_week, v_revenue_month, v_in_progress, v_completed_month
  FROM reservations
  WHERE tenant_id = v_tenant_id;

  -- Total counts
  SELECT COUNT(*) INTO v_total_opps FROM opportunities WHERE tenant_id = v_tenant_id;
  SELECT COUNT(*) INTO v_total_customers FROM customers WHERE tenant_id = v_tenant_id;
  SELECT COUNT(*) INTO v_total_reservations FROM reservations WHERE tenant_id = v_tenant_id;

  -- Pipeline stage counts
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'stage_id', ps.id,
    'stage_name', ps.name,
    'count', opp_count.cnt,
    'total_value', opp_count.val
  )), '[]'::jsonb) INTO v_stage_counts
  FROM pipeline_stages ps
  LEFT JOIN LATERAL (
    SELECT COUNT(*) as cnt, COALESCE(SUM(monetary_value), 0) as val
    FROM opportunities o
    WHERE o.stage_id = ps.id AND o.tenant_id = v_tenant_id
  ) opp_count ON true
  WHERE ps.tenant_id = v_tenant_id
    AND ps.is_active = true
    AND ps.archived_at IS NULL
  ORDER BY ps.stage_order;

  -- Upcoming charters (next 10)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'booking_reference', r.booking_reference,
    'client_name', r.client_name,
    'vessel', COALESCE(r.vessel, r.title),
    'start_at', r.start_at,
    'end_at', r.end_at,
    'booking_status', r.booking_status,
    'total_amount', r.total_amount
  )), '[]'::jsonb) INTO v_upcoming
  FROM reservations r
  WHERE r.tenant_id = v_tenant_id
    AND COALESCE(r.start_at, r.charter_date) > v_now
    AND r.booking_status NOT IN ('cancelled', 'expired', 'no_show')
  ORDER BY COALESCE(r.start_at, r.charter_date) ASC
  LIMIT 10;

  RETURN jsonb_build_object(
    'charters_this_week', v_charters_week,
    'charters_this_month', v_charters_month,
    'revenue_this_week', v_revenue_week,
    'revenue_this_month', v_revenue_month,
    'in_progress_count', v_in_progress,
    'completed_this_month', v_completed_month,
    'total_opportunities', v_total_opps,
    'total_customers', v_total_customers,
    'total_reservations', v_total_reservations,
    'pipeline_stage_counts', v_stage_counts,
    'upcoming_charters', v_upcoming
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_dashboard_metrics TO authenticated;
