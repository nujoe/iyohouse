ALTER TABLE public.workshops
ADD COLUMN IF NOT EXISTS student_price INTEGER;

ALTER TABLE public.workshops
DROP CONSTRAINT IF EXISTS workshops_student_price_nonnegative;

ALTER TABLE public.workshops
ADD CONSTRAINT workshops_student_price_nonnegative
CHECK (student_price IS NULL OR student_price >= 0);

ALTER TABLE public.workshop_registrations_v2
ADD COLUMN IF NOT EXISTS original_amount INTEGER,
ADD COLUMN IF NOT EXISTS discount_amount INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS price_type TEXT DEFAULT 'regular',
ADD COLUMN IF NOT EXISTS discount_label TEXT,
ADD COLUMN IF NOT EXISTS snapshot_workshop_title TEXT;

UPDATE public.workshop_registrations_v2
SET
    original_amount = COALESCE(original_amount, amount),
    discount_amount = COALESCE(discount_amount, 0),
    price_type = COALESCE(NULLIF(price_type, ''), 'regular')
WHERE original_amount IS NULL
   OR discount_amount IS NULL
   OR price_type IS NULL
   OR price_type = '';

ALTER TABLE public.workshop_registrations_v2
DROP CONSTRAINT IF EXISTS workshop_registrations_v2_price_type_check;

ALTER TABLE public.workshop_registrations_v2
ADD CONSTRAINT workshop_registrations_v2_price_type_check
CHECK (price_type IN ('regular', 'student'));

DROP FUNCTION IF EXISTS public.create_pending_registration(UUID, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.create_pending_registration(UUID, TEXT, TEXT, TEXT, TEXT, TEXT);

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
    v_existing_registration_id UUID;
    v_existing_order_id TEXT;
    v_price_type TEXT;
    v_original_amount INTEGER;
    v_discount_amount INTEGER;
    v_effective_amount INTEGER;
    v_discount_label TEXT;
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

    v_full_name := NULLIF(btrim(COALESCE(v_user_profile.full_name, '')), '');
    v_phone := NULLIF(btrim(COALESCE(v_user_profile.phone, '')), '');
    v_email := COALESCE(
        NULLIF(btrim(COALESCE(v_user_profile.email, '')), ''),
        NULLIF(auth.jwt() ->> 'email', '')
    );
    v_bio := NULLIF(btrim(COALESCE(v_user_profile.bio, '')), '');
    v_normalized_schedule_key := NULLIF(btrim(COALESCE(p_schedule_key, '')), '');
    v_normalized_schedule_label := NULLIF(btrim(COALESCE(p_schedule_label, '')), '');
    v_normalized_schedule_date := NULLIF(btrim(COALESCE(p_schedule_date, '')), '');
    v_normalized_schedule_time := NULLIF(btrim(COALESCE(p_schedule_time, '')), '');

    IF v_full_name IS NULL THEN
        RAISE EXCEPTION 'Full name is required for registration.';
    END IF;

    IF v_phone IS NULL THEN
        RAISE EXCEPTION 'Phone number is required for registration.';
    END IF;

    IF v_email IS NULL THEN
        RAISE EXCEPTION 'Email is required for registration.';
    END IF;

    UPDATE public.workshop_registrations_v2
    SET status = 'expired'
    WHERE user_id = auth.uid()
      AND workshop_id = p_workshop_id
      AND status = 'pending'
      AND expires_at <= NOW();

    IF EXISTS (
        SELECT 1
        FROM public.workshop_registrations_v2
        WHERE user_id = auth.uid()
          AND workshop_id = p_workshop_id
          AND status = 'confirmed'
    ) THEN
        RAISE EXCEPTION 'You already have an active registration for this workshop.';
    END IF;

    SELECT id, order_id
    INTO v_existing_registration_id, v_existing_order_id
    FROM public.workshop_registrations_v2
    WHERE user_id = auth.uid()
      AND workshop_id = p_workshop_id
      AND status = 'pending'
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1;

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
        WHEN lower(btrim(COALESCE(p_price_type, 'regular'))) = 'student'
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
      AND (v_existing_registration_id IS NULL OR id <> v_existing_registration_id)
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

    IF v_existing_registration_id IS NOT NULL THEN
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
        WHERE id = v_existing_registration_id;

        RETURN jsonb_build_object(
            'registration_id', v_existing_registration_id,
            'order_id', v_existing_order_id,
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
    )
    VALUES (
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

REVOKE ALL ON FUNCTION public.create_pending_registration(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_pending_registration(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
