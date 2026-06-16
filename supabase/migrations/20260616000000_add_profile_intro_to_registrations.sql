-- Allow users to edit their workshop contact email and short introduction.
-- Keep a registration-time snapshot so admin applicant lists do not change retroactively.

ALTER TABLE public.workshop_registrations_v2
ADD COLUMN IF NOT EXISTS snapshot_bio TEXT;

DROP FUNCTION IF EXISTS public.complete_profile(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.complete_profile(TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.complete_profile(TEXT, TEXT, TEXT, TEXT, BOOLEAN);

CREATE OR REPLACE FUNCTION public.complete_profile(
    p_full_name TEXT,
    p_phone TEXT,
    p_bio TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_clear_bio BOOLEAN DEFAULT FALSE
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_full_name TEXT;
    v_phone TEXT;
    v_bio TEXT;
    v_email TEXT;
    v_profile public.profiles;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    v_full_name := btrim(COALESCE(p_full_name, ''));
    v_phone := btrim(COALESCE(p_phone, ''));
    v_bio := NULLIF(btrim(COALESCE(p_bio, '')), '');
    v_email := NULLIF(btrim(COALESCE(p_email, '')), '');

    IF v_full_name = '' THEN
        RAISE EXCEPTION 'Full name is required.';
    END IF;

    IF v_phone = '' THEN
        RAISE EXCEPTION 'Phone number is required.';
    END IF;

    IF length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 8 THEN
        RAISE EXCEPTION 'Phone number is invalid.';
    END IF;

    IF v_email IS NULL THEN
        SELECT COALESCE(NULLIF(email, ''), NULLIF(auth.jwt() ->> 'email', ''))
        INTO v_email
        FROM public.profiles
        WHERE id = auth.uid();

        v_email := COALESCE(v_email, NULLIF(auth.jwt() ->> 'email', ''));
    END IF;

    IF v_email IS NULL OR v_email = '' THEN
        RAISE EXCEPTION 'Email is required.';
    END IF;

    IF v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
        RAISE EXCEPTION 'Email is invalid.';
    END IF;

    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        phone,
        bio,
        completed_at,
        updated_at
    )
    VALUES (
        auth.uid(),
        v_email,
        v_full_name,
        v_phone,
        CASE WHEN p_clear_bio THEN NULL ELSE v_bio END,
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone,
        bio = CASE
            WHEN p_clear_bio THEN NULL
            WHEN v_bio IS NOT NULL THEN v_bio
            ELSE public.profiles.bio
        END,
        completed_at = COALESCE(public.profiles.completed_at, NOW()),
        updated_at = NOW()
    RETURNING * INTO v_profile;

    RETURN v_profile;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_profile(TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_profile(TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;

DROP FUNCTION IF EXISTS public.create_pending_registration(UUID, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.create_pending_registration(
    p_workshop_id UUID,
    p_schedule_key TEXT DEFAULT NULL,
    p_schedule_label TEXT DEFAULT NULL,
    p_schedule_date TEXT DEFAULT NULL,
    p_schedule_time TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_capacity INTEGER;
    v_workshop_price INTEGER;
    v_current_count INTEGER;
    v_registration_id UUID;
    v_order_id TEXT;
    v_user_profile RECORD;
    v_full_name TEXT;
    v_phone TEXT;
    v_email TEXT;
    v_bio TEXT;
    v_existing_registration_id UUID;
    v_existing_order_id TEXT;
    v_existing_amount INTEGER;
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

    SELECT id, order_id, amount
    INTO v_existing_registration_id, v_existing_order_id, v_existing_amount
    FROM public.workshop_registrations_v2
    WHERE user_id = auth.uid()
      AND workshop_id = p_workshop_id
      AND status = 'pending'
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing_registration_id IS NOT NULL THEN
        UPDATE public.workshop_registrations_v2
        SET
            snapshot_name = v_full_name,
            snapshot_phone = v_phone,
            snapshot_email = v_email,
            snapshot_bio = v_bio,
            schedule_key = COALESCE(p_schedule_key, schedule_key),
            schedule_label = COALESCE(p_schedule_label, schedule_label),
            schedule_date = COALESCE(p_schedule_date, schedule_date),
            schedule_time = COALESCE(p_schedule_time, schedule_time)
        WHERE id = v_existing_registration_id;

        RETURN jsonb_build_object(
            'registration_id', v_existing_registration_id,
            'order_id', v_existing_order_id,
            'amount', v_existing_amount,
            'reused', true
        );
    END IF;

    SELECT capacity, price
    INTO v_capacity, v_workshop_price
    FROM public.workshops
    WHERE id = p_workshop_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Workshop not found.';
    END IF;

    SELECT count(*)
    INTO v_current_count
    FROM public.workshop_registrations_v2
    WHERE workshop_id = p_workshop_id
      AND (
          status = 'confirmed'
          OR (status = 'pending' AND expires_at > NOW())
      );

    IF v_current_count >= v_capacity THEN
        RAISE EXCEPTION 'Workshop is full.';
    END IF;

    v_order_id := 'order_' || replace(gen_random_uuid()::text, '-', '');

    INSERT INTO public.workshop_registrations_v2 (
        user_id,
        workshop_id,
        order_id,
        amount,
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
        v_workshop_price,
        v_full_name,
        v_phone,
        v_email,
        v_bio,
        p_schedule_key,
        p_schedule_label,
        p_schedule_date,
        p_schedule_time
    )
    RETURNING id INTO v_registration_id;

    RETURN jsonb_build_object(
        'registration_id', v_registration_id,
        'order_id', v_order_id,
        'amount', v_workshop_price,
        'reused', false
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_pending_registration(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_pending_registration(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE VIEW public."워크숍_신청자목록"
WITH (security_invoker = true)
AS
SELECT
    w.title AS "워크숍명",
    r.snapshot_email AS "이메일",
    r.snapshot_name AS "이름",
    r.snapshot_phone AS "연락처",
    r.snapshot_bio AS "자기소개"
FROM public.workshop_registrations_v2 r
JOIN public.workshops w ON w.id = r.workshop_id
WHERE r.status = 'confirmed'
ORDER BY
    w.title ASC,
    r.snapshot_name ASC,
    r.created_at ASC;

GRANT SELECT ON public."워크숍_신청자목록" TO authenticated, service_role;
