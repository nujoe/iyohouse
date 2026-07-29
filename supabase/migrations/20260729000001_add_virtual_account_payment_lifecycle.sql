-- Track NICEPAY virtual-account issuance separately from historical card payments.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS provider_status TEXT,
  ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vbank_code TEXT,
  ADD COLUMN IF NOT EXISTS vbank_name TEXT,
  ADD COLUMN IF NOT EXISTS vbank_number TEXT,
  ADD COLUMN IF NOT EXISTS vbank_holder TEXT;

CREATE INDEX IF NOT EXISTS idx_payments_registration_status_provider_status
  ON public.payments (registration_id, status, provider_status);

CREATE OR REPLACE FUNCTION public.reserve_virtual_account_registration(
  p_registration_id UUID,
  p_user_id UUID,
  p_expires_at TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_registration public.workshop_registrations_v2%ROWTYPE;
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

  IF v_registration.status <> 'pending' OR v_registration.expires_at IS NULL OR v_registration.expires_at <= NOW() THEN
    RAISE EXCEPTION 'Registration is not an unexpired pending registration.';
  END IF;

  UPDATE public.workshop_registrations_v2
  SET expires_at = p_expires_at
  WHERE id = p_registration_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_virtual_account_issuance(
  p_registration_id UUID,
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
  v_tid_payment public.payments%ROWTYPE;
  v_registration_payment public.payments%ROWTYPE;
BEGIN
  IF p_registration_id IS NULL
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

  IF v_registration.status <> 'pending' OR v_registration.expires_at IS NULL OR v_registration.expires_at <= NOW() THEN
    RAISE EXCEPTION 'Registration is not an unexpired pending registration.';
  END IF;

  IF v_registration.order_id <> p_order_id THEN
    RAISE EXCEPTION 'Order ID mismatch.';
  END IF;

  IF v_registration.amount <> p_amount THEN
    RAISE EXCEPTION 'Payment amount mismatch. Expected: %, Got: %', v_registration.amount, p_amount;
  END IF;

  SELECT *
  INTO v_tid_payment
  FROM public.payments
  WHERE payment_key = p_tid
  FOR UPDATE;

  IF FOUND THEN
    IF v_tid_payment.registration_id <> p_registration_id THEN
      RAISE EXCEPTION 'NICEPAY TID is already registered to another registration.';
    END IF;

    IF v_tid_payment.order_id <> p_order_id OR v_tid_payment.amount <> p_amount THEN
      RAISE EXCEPTION 'NICEPAY TID does not match the registration order or amount.';
    END IF;

    IF v_tid_payment.payment_method <> '가상계좌' THEN
      RAISE EXCEPTION 'NICEPAY TID is not a virtual-account payment.';
    END IF;

    RETURN TRUE;
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

    IF FOUND AND v_tid_payment.registration_id = p_registration_id
      AND v_tid_payment.order_id = p_order_id
      AND v_tid_payment.amount = p_amount
      AND v_tid_payment.payment_method = '가상계좌' THEN
      RETURN TRUE;
    END IF;

    RAISE EXCEPTION 'NICEPAY TID is already registered to another registration.';
  END;

  UPDATE public.workshop_registrations_v2
  SET expires_at = p_expires_at
  WHERE id = p_registration_id;

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

  IF v_registration.order_id <> p_order_id THEN
    RAISE EXCEPTION 'Order ID mismatch.';
  END IF;

  IF v_registration.amount <> p_amount THEN
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

  IF v_payment.order_id <> p_order_id OR v_payment.amount <> p_amount THEN
    RAISE EXCEPTION 'NICEPAY TID does not match the registration order or amount.';
  END IF;

  IF v_payment.payment_method <> '가상계좌' THEN
    RAISE EXCEPTION 'NICEPAY TID is not a virtual-account payment.';
  END IF;

  IF v_registration.status = 'confirmed'
    AND v_payment.status = 'success'
    AND v_payment.provider_status = 'paid' THEN
    RETURN TRUE;
  END IF;

  IF v_registration.status <> 'pending' THEN
    RAISE EXCEPTION 'Registration is not in pending state (current state: %).', v_registration.status;
  END IF;

  IF v_payment.status <> 'pending' OR v_payment.provider_status <> 'ready' THEN
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
    OR p_provider_status IS NULL
    OR p_provider_status NOT IN ('failed', 'expired', 'cancelled') THEN
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

  IF v_registration.order_id <> p_order_id THEN
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

  IF v_payment.order_id <> p_order_id OR v_payment.payment_method <> '가상계좌' THEN
    RAISE EXCEPTION 'NICEPAY TID does not match a virtual-account payment for this order.';
  END IF;

  IF v_payment.status IN ('failed', 'cancelled')
    AND v_payment.provider_status = p_provider_status
    AND v_registration.status = 'cancelled' THEN
    RETURN TRUE;
  END IF;

  IF v_payment.status <> 'pending' OR v_payment.provider_status <> 'ready' THEN
    RAISE EXCEPTION 'Virtual-account payment is not awaiting deposit.';
  END IF;

  IF v_registration.status NOT IN ('pending', 'cancelled') THEN
    RAISE EXCEPTION 'Registration is not pending or cancelled (current state: %).', v_registration.status;
  END IF;

  v_payment_status := CASE WHEN p_provider_status = 'cancelled' THEN 'cancelled' ELSE 'failed' END;

  UPDATE public.payments
  SET status = v_payment_status,
      provider_status = p_provider_status
  WHERE id = v_payment.id;

  UPDATE public.workshop_registrations_v2
  SET status = 'cancelled'
  WHERE id = p_registration_id
    AND status = 'pending';

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_virtual_account_registration(UUID, UUID, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_virtual_account_registration(UUID, UUID, TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_virtual_account_registration(UUID, UUID, TIMESTAMPTZ) TO service_role;

REVOKE ALL ON FUNCTION public.record_virtual_account_issuance(UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_virtual_account_issuance(UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_virtual_account_issuance(UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO service_role;

REVOKE ALL ON FUNCTION public.confirm_virtual_account_deposit(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_virtual_account_deposit(UUID, TEXT, TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_virtual_account_deposit(UUID, TEXT, TEXT, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.fail_virtual_account_payment(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_virtual_account_payment(UUID, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fail_virtual_account_payment(UUID, TEXT, TEXT, TEXT) TO service_role;
