-- Forward-only payment reconciliation hardening for databases that have
-- already applied the virtual-account lifecycle migration.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS provider_payload JSONB,
  ADD COLUMN IF NOT EXISTS reconciliation_required_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconciliation_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_payments_reconciliation_required
  ON public.payments (reconciliation_required_at DESC)
  WHERE provider_status = 'paid_reconciliation_required';

-- The return callback must not decide whether a VBank attempt exists from
-- browser-returned metadata. This function is intentionally service-only.
CREATE OR REPLACE FUNCTION public.get_virtual_account_checkout_state(
  p_registration_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_registration public.workshop_registrations_v2%ROWTYPE;
  v_intent public.virtual_account_checkout_intents%ROWTYPE;
  v_payment public.payments%ROWTYPE;
BEGIN
  IF p_registration_id IS NULL THEN
    RAISE EXCEPTION 'Registration is required.';
  END IF;

  SELECT *
  INTO v_registration
  FROM public.workshop_registrations_v2
  WHERE id = p_registration_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration not found.';
  END IF;

  SELECT *
  INTO v_intent
  FROM public.virtual_account_checkout_intents
  WHERE registration_id = p_registration_id
  FOR UPDATE;

  IF FOUND
    AND v_registration.status IS NOT DISTINCT FROM 'pending'
    AND v_registration.expires_at IS NOT NULL
    AND v_registration.expires_at > NOW()
    AND v_intent.expires_at > NOW() THEN
    RETURN jsonb_build_object('state', 'active_intent', 'attempt_id', v_intent.attempt_id);
  END IF;

  SELECT *
  INTO v_payment
  FROM public.payments
  WHERE registration_id = p_registration_id
    AND order_id IS NOT DISTINCT FROM v_registration.order_id
    AND amount IS NOT DISTINCT FROM v_registration.amount
    AND payment_method IS NOT DISTINCT FROM '가상계좌'
    AND status IS NOT DISTINCT FROM 'pending'
    AND provider_status IS NOT DISTINCT FROM 'ready'
    AND expires_at IS NOT NULL
    AND expires_at > NOW()
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'state', 'ready_ledger',
      'attempt_id', v_payment.checkout_attempt_id,
      'tid', v_payment.payment_key
    );
  END IF;

  RETURN jsonb_build_object('state', 'none');
END;
$$;

