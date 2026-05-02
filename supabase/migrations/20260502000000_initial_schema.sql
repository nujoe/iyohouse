-- Migration: Initial Workshop Registration Schema (V2)
-- Created: 2026-05-02
-- Author: Antigravity

-- 1. Enums
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'registration_status') THEN
        CREATE TYPE registration_status AS ENUM ('pending', 'confirmed', 'cancelled', 'expired');
    END IF;
END $$;

-- 2. Tables

-- Profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
    full_name TEXT,
    phone TEXT,
    email TEXT,
    bio TEXT,
    is_super_admin BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, email)
    VALUES (
        NEW.id, 
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
        NEW.email
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Workshops
CREATE TABLE IF NOT EXISTS public.workshops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    price INTEGER NOT NULL DEFAULT 0,
    capacity INTEGER NOT NULL DEFAULT 10,
    start_at TIMESTAMP WITH TIME ZONE NOT NULL,
    end_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Workshop Managers (links managers to specific workshops)
CREATE TABLE IF NOT EXISTS public.workshop_managers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    workshop_id UUID REFERENCES public.workshops(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, workshop_id)
);

-- Workshop Registrations V2
CREATE TABLE IF NOT EXISTS public.workshop_registrations_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    workshop_id UUID REFERENCES public.workshops(id) ON DELETE CASCADE,
    order_id TEXT UNIQUE NOT NULL,
    amount INTEGER NOT NULL,
    status registration_status DEFAULT 'pending',
    snapshot_name TEXT NOT NULL,
    snapshot_phone TEXT NOT NULL,
    snapshot_email TEXT,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '15 minutes'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payments
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id UUID REFERENCES public.workshop_registrations_v2(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    payment_method TEXT,
    payment_key TEXT UNIQUE NOT NULL,
    order_id TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Indexes

-- Prevent duplicate pending or confirmed registrations for the same user and workshop
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_registration 
ON public.workshop_registrations_v2 (user_id, workshop_id) 
WHERE (status IN ('pending', 'confirmed'));

-- 4. RLS (Row Level Security)

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_registrations_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = TRUE)
);

-- Workshops Policies
DROP POLICY IF EXISTS "Everyone can view workshops" ON public.workshops;
CREATE POLICY "Everyone can view workshops" ON public.workshops FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Admins can manage workshops" ON public.workshops;
CREATE POLICY "Admins can manage workshops" ON public.workshops ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = TRUE)
);

-- Registrations Policies
DROP POLICY IF EXISTS "Users can view their own registrations" ON public.workshop_registrations_v2;
CREATE POLICY "Users can view their own registrations" ON public.workshop_registrations_v2 FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Managers and admins can view registrations" ON public.workshop_registrations_v2;
CREATE POLICY "Managers and admins can view registrations" ON public.workshop_registrations_v2 FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.workshop_managers WHERE user_id = auth.uid() AND workshop_id = public.workshop_registrations_v2.workshop_id)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = TRUE)
);

-- Payments Policies
DROP POLICY IF EXISTS "Users can view their own payments" ON public.payments;
CREATE POLICY "Users can view their own payments" ON public.payments FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.workshop_registrations_v2 WHERE id = public.payments.registration_id AND user_id = auth.uid())
);

-- 5. RPC Functions

