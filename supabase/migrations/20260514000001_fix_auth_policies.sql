-- Align auth policies and workshop registration with profile completion.

ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.confirm_payment_registration(UUID, TEXT, TEXT, INTEGER) SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = auth.uid()
          AND is_super_admin = TRUE
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_workshop(p_workshop_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.is_admin()
        OR EXISTS (
            SELECT 1
            FROM public.workshop_managers
            WHERE user_id = auth.uid()
              AND workshop_id = p_workshop_id
        );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

REVOKE ALL ON FUNCTION public.can_manage_workshop(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_workshop(UUID) TO anon, authenticated;

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by owner or admin" ON public.profiles;

CREATE POLICY "Profiles are viewable by owner or admin"
ON public.profiles
FOR SELECT
USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "Admins can manage workshops" ON public.workshops;
CREATE POLICY "Admins can manage workshops"
ON public.workshops
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users can view their own manager status" ON public.workshop_managers;
DROP POLICY IF EXISTS "Admins can manage workshop managers" ON public.workshop_managers;

CREATE POLICY "Users can view their own manager status"
ON public.workshop_managers
FOR SELECT
USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Admins can manage workshop managers"
ON public.workshop_managers
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Managers and admins can view registrations" ON public.workshop_registrations_v2;
CREATE POLICY "Managers and admins can view registrations"
ON public.workshop_registrations_v2
FOR SELECT
USING (public.can_manage_workshop(workshop_id));

CREATE OR REPLACE FUNCTION public.create_pending_registration(p_workshop_id UUID)
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
        snapshot_email
    )
    VALUES (
        auth.uid(),
        p_workshop_id,
        v_order_id,
        v_workshop_price,
        v_full_name,
        v_phone,
        v_email
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

REVOKE ALL ON FUNCTION public.create_pending_registration(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_pending_registration(UUID) TO authenticated;