-- Card/easy approval uses structured terminal results. Exceptions mean that
-- the database result is unknown, so callers must leave the provider payment
-- untouched for signed webhook reconciliation.
CREATE OR REPLACE FUNCTION public.reconcile_payment_registration(
  p_registration_id UUID,
  p_payment_key TEXT,
  p_order_id TEXT,
  p_amount INTEGER,
  p_payment_method TEXT,
  p_provider_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_registration public.workshop_registrations_v2%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_intent public.virtual_account_checkout_intents%ROWTYPE;
  v_capacity INTEGER;
  v_schedule_capacities JSONB := '{}'::jsonb;
  v_schedule_capacity_text TEXT;
  v_schedule_capacity INTEGER;
  v_effective_capacity INTEGER;
  v_current_count INTEGER;
  v_method TEXT;
  v_terminal_reason TEXT;
BEGIN
  IF p_registration_id IS NULL
    OR NULLIF(BTRIM(p_payment_key), '') IS NULL
    OR NULLIF(BTRIM(p_order_id), '') IS NULL
    OR p_amount IS NULL
    OR NULLIF(BTRIM(p_payment_method), '') IS NULL THEN
    RAISE EXCEPTION 'Registration, payment key, order ID, amount, and method are required.';
  END IF;

  v_method := NULLIF(BTRIM(p_payment_method), '');

  SELECT *
  INTO v_registration
  FROM public.workshop_registrations_v2
  WHERE id = p_registration_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration not found.';
  END IF;

  IF v_registration.order_id IS DISTINCT FROM p_order_id
    OR v_registration.amount IS DISTINCT FROM p_amount THEN
    RAISE EXCEPTION 'Payment identity does not match the registration.';
  END IF;

  -- A signed card callback cannot bypass a still-active server-side VBank
  -- checkout merely because the browser returned a different method marker.
  SELECT *
  INTO v_intent
  FROM public.virtual_account_checkout_intents
  WHERE registration_id = p_registration_id
  FOR UPDATE;

  IF FOUND
    AND v_registration.status IS NOT DISTINCT FROM 'pending'
    AND v_registration.expires_at IS NOT NULL
    AND v_registration.expires_at > NOW()
    AND v_intent.expires_at > NOW() THEN
    RETURN jsonb_build_object(
      'outcome', 'reconciliation_required',
      'reason', 'active_vbank_checkout_intent',
      'payment_recorded', false
    );
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(BTRIM(p_payment_key), 0));

  SELECT *
  INTO v_payment
  FROM public.payments
  WHERE payment_key = p_payment_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_payment.registration_id IS NOT DISTINCT FROM p_registration_id
      AND v_payment.order_id IS NOT DISTINCT FROM p_order_id
      AND v_payment.amount IS NOT DISTINCT FROM p_amount
      AND v_payment.payment_method IS NOT DISTINCT FROM v_method
      AND v_payment.status IS NOT DISTINCT FROM 'success'
      AND v_registration.status IS NOT DISTINCT FROM 'confirmed' THEN
      RETURN jsonb_build_object('outcome', 'confirmed', 'idempotent', true);
    END IF;

    RETURN jsonb_build_object(
      'outcome', 'reconciliation_required',
      'reason', 'payment_identity_conflict',
      'payment_recorded', false
    );
  END IF;

  IF v_registration.status IS NOT DISTINCT FROM 'confirmed' THEN
    RETURN jsonb_build_object(
      'outcome', 'reconciliation_required',
      'reason', 'registration_already_confirmed',
      'payment_recorded', false
    );
  END IF;

  IF v_registration.status IS DISTINCT FROM 'pending'
    OR v_registration.expires_at IS NULL
    OR v_registration.expires_at <= NOW() THEN
    v_terminal_reason := CASE
      WHEN v_registration.expires_at IS NULL OR v_registration.expires_at <= NOW() THEN 'registration_expired'
      ELSE 'registration_not_pending'
    END;

    INSERT INTO public.payments (
      registration_id, amount, payment_method, payment_key, order_id, status,
      provider_status, paid_at, provider_payload, reconciliation_required_at,
      reconciliation_reason
    ) VALUES (
      p_registration_id, p_amount, v_method, p_payment_key, p_order_id, 'failed',
      'paid_reconciliation_required', NOW(), p_provider_payload, NOW(), v_terminal_reason
    );

    UPDATE public.workshop_registrations_v2
    SET status = 'cancelled'
    WHERE id = p_registration_id
      AND status IS NOT DISTINCT FROM 'pending';

    RETURN jsonb_build_object(
      'outcome', 'reconciliation_required',
      'reason', v_terminal_reason,
      'payment_recorded', true
    );
  END IF;

  SELECT capacity, COALESCE(schedule_capacities, '{}'::jsonb)
  INTO v_capacity, v_schedule_capacities
  FROM public.workshops
  WHERE id = v_registration.workshop_id
  FOR UPDATE;

  IF NOT FOUND OR v_capacity IS NULL OR v_capacity < 1 THEN
    RAISE EXCEPTION 'Workshop capacity is not configured.';
  END IF;

  IF v_registration.schedule_key IS NOT NULL AND v_schedule_capacities ? v_registration.schedule_key THEN
    v_schedule_capacity_text := NULLIF(v_schedule_capacities ->> v_registration.schedule_key, '');
    IF v_schedule_capacity_text ~ '^[0-9]+$' THEN
      v_schedule_capacity := v_schedule_capacity_text::integer;
    END IF;
  END IF;

  v_effective_capacity := CASE
    WHEN v_schedule_capacity IS NOT NULL AND v_schedule_capacity > 0 THEN v_schedule_capacity
    ELSE v_capacity
  END;

  SELECT count(*)
  INTO v_current_count
  FROM public.workshop_registrations_v2
  WHERE workshop_id = v_registration.workshop_id
    AND (status = 'confirmed' OR (status = 'pending' AND expires_at > NOW()))
    AND (v_schedule_capacity IS NULL OR schedule_key = v_registration.schedule_key);

  IF v_current_count > v_effective_capacity THEN
    INSERT INTO public.payments (
      registration_id, amount, payment_method, payment_key, order_id, status,
      provider_status, paid_at, provider_payload, reconciliation_required_at,
      reconciliation_reason
    ) VALUES (
      p_registration_id, p_amount, v_method, p_payment_key, p_order_id, 'failed',
      'paid_reconciliation_required', NOW(), p_provider_payload, NOW(), 'capacity_full'
    );

    UPDATE public.workshop_registrations_v2
    SET status = 'cancelled'
    WHERE id = p_registration_id
      AND status IS NOT DISTINCT FROM 'pending';

    RETURN jsonb_build_object(
      'outcome', 'reconciliation_required',
      'reason', 'capacity_full',
      'payment_recorded', true
    );
  END IF;

  INSERT INTO public.payments (
    registration_id, amount, payment_method, payment_key, order_id, status,
    provider_status, paid_at, provider_payload
  ) VALUES (
    p_registration_id, p_amount, v_method, p_payment_key, p_order_id, 'success',
    'paid', NOW(), p_provider_payload
  );

  UPDATE public.workshop_registrations_v2
  SET status = 'confirmed'
  WHERE id = p_registration_id
    AND status IS NOT DISTINCT FROM 'pending';

  RETURN jsonb_build_object('outcome', 'confirmed', 'idempotent', false);
