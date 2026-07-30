-- Track NICEPAY virtual-account issuance separately from historical card payments.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS provider_status TEXT,
  ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checkout_attempt_id UUID,
  ADD COLUMN IF NOT EXISTS vbank_code TEXT,
  ADD COLUMN IF NOT EXISTS vbank_name TEXT,
  ADD COLUMN IF NOT EXISTS vbank_number TEXT,
  ADD COLUMN IF NOT EXISTS vbank_holder TEXT;

CREATE INDEX IF NOT EXISTS idx_payments_registration_status_provider_status
  ON public.payments (registration_id, status, provider_status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_checkout_attempt_id
  ON public.payments (checkout_attempt_id)
  WHERE checkout_attempt_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.virtual_account_checkout_intents (
  registration_id UUID PRIMARY KEY
    REFERENCES public.workshop_registrations_v2(id) ON DELETE CASCADE,
  attempt_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.virtual_account_checkout_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.virtual_account_checkout_intents FROM PUBLIC;
REVOKE ALL ON TABLE public.virtual_account_checkout_intents FROM anon;
REVOKE ALL ON TABLE public.virtual_account_checkout_intents FROM authenticated;
GRANT ALL ON TABLE public.virtual_account_checkout_intents TO service_role;

CREATE OR REPLACE FUNCTION public.begin_virtual_account_checkout(
  p_registration_id UUID,
  p_user_id UUID,
  p_expires_at TIMESTAMPTZ
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
  v_attempt_id UUID;
BEGIN
  IF p_registration_id IS NULL OR p_user_id IS NULL OR p_expires_at IS NULL OR p_expires_at <= NOW() THEN
    RAISE EXCEPTION 'A registration owner and future virtual-account expiry are required.';
  END IF;

  SELECT *
  INTO v_registration
  FROM public.workshop_registrations_v2
  WHERE id = p_registration_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration not found.';
  END IF;

  IF v_registration.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Registration does not belong to the supplied user.';
  END IF;

  IF v_registration.status IS DISTINCT FROM 'pending' OR v_registration.expires_at IS NULL OR v_registration.expires_at <= NOW() THEN
    RAISE EXCEPTION 'Registration is not an unexpired pending registration.';
  END IF;

  SELECT *
  INTO v_intent
  FROM public.virtual_account_checkout_intents
  WHERE registration_id = p_registration_id
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object('status', 'intent_exists');
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
    RETURN jsonb_build_object('status', 'active_payment_exists');
  END IF;

  v_attempt_id := gen_random_uuid();

  UPDATE public.workshop_registrations_v2
  SET expires_at = p_expires_at
  WHERE id = p_registration_id;

  INSERT INTO public.virtual_account_checkout_intents (
    registration_id,
    attempt_id,
    user_id,
    expires_at
  ) VALUES (
    p_registration_id,
    v_attempt_id,
    p_user_id,
    p_expires_at
  );

  RETURN jsonb_build_object('status', 'started', 'attempt_id', v_attempt_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_virtual_account_issuance(
  p_registration_id UUID,
  p_attempt_id UUID,
  p_tid TEXT,
  p_order_id TEXT,
  p_amount INTEGER,
  p_vbank_code TEXT,
  p_vbank_name TEXT,
  p_vbank_number TEXT,
  p_vbank_holder TEXT,
  p_payment_method TEXT,
  p_provider_status TEXT,
  p_expires_at TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_registration public.workshop_registrations_v2%ROWTYPE;
  v_intent public.virtual_account_checkout_intents%ROWTYPE;
  v_tid_payment public.payments%ROWTYPE;
  v_registration_payment public.payments%ROWTYPE;
BEGIN
  IF p_registration_id IS NULL
    OR p_attempt_id IS NULL
    OR NULLIF(BTRIM(p_tid), '') IS NULL
    OR NULLIF(BTRIM(p_order_id), '') IS NULL
    OR p_amount IS NULL
    OR NULLIF(BTRIM(p_vbank_code), '') IS NULL
    OR NULLIF(BTRIM(p_vbank_name), '') IS NULL
    OR NULLIF(BTRIM(p_vbank_number), '') IS NULL
    OR NULLIF(BTRIM(p_vbank_holder), '') IS NULL
    OR p_payment_method IS DISTINCT FROM '가상계좌'
    OR p_provider_status IS DISTINCT FROM 'ready'
    OR p_expires_at IS NULL
    OR p_expires_at <= NOW() THEN
    RAISE EXCEPTION 'Complete virtual-account issuance data and a future expiry are required.';
  END IF;

  SELECT *
  INTO v_registration
  FROM public.workshop_registrations_v2
  WHERE id = p_registration_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration not found.';
  END IF;

  IF v_registration.status IS DISTINCT FROM 'pending' OR v_registration.expires_at IS NULL OR v_registration.expires_at <= NOW() THEN
    RAISE EXCEPTION 'Registration is not an unexpired pending registration.';
  END IF;

  IF v_registration.order_id IS DISTINCT FROM p_order_id THEN
    RAISE EXCEPTION 'Order ID mismatch.';
  END IF;

  IF v_registration.amount IS DISTINCT FROM p_amount THEN
    RAISE EXCEPTION 'Payment amount mismatch. Expected: %, Got: %', v_registration.amount, p_amount;
  END IF;

  SELECT *
  INTO v_tid_payment
  FROM public.payments
  WHERE payment_key = p_tid
  FOR UPDATE;

  IF FOUND THEN
    IF v_tid_payment.registration_id IS DISTINCT FROM p_registration_id THEN
      RAISE EXCEPTION 'NICEPAY TID is already registered to another registration.';
    END IF;

    IF v_tid_payment.order_id IS DISTINCT FROM p_order_id OR v_tid_payment.amount IS DISTINCT FROM p_amount THEN
      RAISE EXCEPTION 'NICEPAY TID does not match the registration order or amount.';
    END IF;

    IF v_tid_payment.payment_method IS DISTINCT FROM '가상계좌' THEN
      RAISE EXCEPTION 'NICEPAY TID is not a virtual-account payment.';
    END IF;

    IF v_tid_payment.checkout_attempt_id IS DISTINCT FROM p_attempt_id THEN
      RAISE EXCEPTION 'NICEPAY TID does not match the checkout attempt.';
    END IF;

    RETURN TRUE;
  END IF;

  SELECT *
  INTO v_intent
  FROM public.virtual_account_checkout_intents
  WHERE registration_id = p_registration_id
    AND attempt_id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Virtual-account checkout intent not found.';
  END IF;

  IF v_intent.user_id IS DISTINCT FROM v_registration.user_id
    OR v_intent.expires_at IS NULL
    OR v_intent.expires_at <= NOW() THEN
    RAISE EXCEPTION 'Virtual-account checkout intent is invalid or expired.';
  END IF;

  SELECT *
  INTO v_registration_payment
  FROM public.payments
  WHERE registration_id = p_registration_id
  FOR UPDATE;

  IF FOUND THEN
    RAISE EXCEPTION 'Registration already has a payment with a different NICEPAY TID.';
  END IF;

  BEGIN
    INSERT INTO public.payments (
      registration_id,
      checkout_attempt_id,
      amount,
      payment_method,
      payment_key,
      order_id,
      status,
      provider_status,
      issued_at,
      expires_at,
      vbank_code,
      vbank_name,
      vbank_number,
      vbank_holder
    ) VALUES (
      p_registration_id,
      p_attempt_id,
      p_amount,
      '가상계좌',
      p_tid,
      p_order_id,
      'pending',
      'ready',
      NOW(),
      p_expires_at,
      BTRIM(p_vbank_code),
      BTRIM(p_vbank_name),
      BTRIM(p_vbank_number),
      BTRIM(p_vbank_holder)
    );
  EXCEPTION WHEN unique_violation THEN
    SELECT *
    INTO v_tid_payment
    FROM public.payments
    WHERE payment_key = p_tid
    FOR UPDATE;

    IF FOUND AND v_tid_payment.registration_id IS NOT DISTINCT FROM p_registration_id
      AND v_tid_payment.order_id IS NOT DISTINCT FROM p_order_id
      AND v_tid_payment.amount IS NOT DISTINCT FROM p_amount
      AND v_tid_payment.payment_method IS NOT DISTINCT FROM '가상계좌'
      AND v_tid_payment.checkout_attempt_id IS NOT DISTINCT FROM p_attempt_id THEN
      DELETE FROM public.virtual_account_checkout_intents
      WHERE registration_id = p_registration_id
        AND attempt_id = p_attempt_id;

      RETURN TRUE;
    END IF;

    RAISE EXCEPTION 'NICEPAY TID is already registered to another registration.';
  END;

  UPDATE public.workshop_registrations_v2
  SET expires_at = p_expires_at
  WHERE id = p_registration_id;

  DELETE FROM public.virtual_account_checkout_intents
  WHERE registration_id = p_registration_id
    AND attempt_id = p_attempt_id;

  RETURN TRUE;
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
  v_registration public.workshop_registrations_v2%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_tid_registration_id UUID;
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration not found.';
  END IF;

  IF v_registration.order_id IS DISTINCT FROM p_order_id THEN
    RAISE EXCEPTION 'Order ID mismatch.';
  END IF;

  IF v_registration.amount IS DISTINCT FROM p_amount THEN
    RAISE EXCEPTION 'Payment amount mismatch. Expected: %, Got: %', v_registration.amount, p_amount;
  END IF;

  SELECT *
  INTO v_payment
  FROM public.payments
  WHERE registration_id = p_registration_id
    AND payment_key = p_tid
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT registration_id
    INTO v_tid_registration_id
    FROM public.payments
    WHERE payment_key = p_tid
    FOR UPDATE;

    IF FOUND THEN
      RAISE EXCEPTION 'NICEPAY TID is already registered to another registration.';
    END IF;

    RAISE EXCEPTION 'Virtual-account payment not found.';
  END IF;

  IF v_payment.order_id IS DISTINCT FROM p_order_id OR v_payment.amount IS DISTINCT FROM p_amount THEN
    RAISE EXCEPTION 'NICEPAY TID does not match the registration order or amount.';
  END IF;

  IF v_payment.payment_method IS DISTINCT FROM '가상계좌' THEN
    RAISE EXCEPTION 'NICEPAY TID is not a virtual-account payment.';
  END IF;

  IF v_registration.status IS NOT DISTINCT FROM 'confirmed'
    AND v_payment.status IS NOT DISTINCT FROM 'success'
    AND v_payment.provider_status IS NOT DISTINCT FROM 'paid' THEN
    RETURN TRUE;
  END IF;

  IF v_registration.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Registration is not in pending state (current state: %).', v_registration.status;
  END IF;

  IF v_payment.status IS DISTINCT FROM 'pending' OR v_payment.provider_status IS DISTINCT FROM 'ready' THEN
    RAISE EXCEPTION 'Virtual-account payment is not awaiting deposit.';
  END IF;

  UPDATE public.payments
  SET status = 'success',
      provider_status = 'paid',
      paid_at = NOW()
  WHERE id = v_payment.id;

  UPDATE public.workshop_registrations_v2
  SET status = 'confirmed'
  WHERE id = p_registration_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_virtual_account_payment(
  p_registration_id UUID,
  p_tid TEXT,
  p_order_id TEXT,
  p_provider_status TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_registration public.workshop_registrations_v2%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_tid_registration_id UUID;
  v_payment_status TEXT;
BEGIN
  IF p_registration_id IS NULL
    OR NULLIF(BTRIM(p_tid), '') IS NULL
    OR NULLIF(BTRIM(p_order_id), '') IS NULL
    OR (p_provider_status IS DISTINCT FROM 'failed'
        AND p_provider_status IS DISTINCT FROM 'expired'
        AND p_provider_status IS DISTINCT FROM 'cancelled') THEN
    RAISE EXCEPTION 'A valid virtual-account failure status is required.';
  END IF;

  SELECT *
  INTO v_registration
  FROM public.workshop_registrations_v2
  WHERE id = p_registration_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration not found.';
  END IF;

  IF v_registration.order_id IS DISTINCT FROM p_order_id THEN
    RAISE EXCEPTION 'Order ID mismatch.';
  END IF;

  SELECT *
  INTO v_payment
  FROM public.payments
  WHERE registration_id = p_registration_id
    AND payment_key = p_tid
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT registration_id
    INTO v_tid_registration_id
    FROM public.payments
    WHERE payment_key = p_tid
    FOR UPDATE;

    IF FOUND THEN
      RAISE EXCEPTION 'NICEPAY TID is already registered to another registration.';
    END IF;

    RAISE EXCEPTION 'Virtual-account payment not found.';
  END IF;

  IF v_payment.order_id IS DISTINCT FROM p_order_id OR v_payment.payment_method IS DISTINCT FROM '가상계좌' THEN
    RAISE EXCEPTION 'NICEPAY TID does not match a virtual-account payment for this order.';
  END IF;

  IF v_payment.amount IS DISTINCT FROM v_registration.amount THEN
    RAISE EXCEPTION 'Virtual-account payment amount does not match the registration amount.';
  END IF;

  IF (v_payment.status IS NOT DISTINCT FROM 'failed'
      OR v_payment.status IS NOT DISTINCT FROM 'cancelled')
    AND v_payment.provider_status IS NOT DISTINCT FROM p_provider_status THEN
    UPDATE public.workshop_registrations_v2
    SET status = 'cancelled'
    WHERE id = p_registration_id
      AND status IS NOT DISTINCT FROM 'pending';

    IF v_registration.status IS DISTINCT FROM 'pending'
      AND v_registration.status IS DISTINCT FROM 'cancelled'
      AND v_registration.status IS DISTINCT FROM 'expired' THEN
      RAISE EXCEPTION 'Registration is not in a terminal failure state (current state: %).', v_registration.status;
    END IF;

    RETURN TRUE;
  END IF;

  IF v_payment.status IS DISTINCT FROM 'pending' OR v_payment.provider_status IS DISTINCT FROM 'ready' THEN
    RAISE EXCEPTION 'Virtual-account payment is not awaiting deposit.';
  END IF;

  IF v_registration.status IS DISTINCT FROM 'pending'
    AND v_registration.status IS DISTINCT FROM 'cancelled'
    AND v_registration.status IS DISTINCT FROM 'expired' THEN
    RAISE EXCEPTION 'Registration cannot accept a virtual-account failure (current state: %).', v_registration.status;
  END IF;

  v_payment_status := CASE WHEN p_provider_status IS NOT DISTINCT FROM 'cancelled' THEN 'cancelled' ELSE 'failed' END;

  UPDATE public.payments
  SET status = v_payment_status,
      provider_status = p_provider_status
  WHERE id = v_payment.id;

  UPDATE public.workshop_registrations_v2
  SET status = 'cancelled'
  WHERE id = p_registration_id
    AND status IS NOT DISTINCT FROM 'pending';

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_virtual_account_checkout(
  p_registration_id UUID,
  p_user_id UUID,
  p_attempt_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_registration public.workshop_registrations_v2%ROWTYPE;
  v_intent public.virtual_account_checkout_intents%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_cancelled_count INTEGER;
BEGIN
  IF p_registration_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'A registration and owner are required.';
  END IF;

  SELECT *
  INTO v_registration
  FROM public.workshop_registrations_v2
  WHERE id = p_registration_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration not found.';
  END IF;

  IF v_registration.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Registration does not belong to the supplied user.';
  END IF;

  SELECT *
  INTO v_intent
  FROM public.virtual_account_checkout_intents
  WHERE registration_id = p_registration_id
  FOR UPDATE;

  SELECT *
  INTO v_payment
  FROM public.payments
  WHERE registration_id = p_registration_id
    AND order_id IS NOT DISTINCT FROM v_registration.order_id
    AND amount IS NOT DISTINCT FROM v_registration.amount
    AND payment_method IS NOT DISTINCT FROM '가상계좌'
  FOR UPDATE;

  IF v_intent.registration_id IS NOT NULL
    AND (p_attempt_id IS NULL OR v_intent.attempt_id IS DISTINCT FROM p_attempt_id) THEN
    RETURN 'stale_attempt';
  END IF;

  IF v_payment.id IS NOT NULL
    AND (p_attempt_id IS NULL OR v_payment.checkout_attempt_id IS DISTINCT FROM p_attempt_id) THEN
    RETURN 'stale_attempt';
  END IF;

  IF v_payment.id IS NOT NULL
    AND v_payment.status IS NOT DISTINCT FROM 'pending'
    AND v_payment.provider_status IS NOT DISTINCT FROM 'ready'
    AND v_payment.expires_at IS NOT NULL
    AND v_payment.expires_at > NOW() THEN
    RETURN 'preserved';
  END IF;

  IF v_payment.id IS NOT NULL
    AND v_payment.status IS NOT DISTINCT FROM 'pending'
    AND v_payment.provider_status IS NOT DISTINCT FROM 'ready'
    AND (v_payment.expires_at IS NULL OR v_payment.expires_at <= NOW()) THEN
    UPDATE public.payments
    SET status = 'failed',
        provider_status = 'expired'
    WHERE id = v_payment.id
      AND status IS NOT DISTINCT FROM 'pending'
      AND provider_status IS NOT DISTINCT FROM 'ready';

    UPDATE public.workshop_registrations_v2
    SET status = 'cancelled'
    WHERE id = p_registration_id
      AND status IS NOT DISTINCT FROM 'pending';

    DELETE FROM public.virtual_account_checkout_intents
    WHERE registration_id = p_registration_id
      AND attempt_id = p_attempt_id;

    RETURN 'expired';
  END IF;

  IF v_payment.id IS NOT NULL THEN
    RETURN 'unchanged';
  END IF;

  IF v_intent.registration_id IS NOT NULL THEN
    DELETE FROM public.virtual_account_checkout_intents
    WHERE registration_id = p_registration_id
      AND attempt_id = p_attempt_id;
  ELSIF p_attempt_id IS NOT NULL THEN
    RETURN 'stale_attempt';
  END IF;

  UPDATE public.workshop_registrations_v2
  SET status = 'cancelled'
  WHERE id = p_registration_id
    AND status IS NOT DISTINCT FROM 'pending';

  GET DIAGNOSTICS v_cancelled_count = ROW_COUNT;

  IF v_cancelled_count = 1 THEN
    RETURN 'cancelled';
  END IF;

  RETURN 'unchanged';
END;
$$;

REVOKE ALL ON FUNCTION public.begin_virtual_account_checkout(UUID, UUID, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.begin_virtual_account_checkout(UUID, UUID, TIMESTAMPTZ) FROM anon;
REVOKE ALL ON FUNCTION public.begin_virtual_account_checkout(UUID, UUID, TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.begin_virtual_account_checkout(UUID, UUID, TIMESTAMPTZ) TO service_role;

REVOKE ALL ON FUNCTION public.record_virtual_account_issuance(UUID, UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_virtual_account_issuance(UUID, UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM anon;
REVOKE ALL ON FUNCTION public.record_virtual_account_issuance(UUID, UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_virtual_account_issuance(UUID, UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO service_role;


REVOKE ALL ON FUNCTION public.fail_virtual_account_payment(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_virtual_account_payment(UUID, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.fail_virtual_account_payment(UUID, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fail_virtual_account_payment(UUID, TEXT, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.release_virtual_account_checkout(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_virtual_account_checkout(UUID, UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.release_virtual_account_checkout(UUID, UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.release_virtual_account_checkout(UUID, UUID, UUID) TO service_role;

-- These overrides live in the still-unapplied lifecycle migration so historical
-- confirmation and registration contracts remain untouched.
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
  v_reg public.workshop_registrations_v2%ROWTYPE;
  v_tid_payment public.payments%ROWTYPE;
  v_payment_method TEXT;
BEGIN
  IF p_registration_id IS NULL
    OR NULLIF(BTRIM(p_payment_key), '') IS NULL
    OR NULLIF(BTRIM(p_order_id), '') IS NULL
    OR p_amount IS NULL THEN
    RAISE EXCEPTION 'Registration, payment key, order ID, and amount are required.';
  END IF;

  v_payment_method := NULLIF(BTRIM(p_payment_method), '');

  IF v_payment_method IS NULL THEN
    RAISE EXCEPTION 'A final NICEPAY payment method is required.';
  END IF;

  SELECT *
  INTO v_reg
  FROM public.workshop_registrations_v2
  WHERE id = p_registration_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration not found.';
  END IF;

  IF v_reg.order_id IS DISTINCT FROM p_order_id THEN
    RAISE EXCEPTION 'Order ID mismatch.';
  END IF;

  IF v_reg.amount IS DISTINCT FROM p_amount THEN
    RAISE EXCEPTION 'Payment amount mismatch. Expected: %, Got: %', v_reg.amount, p_amount;
  END IF;

  -- Serialize a provider TID even when a malicious or broken callback targets
  -- a different registration than the original one.
  PERFORM pg_advisory_xact_lock(hashtextextended(BTRIM(p_payment_key), 0));

  SELECT *
  INTO v_tid_payment
  FROM public.payments
  WHERE payment_key = p_payment_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_tid_payment.registration_id IS NOT DISTINCT FROM p_registration_id
      AND v_tid_payment.order_id IS NOT DISTINCT FROM p_order_id
      AND v_tid_payment.amount IS NOT DISTINCT FROM p_amount
      AND v_tid_payment.payment_method IS NOT DISTINCT FROM v_payment_method
      AND v_tid_payment.status IS NOT DISTINCT FROM 'success'
      AND v_reg.status IS NOT DISTINCT FROM 'confirmed' THEN
      RETURN TRUE;
    END IF;

    RAISE EXCEPTION 'NICEPAY payment key is already associated with a different or incomplete payment.';
  END IF;

  IF v_reg.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Registration is not in pending state (current state: %).', v_reg.status;
  END IF;

  UPDATE public.workshop_registrations_v2
  SET status = 'confirmed'
  WHERE id = p_registration_id
    AND status IS NOT DISTINCT FROM 'pending';

  BEGIN
    INSERT INTO public.payments (
      registration_id,
      amount,
      payment_method,
      payment_key,
      order_id,
      status
    ) VALUES (
      p_registration_id,
      p_amount,
      v_payment_method,
      p_payment_key,
      p_order_id,
      'success'
    );
  EXCEPTION WHEN unique_violation THEN
    SELECT *
    INTO v_tid_payment
    FROM public.payments
    WHERE payment_key = p_payment_key
    FOR UPDATE;

    IF FOUND
      AND v_tid_payment.registration_id IS NOT DISTINCT FROM p_registration_id
      AND v_tid_payment.order_id IS NOT DISTINCT FROM p_order_id
      AND v_tid_payment.amount IS NOT DISTINCT FROM p_amount
      AND v_tid_payment.payment_method IS NOT DISTINCT FROM v_payment_method
      AND v_tid_payment.status IS NOT DISTINCT FROM 'success' THEN
      RETURN TRUE;
    END IF;

    RAISE EXCEPTION 'NICEPAY payment key is already associated with another registration.';
  END;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_pending_registration(
  p_workshop_id UUID,
  p_schedule_key TEXT DEFAULT NULL,
  p_schedule_label TEXT DEFAULT NULL,
  p_schedule_date TEXT DEFAULT NULL,
  p_schedule_time TEXT DEFAULT NULL,
  p_price_type TEXT DEFAULT 'regular'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capacity INTEGER;
  v_workshop_price INTEGER;
  v_student_price INTEGER;
  v_workshop_title TEXT;
  v_workshop_status TEXT;
  v_schedule_capacities JSONB := '{}'::jsonb;
  v_schedule_capacity_text TEXT;
  v_schedule_capacity INTEGER;
  v_effective_capacity INTEGER;
  v_current_count INTEGER;
  v_registration_id UUID;
  v_order_id TEXT;
  v_user_profile RECORD;
  v_full_name TEXT;
  v_phone TEXT;
  v_email TEXT;
  v_bio TEXT;
  v_normalized_schedule_key TEXT;
  v_normalized_schedule_label TEXT;
  v_normalized_schedule_date TEXT;
  v_normalized_schedule_time TEXT;
  v_existing_registration public.workshop_registrations_v2%ROWTYPE;
  v_price_type TEXT;
  v_original_amount INTEGER;
  v_discount_amount INTEGER;
  v_effective_amount INTEGER;
  v_discount_label TEXT;
  v_vbank_checkout_active BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO v_user_profile
  FROM public.profiles
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found. Please complete onboarding.';
  END IF;

  v_full_name := NULLIF(BTRIM(COALESCE(v_user_profile.full_name, '')), '');
  v_phone := NULLIF(BTRIM(COALESCE(v_user_profile.phone, '')), '');
  v_email := COALESCE(
    NULLIF(BTRIM(COALESCE(v_user_profile.email, '')), ''),
    NULLIF(auth.jwt() ->> 'email', '')
  );
  v_bio := NULLIF(BTRIM(COALESCE(v_user_profile.bio, '')), '');
  v_normalized_schedule_key := NULLIF(BTRIM(COALESCE(p_schedule_key, '')), '');
  v_normalized_schedule_label := NULLIF(BTRIM(COALESCE(p_schedule_label, '')), '');
  v_normalized_schedule_date := NULLIF(BTRIM(COALESCE(p_schedule_date, '')), '');
  v_normalized_schedule_time := NULLIF(BTRIM(COALESCE(p_schedule_time, '')), '');

  IF v_full_name IS NULL THEN
    RAISE EXCEPTION 'Full name is required for registration.';
  END IF;

  IF v_phone IS NULL THEN
    RAISE EXCEPTION 'Phone number is required for registration.';
  END IF;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Email is required for registration.';
  END IF;

  WITH expired_registrations AS (
    SELECT id
    FROM public.workshop_registrations_v2
    WHERE user_id = auth.uid()
      AND workshop_id = p_workshop_id
      AND status = 'pending'
      AND expires_at <= NOW()
    FOR UPDATE
  ), expired_virtual_accounts AS (
    UPDATE public.payments
    SET status = 'failed',
        provider_status = 'expired'
    WHERE registration_id IN (SELECT id FROM expired_registrations)
      AND payment_method IS NOT DISTINCT FROM '가상계좌'
      AND status IS NOT DISTINCT FROM 'pending'
      AND provider_status IS NOT DISTINCT FROM 'ready'
  )
  UPDATE public.workshop_registrations_v2
  SET status = 'expired'
  WHERE id IN (SELECT id FROM expired_registrations);

  IF EXISTS (
    SELECT 1
    FROM public.workshop_registrations_v2
    WHERE user_id = auth.uid()
      AND workshop_id = p_workshop_id
      AND status = 'confirmed'
  ) THEN
    RAISE EXCEPTION 'You already have an active registration for this workshop.';
  END IF;

  SELECT *
  INTO v_existing_registration
  FROM public.workshop_registrations_v2
  WHERE user_id = auth.uid()
    AND workshop_id = p_workshop_id
    AND status = 'pending'
    AND expires_at > NOW()
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.virtual_account_checkout_intents
      WHERE registration_id = v_existing_registration.id
        AND user_id = auth.uid()
        AND expires_at > NOW()
      FOR UPDATE
    )
    INTO v_vbank_checkout_active;

    IF NOT v_vbank_checkout_active THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.payments
        WHERE registration_id = v_existing_registration.id
          AND order_id IS NOT DISTINCT FROM v_existing_registration.order_id
          AND amount IS NOT DISTINCT FROM v_existing_registration.amount
          AND payment_method IS NOT DISTINCT FROM '가상계좌'
          AND status IS NOT DISTINCT FROM 'pending'
          AND provider_status IS NOT DISTINCT FROM 'ready'
          AND expires_at > NOW()
        FOR UPDATE
      )
      INTO v_vbank_checkout_active;
    END IF;

    IF v_vbank_checkout_active THEN
      RETURN jsonb_build_object(
        'registration_id', v_existing_registration.id,
        'order_id', v_existing_registration.order_id,
        'amount', v_existing_registration.amount,
        'original_amount', COALESCE(v_existing_registration.original_amount, v_existing_registration.amount),
        'discount_amount', COALESCE(v_existing_registration.discount_amount, 0),
        'price_type', COALESCE(v_existing_registration.price_type, 'regular'),
        'discount_label', v_existing_registration.discount_label,
        'workshop_title', v_existing_registration.snapshot_workshop_title,
        'schedule_key', v_existing_registration.schedule_key,
        'schedule_label', v_existing_registration.schedule_label,
        'schedule_date', v_existing_registration.schedule_date,
        'schedule_time', v_existing_registration.schedule_time,
        'reused', true,
        'vbank_checkout_active', true
      );
    END IF;
  END IF;

  SELECT
    capacity,
    price,
    student_price,
    title,
    COALESCE(status, 'active'),
    COALESCE(schedule_capacities, '{}'::jsonb)
  INTO
    v_capacity,
    v_workshop_price,
    v_student_price,
    v_workshop_title,
    v_workshop_status,
    v_schedule_capacities
  FROM public.workshops
  WHERE id = p_workshop_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workshop not found.';
  END IF;

  IF v_workshop_status <> 'active' THEN
    RAISE EXCEPTION 'Workshop is closed.';
  END IF;

  IF v_capacity IS NULL OR v_capacity < 1 THEN
    RAISE EXCEPTION 'Workshop capacity is not configured.';
  END IF;

  v_original_amount := v_workshop_price;
  v_price_type := CASE
    WHEN lower(BTRIM(COALESCE(p_price_type, 'regular'))) = 'student'
      AND v_student_price IS NOT NULL
      AND v_student_price >= 0
      AND v_student_price < v_workshop_price
    THEN 'student'
    ELSE 'regular'
  END;
  v_effective_amount := CASE WHEN v_price_type = 'student' THEN v_student_price ELSE v_workshop_price END;
  v_discount_amount := GREATEST(v_original_amount - v_effective_amount, 0);
  v_discount_label := CASE WHEN v_price_type = 'student' THEN '학부생 할인' ELSE NULL END;

  IF v_normalized_schedule_key IS NOT NULL AND v_schedule_capacities ? v_normalized_schedule_key THEN
    v_schedule_capacity_text := NULLIF(v_schedule_capacities ->> v_normalized_schedule_key, '');

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
  WHERE workshop_id = p_workshop_id
    AND (v_existing_registration.id IS NULL OR id <> v_existing_registration.id)
    AND (
      status = 'confirmed'
      OR (status = 'pending' AND expires_at > NOW())
    )
    AND (
      v_schedule_capacity IS NULL
      OR schedule_key = v_normalized_schedule_key
    );

  IF v_current_count >= v_effective_capacity THEN
    RAISE EXCEPTION 'Workshop is full.';
  END IF;

  IF v_existing_registration.id IS NOT NULL THEN
    UPDATE public.workshop_registrations_v2
    SET
      amount = v_effective_amount,
      original_amount = v_original_amount,
      discount_amount = v_discount_amount,
      price_type = v_price_type,
      discount_label = v_discount_label,
      snapshot_workshop_title = v_workshop_title,
      snapshot_name = v_full_name,
      snapshot_phone = v_phone,
      snapshot_email = v_email,
      snapshot_bio = v_bio,
      schedule_key = v_normalized_schedule_key,
      schedule_label = v_normalized_schedule_label,
      schedule_date = v_normalized_schedule_date,
      schedule_time = v_normalized_schedule_time
    WHERE id = v_existing_registration.id;

    RETURN jsonb_build_object(
      'registration_id', v_existing_registration.id,
      'order_id', v_existing_registration.order_id,
      'amount', v_effective_amount,
      'original_amount', v_original_amount,
      'discount_amount', v_discount_amount,
      'price_type', v_price_type,
      'discount_label', v_discount_label,
      'workshop_title', v_workshop_title,
      'reused', true
    );
  END IF;

  v_order_id := 'order_' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.workshop_registrations_v2 (
    user_id,
    workshop_id,
    order_id,
    amount,
    original_amount,
    discount_amount,
    price_type,
    discount_label,
    snapshot_workshop_title,
    snapshot_name,
    snapshot_phone,
    snapshot_email,
    snapshot_bio,
    schedule_key,
    schedule_label,
    schedule_date,
    schedule_time
  ) VALUES (
    auth.uid(),
    p_workshop_id,
    v_order_id,
    v_effective_amount,
    v_original_amount,
    v_discount_amount,
    v_price_type,
    v_discount_label,
    v_workshop_title,
    v_full_name,
    v_phone,
    v_email,
    v_bio,
    v_normalized_schedule_key,
    v_normalized_schedule_label,
    v_normalized_schedule_date,
    v_normalized_schedule_time
  )
  RETURNING id INTO v_registration_id;

  RETURN jsonb_build_object(
    'registration_id', v_registration_id,
    'order_id', v_order_id,
    'amount', v_effective_amount,
    'original_amount', v_original_amount,
    'discount_amount', v_discount_amount,
    'price_type', v_price_type,
    'discount_label', v_discount_label,
    'workshop_title', v_workshop_title,
    'reused', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_virtual_account_checkout_attempt(
  p_registration_id UUID,
  p_user_id UUID,
  p_attempt_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_registration public.workshop_registrations_v2%ROWTYPE;
  v_intent public.virtual_account_checkout_intents%ROWTYPE;
BEGIN
  IF p_registration_id IS NULL OR p_user_id IS NULL OR p_attempt_id IS NULL THEN
    RAISE EXCEPTION 'A registration, owner, and virtual-account checkout attempt are required.';
  END IF;

  SELECT *
  INTO v_registration
  FROM public.workshop_registrations_v2
  WHERE id = p_registration_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_registration.user_id IS DISTINCT FROM p_user_id
    OR v_registration.status IS DISTINCT FROM 'pending'
    OR v_registration.expires_at IS NULL
    OR v_registration.expires_at <= NOW() THEN
    RAISE EXCEPTION 'Virtual-account registration is not an active owner-bound reservation.';
  END IF;

  SELECT *
  INTO v_intent
  FROM public.virtual_account_checkout_intents
  WHERE registration_id = p_registration_id
    AND attempt_id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_intent.user_id IS DISTINCT FROM p_user_id
    OR v_intent.expires_at IS NULL
    OR v_intent.expires_at <= NOW() THEN
    RAISE EXCEPTION 'Virtual-account checkout attempt is missing, mismatched, or expired.';
  END IF;

  RETURN TRUE;
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
  v_registration public.workshop_registrations_v2%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_tid_registration_id UUID;
  v_capacity INTEGER;
  v_schedule_capacities JSONB := '{}'::jsonb;
  v_schedule_capacity_text TEXT;
  v_schedule_capacity INTEGER;
  v_effective_capacity INTEGER;
  v_current_count INTEGER;
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration not found.';
  END IF;

  IF v_registration.order_id IS DISTINCT FROM p_order_id THEN
    RAISE EXCEPTION 'Order ID mismatch.';
  END IF;

  IF v_registration.amount IS DISTINCT FROM p_amount THEN
    RAISE EXCEPTION 'Payment amount mismatch. Expected: %, Got: %', v_registration.amount, p_amount;
  END IF;

  SELECT *
  INTO v_payment
  FROM public.payments
  WHERE registration_id = p_registration_id
    AND payment_key = p_tid
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT registration_id
    INTO v_tid_registration_id
    FROM public.payments
    WHERE payment_key = p_tid
    FOR UPDATE;

    IF FOUND THEN
      RAISE EXCEPTION 'NICEPAY TID is already registered to another registration.';
    END IF;

    RAISE EXCEPTION 'Virtual-account payment not found.';
  END IF;

  IF v_payment.order_id IS DISTINCT FROM p_order_id
    OR v_payment.amount IS DISTINCT FROM p_amount
    OR v_payment.payment_method IS DISTINCT FROM '가상계좌' THEN
    RAISE EXCEPTION 'NICEPAY TID does not match the virtual-account registration.';
  END IF;

  IF v_registration.status IS NOT DISTINCT FROM 'confirmed'
    AND v_payment.status IS NOT DISTINCT FROM 'success'
    AND v_payment.provider_status IS NOT DISTINCT FROM 'paid' THEN
    RETURN TRUE;
  END IF;

  IF v_payment.status IS NOT DISTINCT FROM 'failed'
    AND v_payment.provider_status IS NOT DISTINCT FROM 'expired'
    AND (v_registration.status IS NOT DISTINCT FROM 'cancelled'
      OR v_registration.status IS NOT DISTINCT FROM 'expired') THEN
    RETURN FALSE;
  END IF;

  IF v_payment.status IS DISTINCT FROM 'pending' OR v_payment.provider_status IS DISTINCT FROM 'ready' THEN
    RAISE EXCEPTION 'Virtual-account payment is not awaiting deposit.';
  END IF;

  IF v_registration.expires_at IS NULL
    OR v_registration.expires_at <= NOW()
    OR v_payment.expires_at IS NULL
    OR v_payment.expires_at <= NOW() THEN
    UPDATE public.payments
    SET status = 'failed',
        provider_status = 'expired'
    WHERE id = v_payment.id
      AND status IS NOT DISTINCT FROM 'pending'
      AND provider_status IS NOT DISTINCT FROM 'ready';

    UPDATE public.workshop_registrations_v2
    SET status = 'cancelled'
    WHERE id = p_registration_id
      AND status IS NOT DISTINCT FROM 'pending';

    RETURN FALSE;
  END IF;

  IF v_registration.status IS DISTINCT FROM 'pending' THEN
    IF v_registration.status IS NOT DISTINCT FROM 'cancelled'
      OR v_registration.status IS NOT DISTINCT FROM 'expired' THEN
      UPDATE public.payments
      SET status = 'failed',
          provider_status = CASE
            WHEN v_registration.status IS NOT DISTINCT FROM 'expired' THEN 'expired'
            ELSE 'cancelled'
          END
      WHERE id = v_payment.id
        AND status IS NOT DISTINCT FROM 'pending'
        AND provider_status IS NOT DISTINCT FROM 'ready';

      RETURN FALSE;
    END IF;

    RAISE EXCEPTION 'Registration is not in pending state (current state: %).', v_registration.status;
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
    AND (
      status = 'confirmed'
      OR (status = 'pending' AND expires_at > NOW())
    )
    AND (
      v_schedule_capacity IS NULL
      OR schedule_key = v_registration.schedule_key
    );

  IF v_current_count > v_effective_capacity THEN
    UPDATE public.payments
    SET status = 'failed',
        provider_status = 'failed'
    WHERE id = v_payment.id
      AND status IS NOT DISTINCT FROM 'pending'
      AND provider_status IS NOT DISTINCT FROM 'ready';

    UPDATE public.workshop_registrations_v2
    SET status = 'cancelled'
    WHERE id = p_registration_id
      AND status IS NOT DISTINCT FROM 'pending';

    RETURN FALSE;
  END IF;

  UPDATE public.payments
  SET status = 'success',
      provider_status = 'paid',
      paid_at = NOW()
  WHERE id = v_payment.id
    AND status IS NOT DISTINCT FROM 'pending'
    AND provider_status IS NOT DISTINCT FROM 'ready';

  UPDATE public.workshop_registrations_v2
  SET status = 'confirmed'
  WHERE id = p_registration_id
    AND status IS NOT DISTINCT FROM 'pending';

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_payment_registration(UUID, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_payment_registration(UUID, TEXT, TEXT, INTEGER, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_payment_registration(UUID, TEXT, TEXT, INTEGER, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.create_pending_registration(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_pending_registration(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.validate_virtual_account_checkout_attempt(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_virtual_account_checkout_attempt(UUID, UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.validate_virtual_account_checkout_attempt(UUID, UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validate_virtual_account_checkout_attempt(UUID, UUID, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.confirm_virtual_account_deposit(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_virtual_account_deposit(UUID, TEXT, TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.confirm_virtual_account_deposit(UUID, TEXT, TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_virtual_account_deposit(UUID, TEXT, TEXT, INTEGER) TO service_role;
