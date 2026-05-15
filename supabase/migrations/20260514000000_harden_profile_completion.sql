-- Harden profile completion so the client cannot directly update privileged profile fields.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

CREATE OR REPLACE FUNCTION public.complete_profile(
    p_full_name TEXT,
    p_phone TEXT,
    p_bio TEXT DEFAULT NULL
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

    IF v_full_name = '' THEN
        RAISE EXCEPTION 'Full name is required.';
    END IF;

    IF v_phone = '' THEN
        RAISE EXCEPTION 'Phone number is required.';
    END IF;

    IF length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 8 THEN
        RAISE EXCEPTION 'Phone number is invalid.';
    END IF;

    SELECT COALESCE(NULLIF(email, ''), NULLIF(auth.jwt() ->> 'email', ''))
    INTO v_email
    FROM public.profiles
    WHERE id = auth.uid();

    v_email := COALESCE(v_email, NULLIF(auth.jwt() ->> 'email', ''));

    IF v_email IS NULL OR v_email = '' THEN
        RAISE EXCEPTION 'Email is required.';
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
        v_bio,
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET
        email = COALESCE(NULLIF(public.profiles.email, ''), EXCLUDED.email),
        full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone,
        bio = COALESCE(EXCLUDED.bio, public.profiles.bio),
        completed_at = COALESCE(public.profiles.completed_at, NOW()),
        updated_at = NOW()
    RETURNING * INTO v_profile;

    RETURN v_profile;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_profile(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_profile(TEXT, TEXT, TEXT) TO authenticated;

REVOKE INSERT, UPDATE ON public.profiles FROM anon;
REVOKE INSERT, UPDATE ON public.profiles FROM authenticated;

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