END;
$$;

-- Preserve the historical Boolean RPC for rollback callers, while all active
-- NICEPAY routes consume the explicit reconciliation contract above.
CREATE OR REPLACE FUNCTION public.confirm_payment_registration(
  p_registration_id UUID,
  p_payment_key TEXT,
  p_order_id TEXT,
  p_amount INTEGER,
  p_payment_method TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  v_result := public.reconcile_payment_registration(
    p_registration_id, p_payment_key, p_order_id, p_amount, p_payment_method, NULL
  );
  RETURN v_result ->> 'outcome' = 'confirmed';
END;
$$;

-- A paid VBank notification remains evidence even if the reservation expired
-- or its released seat was reused. It is not silently relabelled as provider
-- failure, and no capacity is consumed in this terminal path.
CREATE OR REPLACE FUNCTION public.reconcile_virtual_account_deposit(
  p_registration_id UUID,
  p_tid TEXT,
  p_order_id TEXT,
  p_amount INTEGER,
  p_provider_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_registration public.workshop_registrations_v2%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_capacity INTEGER;
  v_schedule_capacities JSONB := '{}'::jsonb;
  v_schedule_capacity_text TEXT;
  v_schedule_capacity INTEGER;
  v_effective_capacity INTEGER;
  v_current_count INTEGER;
  v_reason TEXT;
BEGIN
  IF p_registration_id IS NULL
    OR NULLIF(BTRIM(p_tid), '') IS NULL
    OR NULLIF(BTRIM(p_order_id), '') IS NULL
    OR p_amount IS NULL THEN
    RAISE EXCEPTION 'Registration, NICEPAY TID, order ID, and amount are required.';
  END IF;

  SELECT *
  INTO v_registration
  FROM public.workshop_registrations_v2
  WHERE id = p_registration_id
  FOR UPDATE;

  IF NOT FOUND OR v_registration.order_id IS DISTINCT FROM p_order_id
    OR v_registration.amount IS DISTINCT FROM p_amount THEN
    RAISE EXCEPTION 'Virtual-account payment identity does not match the registration.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(BTRIM(p_tid), 0));

  SELECT *
  INTO v_payment
  FROM public.payments
  WHERE registration_id = p_registration_id
    AND payment_key = p_tid
  FOR UPDATE;

  IF NOT FOUND
    OR v_payment.order_id IS DISTINCT FROM p_order_id
    OR v_payment.amount IS DISTINCT FROM p_amount
    OR v_payment.payment_method IS DISTINCT FROM '가상계좌' THEN
    RAISE EXCEPTION 'Virtual-account payment ledger is not available.';
  END IF;

  IF v_registration.status IS NOT DISTINCT FROM 'confirmed'
    AND v_payment.status IS NOT DISTINCT FROM 'success'
    AND v_payment.provider_status IS NOT DISTINCT FROM 'paid' THEN
    RETURN jsonb_build_object('outcome', 'confirmed', 'idempotent', true);
  END IF;

  IF v_payment.provider_status IS NOT DISTINCT FROM 'paid_reconciliation_required' THEN
    RETURN jsonb_build_object(
      'outcome', 'reconciliation_required',
      'reason', COALESCE(v_payment.reconciliation_reason, 'manual_reconciliation_required'),
      'idempotent', true
    );
  END IF;

  IF v_payment.status IS DISTINCT FROM 'pending'
    OR v_payment.provider_status IS DISTINCT FROM 'ready' THEN
    v_reason := CASE
      WHEN v_payment.expires_at IS NULL OR v_payment.expires_at <= NOW() THEN 'expired'
      ELSE 'payment_not_ready'
    END;

    UPDATE public.payments
    SET status = 'failed',
        provider_status = 'paid_reconciliation_required',
        paid_at = COALESCE(v_payment.paid_at, NOW()),
        provider_payload = COALESCE(v_payment.provider_payload, p_provider_payload),
        reconciliation_required_at = COALESCE(v_payment.reconciliation_required_at, NOW()),
        reconciliation_reason = COALESCE(v_payment.reconciliation_reason, v_reason)
    WHERE id = v_payment.id;

    UPDATE public.workshop_registrations_v2
    SET status = 'cancelled'
    WHERE id = p_registration_id
      AND status IS NOT DISTINCT FROM 'pending';

    RETURN jsonb_build_object('outcome', 'reconciliation_required', 'reason', v_reason);
  END IF;

  IF v_registration.status IS DISTINCT FROM 'pending'
    OR v_registration.expires_at IS NULL
    OR v_registration.expires_at <= NOW()
    OR v_payment.expires_at IS NULL
    OR v_payment.expires_at <= NOW() THEN
    v_reason := CASE
      WHEN v_registration.expires_at IS NULL OR v_registration.expires_at <= NOW()
        OR v_payment.expires_at IS NULL OR v_payment.expires_at <= NOW() THEN 'expired'
      ELSE 'registration_not_pending'
    END;
  ELSE
    SELECT capacity, COALESCE(schedule_capacities, '{}'::jsonb)
    INTO v_capacity, v_schedule_capacities
    FROM public.workshops
    WHERE id = v_registration.workshop_id
    FOR UPDATE;

    IF NOT FOUND OR v_capacity IS NULL OR v_capacity < 1 THEN
      RAISE EXCEPTION 'Workshop capacity is not configured.';
    END IF;

    IF v_registration.schedule_key IS NOT NULL AND v_schedule_capacities ? v_registration.schedule_key THEN
      v_schedule_capacity_text := NULLIF(v_schedule_capacities ->> v_registration.schedule_key, '');
      IF v_schedule_capacity_text ~ '^[0-9]+$' THEN
        v_schedule_capacity := v_schedule_capacity_text::integer;
      END IF;
    END IF;

    v_effective_capacity := CASE
      WHEN v_schedule_capacity IS NOT NULL AND v_schedule_capacity > 0 THEN v_schedule_capacity
      ELSE v_capacity
    END;

    SELECT count(*)
    INTO v_current_count
    FROM public.workshop_registrations_v2
    WHERE workshop_id = v_registration.workshop_id
      AND (status = 'confirmed' OR (status = 'pending' AND expires_at > NOW()))
      AND (v_schedule_capacity IS NULL OR schedule_key = v_registration.schedule_key);

    IF v_current_count > v_effective_capacity THEN
      v_reason := 'capacity_full';
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    UPDATE public.payments
    SET status = 'failed',
        provider_status = 'paid_reconciliation_required',
        paid_at = COALESCE(v_payment.paid_at, NOW()),
        provider_payload = COALESCE(v_payment.provider_payload, p_provider_payload),
        reconciliation_required_at = COALESCE(v_payment.reconciliation_required_at, NOW()),
        reconciliation_reason = COALESCE(v_payment.reconciliation_reason, v_reason)
    WHERE id = v_payment.id;

    UPDATE public.workshop_registrations_v2
    SET status = 'cancelled'
    WHERE id = p_registration_id
      AND status IS NOT DISTINCT FROM 'pending';

    RETURN jsonb_build_object('outcome', 'reconciliation_required', 'reason', v_reason);
  END IF;

  UPDATE public.payments
  SET status = 'success',
      provider_status = 'paid',
      paid_at = COALESCE(v_payment.paid_at, NOW()),
      provider_payload = COALESCE(v_payment.provider_payload, p_provider_payload)
  WHERE id = v_payment.id
    AND status IS NOT DISTINCT FROM 'pending'
    AND provider_status IS NOT DISTINCT FROM 'ready';

  UPDATE public.workshop_registrations_v2
  SET status = 'confirmed'
  WHERE id = p_registration_id
    AND status IS NOT DISTINCT FROM 'pending';

  RETURN jsonb_build_object('outcome', 'confirmed', 'idempotent', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_virtual_account_deposit(
  p_registration_id UUID,
  p_tid TEXT,
  p_order_id TEXT,
  p_amount INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  v_result := public.reconcile_virtual_account_deposit(
    p_registration_id, p_tid, p_order_id, p_amount, NULL
  );
  RETURN v_result ->> 'outcome' = 'confirmed';
END;
$$;

REVOKE ALL ON FUNCTION public.get_virtual_account_checkout_state(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_virtual_account_checkout_state(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.get_virtual_account_checkout_state(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_virtual_account_checkout_state(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.reconcile_payment_registration(UUID, TEXT, TEXT, INTEGER, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_payment_registration(UUID, TEXT, TEXT, INTEGER, TEXT, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_payment_registration(UUID, TEXT, TEXT, INTEGER, TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_payment_registration(UUID, TEXT, TEXT, INTEGER, TEXT, JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.reconcile_virtual_account_deposit(UUID, TEXT, TEXT, INTEGER, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_virtual_account_deposit(UUID, TEXT, TEXT, INTEGER, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_virtual_account_deposit(UUID, TEXT, TEXT, INTEGER, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_virtual_account_deposit(UUID, TEXT, TEXT, INTEGER, JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.confirm_payment_registration(UUID, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_payment_registration(UUID, TEXT, TEXT, INTEGER, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_payment_registration(UUID, TEXT, TEXT, INTEGER, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.confirm_virtual_account_deposit(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_virtual_account_deposit(UUID, TEXT, TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.confirm_virtual_account_deposit(UUID, TEXT, TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_virtual_account_deposit(UUID, TEXT, TEXT, INTEGER) TO service_role;
