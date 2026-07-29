-- Keep the legacy four-argument confirmation RPC for deployment rollback.
-- New callers record the final NICEPAY payment method after server approval.
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
    v_reg RECORD;
    v_payment_method TEXT;
BEGIN
    SELECT * INTO v_reg
    FROM public.workshop_registrations_v2
    WHERE id = p_registration_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Registration not found.';
    END IF;

    IF v_reg.order_id != p_order_id THEN
        RAISE EXCEPTION 'Order ID mismatch.';
    END IF;

    IF v_reg.amount != p_amount THEN
        RAISE EXCEPTION 'Payment amount mismatch. Expected: %, Got: %', v_reg.amount, p_amount;
    END IF;

    v_payment_method := NULLIF(BTRIM(p_payment_method), '');

    IF v_reg.status = 'confirmed' THEN
        IF EXISTS (
            SELECT 1
            FROM public.payments
            WHERE payment_key = p_payment_key
              AND order_id = p_order_id
              AND registration_id = p_registration_id
        ) THEN
            IF v_payment_method IS NOT NULL THEN
                UPDATE public.payments
                SET payment_method = v_payment_method
                WHERE payment_key = p_payment_key
                  AND order_id = p_order_id
                  AND registration_id = p_registration_id
                  AND NULLIF(BTRIM(payment_method), '') IS NULL;
            END IF;

            RETURN TRUE;
        END IF;

        RAISE EXCEPTION 'Registration already confirmed with a different payment key or order id.';
    END IF;

    IF v_reg.status != 'pending' THEN
        RAISE EXCEPTION 'Registration is not in pending state (current state: %).', v_reg.status;
    END IF;

    UPDATE public.workshop_registrations_v2
    SET status = 'confirmed'
    WHERE id = p_registration_id;

    INSERT INTO public.payments (registration_id, amount, payment_method, payment_key, order_id, status)
    VALUES (p_registration_id, p_amount, v_payment_method, p_payment_key, p_order_id, 'success');

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_payment_registration(UUID, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_payment_registration(UUID, TEXT, TEXT, INTEGER, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_payment_registration(UUID, TEXT, TEXT, INTEGER, TEXT) TO service_role;
