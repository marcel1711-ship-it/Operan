-- Fix confirm_payment_from_webhook: two bugs
-- 1. "record IS NOT NULL" in plpgsql returns FALSE when ANY column is NULL,
--    so reservations with nullable columns (notes, cancelled_at, etc.) were
--    never detected as found. Fix: use "record.id IS NOT NULL" instead.
-- 2. Race condition: two Stripe webhooks (checkout.session.completed +
--    payment_intent.succeeded) arriving simultaneously could both process
--    the same payment. Fix: FOR UPDATE on payment and reservation rows.

CREATE OR REPLACE FUNCTION public.confirm_payment_from_webhook(
  p_provider text, p_environment text, p_provider_event_id text, p_provider_checkout_id text,
  p_provider_payment_id text DEFAULT NULL, p_provider_charge_id text DEFAULT NULL,
  p_amount numeric DEFAULT NULL, p_currency text DEFAULT NULL,
  p_payment_type text DEFAULT 'deposit', p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_payment record;
  v_reservation record;
BEGIN
  -- FOR UPDATE locks the row so concurrent webhooks serialize
  SELECT * INTO v_payment FROM payments
  WHERE provider_checkout_session_id = p_provider_checkout_id AND provider = p_provider
  ORDER BY created_at DESC LIMIT 1
  FOR UPDATE;

  IF v_payment.id IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  -- Payment already succeeded — ensure reservation is also confirmed
  IF v_payment.status = 'succeeded' THEN
    SELECT * INTO v_reservation FROM reservations
    WHERE id = v_payment.reservation_id
    FOR UPDATE;

    IF v_reservation.id IS NOT NULL AND v_reservation.booking_status != 'confirmed' THEN
      UPDATE reservations SET
        booking_status = 'confirmed',
        payment_status = CASE WHEN p_payment_type = 'full_payment' THEN 'paid' ELSE 'deposit_paid' END,
        amount_paid = coalesce(amount_paid, 0) + coalesce(p_amount, v_payment.amount),
        balance_due = greatest(0, coalesce(total_amount, 0) - coalesce(amount_paid, 0) - coalesce(p_amount, v_payment.amount)),
        deposit_amount = CASE WHEN p_payment_type = 'deposit' THEN coalesce(p_amount, v_payment.amount) ELSE deposit_amount END,
        confirmed_at = now(), expires_at = NULL, updated_at = now()
      WHERE id = v_payment.reservation_id;

      PERFORM trigger_automations_for_event(
        v_reservation.tenant_id, 'reservation.confirmed', gen_random_uuid(),
        'reservation', v_reservation.id, v_reservation.id, v_reservation.customer_id,
        jsonb_build_object(
          'payment_id', v_payment.id, 'payment_type', p_payment_type,
          'amount', coalesce(p_amount, v_payment.amount), 'provider_event_id', p_provider_event_id
        )
      );
      RETURN jsonb_build_object('status', 'confirmed_from_retry', 'payment_id', v_payment.id);
    END IF;

    RETURN jsonb_build_object('status', 'already_confirmed');
  END IF;

  -- First webhook to process: update payment to succeeded
  UPDATE payments SET
    status = 'succeeded',
    provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
    provider_charge_id = coalesce(p_provider_charge_id, provider_charge_id),
    paid_at = now(), updated_at = now()
  WHERE id = v_payment.id;

  -- Lock and update the reservation
  SELECT * INTO v_reservation FROM reservations
  WHERE id = v_payment.reservation_id
  FOR UPDATE;

  IF v_reservation.id IS NOT NULL AND v_reservation.booking_status != 'confirmed' THEN
    UPDATE reservations SET
      booking_status = 'confirmed',
      payment_status = CASE WHEN p_payment_type = 'full_payment' THEN 'paid' ELSE 'deposit_paid' END,
      amount_paid = coalesce(amount_paid, 0) + coalesce(p_amount, v_payment.amount),
      balance_due = greatest(0, coalesce(total_amount, 0) - coalesce(amount_paid, 0) - coalesce(p_amount, v_payment.amount)),
      deposit_amount = CASE WHEN p_payment_type = 'deposit' THEN coalesce(p_amount, v_payment.amount) ELSE deposit_amount END,
      confirmed_at = now(), expires_at = NULL, updated_at = now()
    WHERE id = v_payment.reservation_id;

    PERFORM trigger_automations_for_event(
      v_reservation.tenant_id, 'reservation.confirmed', gen_random_uuid(),
      'reservation', v_reservation.id, v_reservation.id, v_reservation.customer_id,
      jsonb_build_object(
        'payment_id', v_payment.id, 'payment_type', p_payment_type,
        'amount', coalesce(p_amount, v_payment.amount), 'provider_event_id', p_provider_event_id
      )
    );
  END IF;

  RETURN jsonb_build_object('status', 'confirmed', 'payment_id', v_payment.id);
END;
$function$;
