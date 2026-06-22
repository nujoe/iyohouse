-- Persist per-schedule workshop capacities and enforce them when a pending registration is created.

ALTER TABLE public.workshops
ADD COLUMN IF NOT EXISTS schedule_capacities JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.workshops
ALTER COLUMN schedule_capacities SET DEFAULT '{}'::jsonb;

UPDATE public.workshops
SET schedule_capacities = '{}'::jsonb
WHERE schedule_capacities IS NULL;

ALTER TABLE public.workshops
ALTER COLUMN schedule_capacities SET NOT NULL;

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
        title,
        COALESCE(status, 'active'),
        COALESCE(schedule_capacities, '{}'::jsonb)
    INTO
        v_capacity,
        v_workshop_price,
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
            amount = v_workshop_price,
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
            'amount', v_workshop_price,
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
        v_normalized_schedule_key,
        v_normalized_schedule_label,
        v_normalized_schedule_date,
        v_normalized_schedule_time
    )
    RETURNING id INTO v_registration_id;

    RETURN jsonb_build_object(
        'registration_id', v_registration_id,
        'order_id', v_order_id,
        'amount', v_workshop_price,
        'workshop_title', v_workshop_title,
        'reused', false
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_pending_registration(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_pending_registration(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
