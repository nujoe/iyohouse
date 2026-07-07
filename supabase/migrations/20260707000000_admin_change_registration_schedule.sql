-- Allow super-admin tooling to move a confirmed registration between schedules
-- without touching payment/order fields.

CREATE OR REPLACE FUNCTION public.admin_change_registration_schedule(
    p_workshop_id UUID,
    p_registration_id UUID,
    p_schedule_key TEXT,
    p_schedule_label TEXT,
    p_schedule_date TEXT DEFAULT NULL,
    p_schedule_time TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_registration RECORD;
    v_capacity INTEGER;
    v_schedule_capacities JSONB := '{}'::jsonb;
    v_target_capacity INTEGER;
    v_target_capacity_text TEXT;
    v_target_count INTEGER;
    v_schedule_key TEXT;
    v_schedule_label TEXT;
    v_schedule_date TEXT;
    v_schedule_time TEXT;
BEGIN
    v_schedule_key := NULLIF(btrim(COALESCE(p_schedule_key, '')), '');
    v_schedule_label := NULLIF(btrim(COALESCE(p_schedule_label, '')), '');
    v_schedule_date := NULLIF(btrim(COALESCE(p_schedule_date, '')), '');
    v_schedule_time := NULLIF(btrim(COALESCE(p_schedule_time, '')), '');

    IF v_schedule_key IS NULL OR v_schedule_label IS NULL THEN
        RAISE EXCEPTION 'Schedule key and label are required.';
    END IF;

    SELECT *
    INTO v_registration
    FROM public.workshop_registrations_v2
    WHERE id = p_registration_id
      AND workshop_id = p_workshop_id
      AND status = 'confirmed'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Confirmed registration not found.';
    END IF;

    SELECT capacity, COALESCE(schedule_capacities, '{}'::jsonb)
    INTO v_capacity, v_schedule_capacities
    FROM public.workshops
    WHERE id = p_workshop_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Workshop not found.';
    END IF;

    IF v_schedule_capacities ? v_schedule_key THEN
        v_target_capacity_text := NULLIF(v_schedule_capacities ->> v_schedule_key, '');

        IF v_target_capacity_text ~ '^[0-9]+$' THEN
            v_target_capacity := v_target_capacity_text::integer;
        END IF;
    END IF;

    IF v_target_capacity IS NULL OR v_target_capacity < 1 THEN
        v_target_capacity := v_capacity;
    END IF;

    IF v_target_capacity IS NULL OR v_target_capacity < 1 THEN
        RAISE EXCEPTION 'Target schedule capacity is not configured.';
    END IF;

    SELECT count(*)
    INTO v_target_count
    FROM public.workshop_registrations_v2
    WHERE workshop_id = p_workshop_id
      AND schedule_key = v_schedule_key
      AND id <> p_registration_id
      AND (
          status = 'confirmed'
          OR (status = 'pending' AND expires_at > NOW())
      );

    IF v_target_count >= v_target_capacity THEN
        RAISE EXCEPTION 'Target schedule is full.';
    END IF;

    UPDATE public.workshop_registrations_v2
    SET
        schedule_key = v_schedule_key,
        schedule_label = v_schedule_label,
        schedule_date = v_schedule_date,
        schedule_time = v_schedule_time
    WHERE id = p_registration_id;

    RETURN jsonb_build_object(
        'registration_id', p_registration_id,
        'workshop_id', p_workshop_id,
        'schedule_key', v_schedule_key,
        'schedule_label', v_schedule_label,
        'schedule_date', v_schedule_date,
        'schedule_time', v_schedule_time
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_change_registration_schedule(UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_change_registration_schedule(UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;