-- Capacity check + Pending creation
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
BEGIN
    -- 1. Check Auth
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- 2. Get user profile and validate
    SELECT * INTO v_user_profile FROM public.profiles WHERE id = auth.uid();
    IF v_user_profile IS NULL THEN
        RAISE EXCEPTION 'Profile not found. Please complete onboarding.';
    END IF;

    IF v_user_profile.full_name IS NULL OR v_user_profile.full_name = '' THEN
        RAISE EXCEPTION 'Full name is required for registration. Please update your profile.';
    END IF;

    IF v_user_profile.phone IS NULL OR v_user_profile.phone = '' THEN
        RAISE EXCEPTION 'Phone number is required for registration. Please update your profile.';
    END IF;

    -- 3. Duplicate Registration Check
    IF EXISTS (
        SELECT 1 FROM public.workshop_registrations_v2 
        WHERE user_id = auth.uid() AND workshop_id = p_workshop_id AND status IN ('pending', 'confirmed')
    ) THEN
        RAISE EXCEPTION 'You already have an active registration for this workshop.';
    END IF;

    -- 4. Lock workshop for update to prevent race conditions
    SELECT capacity, price INTO v_capacity, v_workshop_price FROM public.workshops WHERE id = p_workshop_id FOR UPDATE;
    IF v_capacity IS NULL THEN
        RAISE EXCEPTION 'Workshop not found.';
    END IF;
    
    -- 5. Count active registrations (pending + confirmed)
    SELECT count(*) INTO v_current_count 
    FROM public.workshop_registrations_v2 
    WHERE workshop_id = p_workshop_id AND status IN ('pending', 'confirmed');

    IF v_current_count >= v_capacity THEN
        RAISE EXCEPTION 'Workshop is full.';
    END IF;

    -- 6. Generate order_id
    v_order_id := 'order_' || replace(gen_random_uuid()::text, '-', '');

    -- 7. Insert registration
    INSERT INTO public.workshop_registrations_v2 (
        user_id, 
        workshop_id, 
        order_id,
        amount,
        snapshot_name, 
        snapshot_phone, 
        snapshot_email
    ) VALUES (
        auth.uid(), 
        p_workshop_id, 
        v_order_id,
        v_workshop_price,
        v_user_profile.full_name, 
        v_user_profile.phone, 
        v_user_profile.email
    ) RETURNING id INTO v_registration_id;

    RETURN jsonb_build_object(
        'registration_id', v_registration_id,
        'order_id', v_order_id,
        'amount', v_workshop_price
    );
END;
$$;

-- Confirm payment -> status confirmed
CREATE OR REPLACE FUNCTION public.confirm_payment_registration(
    p_registration_id UUID, 
    p_payment_key TEXT, 
    p_order_id TEXT, 
    p_amount INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_reg RECORD;
BEGIN
    -- 1. Fetch registration
    SELECT * INTO v_reg FROM public.workshop_registrations_v2 WHERE id = p_registration_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Registration not found.';
    END IF;

    -- 2. Verify order_id and amount
    IF v_reg.order_id != p_order_id THEN
        RAISE EXCEPTION 'Order ID mismatch.';
    END IF;

    IF v_reg.amount != p_amount THEN
        RAISE EXCEPTION 'Payment amount mismatch. Expected: %, Got: %', v_reg.amount, p_amount;
    END IF;

    -- 4. Idempotency check
    IF v_reg.status = 'confirmed' THEN
        -- Check if payment exists with this key
        IF EXISTS (SELECT 1 FROM public.payments WHERE payment_key = p_payment_key AND order_id = p_order_id AND registration_id = p_registration_id) THEN
            RETURN TRUE; -- Already processed successfully
        ELSE
            RAISE EXCEPTION 'Registration already confirmed with a different payment key or order id.';
        END IF;
    END IF;

    IF v_reg.status != 'pending' THEN
        RAISE EXCEPTION 'Registration is not in pending state (current state: %).', v_reg.status;
    END IF;

    -- 5. Update status
    UPDATE public.workshop_registrations_v2 
    SET status = 'confirmed' 
    WHERE id = p_registration_id;

    -- 6. Insert payment record
    INSERT INTO public.payments (registration_id, amount, payment_key, order_id, status)
    VALUES (p_registration_id, p_amount, p_payment_key, p_order_id, 'success');

    RETURN TRUE;
END;
$$;

-- Expiry function (can be called by a cron job or background worker)
CREATE OR REPLACE FUNCTION public.expire_pending_registrations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE public.workshop_registrations_v2
    SET status = 'expired'
    WHERE status = 'pending' AND expires_at < NOW();
    
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    RETURN v_updated_count;
END;
$$;

-- 6. RPC Permissions (Contract: Remove PUBLIC access, grant to specific roles)

REVOKE ALL ON FUNCTION public.create_pending_registration(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_pending_registration(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.confirm_payment_registration(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_payment_registration(UUID, TEXT, TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_payment_registration(UUID, TEXT, TEXT, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.expire_pending_registrations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_pending_registrations() TO service_role;

