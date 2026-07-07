-- =============================================
-- SmartEnterprise Complete Auth Fix
-- Run this in: Supabase Dashboard → SQL Editor
-- =============================================
-- Sample credentials:
--   ADMIN :  admin@smartenterprise.tz   / Admin@1234
--   OWNER :  owner@smartenterprise.tz   / Owner@1234
-- =============================================

-- ─────────────────────────────────────────────
-- STEP 1: Clean up broken users (missing identities)
-- These were inserted directly into auth.users
-- without the matching auth.identities row.
-- Delete in FK-safe order:
--   businesses (cascades to categories/products/orders/etc.)
--   → public.users → auth.identities → auth.users
-- ─────────────────────────────────────────────

-- Remove businesses owned by these accounts first to avoid
-- the businesses_owner_id_fkey violation.
-- All child tables (subscriptions, categories, products, orders,
-- staff, support_tickets) carry ON DELETE CASCADE so they clean up
-- automatically when the business row is deleted.
DELETE FROM public.businesses
WHERE owner_id IN (
  SELECT id FROM public.users
  WHERE email IN ('admin@smartenterprise.tz', 'owner@smartenterprise.tz')
);

DELETE FROM auth.identities
WHERE user_id IN (
  SELECT id FROM auth.users
  WHERE email IN ('admin@smartenterprise.tz', 'owner@smartenterprise.tz')
);

DELETE FROM public.users
WHERE email IN ('admin@smartenterprise.tz', 'owner@smartenterprise.tz');

DELETE FROM auth.users
WHERE email IN ('admin@smartenterprise.tz', 'owner@smartenterprise.tz');


-- ─────────────────────────────────────────────
-- STEP 2: Fix RLS policies
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "users_own_profile"  ON users;
DROP POLICY IF EXISTS "users_select_own"   ON users;
DROP POLICY IF EXISTS "users_insert_own"   ON users;
DROP POLICY IF EXISTS "users_update_own"   ON users;

CREATE POLICY "users_select_own" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users_insert_own" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (auth.uid() = id);


-- ─────────────────────────────────────────────
-- STEP 3: Auto-profile trigger
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    -- Preserve admin role for the known admin account; everyone else defaults to 'owner'
    CASE WHEN NEW.email = 'admin@smartenterprise.tz' THEN 'admin' ELSE 'owner' END,
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ─────────────────────────────────────────────
-- STEP 4: Create ADMIN user correctly
-- (includes auth.identities row)
-- ─────────────────────────────────────────────
DO $$
DECLARE
  admin_uid  uuid := gen_random_uuid();
  owner_uid  uuid := gen_random_uuid();
BEGIN

  -- ── INSERT ADMIN into auth.users ─────────
  INSERT INTO auth.users (
    id, instance_id, aud, role,
    email, encrypted_password,
    email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    is_super_admin, is_sso_user, is_anonymous,
    created_at, updated_at,
    confirmation_token, recovery_token,
    email_change, email_change_token_new
  ) VALUES (
    admin_uid,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'admin@smartenterprise.tz',
    crypt('Admin@1234', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Super Admin"}',
    false, false, false,
    now(), now(),
    '', '', '', ''
  );

  -- Insert identity for admin (required in newer Supabase)
  INSERT INTO auth.identities (
    id, user_id, provider_id,
    identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    admin_uid,
    admin_uid,
    'admin@smartenterprise.tz',
    jsonb_build_object('sub', admin_uid::text, 'email', 'admin@smartenterprise.tz', 'email_verified', true),
    'email',
    now(), now(), now()
  );

  -- Insert admin profile with role = 'admin'
  INSERT INTO public.users (id, email, full_name, role, created_at, updated_at)
  VALUES (admin_uid, 'admin@smartenterprise.tz', 'Super Admin', 'admin', now(), now())
  ON CONFLICT (id) DO UPDATE SET role = 'admin', updated_at = now();

  RAISE NOTICE 'Admin created: % / Admin@1234', 'admin@smartenterprise.tz';


  -- ── INSERT OWNER into auth.users ─────────
  INSERT INTO auth.users (
    id, instance_id, aud, role,
    email, encrypted_password,
    email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    is_super_admin, is_sso_user, is_anonymous,
    created_at, updated_at,
    confirmation_token, recovery_token,
    email_change, email_change_token_new
  ) VALUES (
    owner_uid,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'owner@smartenterprise.tz',
    crypt('Owner@1234', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Demo Owner"}',
    false, false, false,
    now(), now(),
    '', '', '', ''
  );

  -- Insert identity for owner
  INSERT INTO auth.identities (
    id, user_id, provider_id,
    identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    owner_uid,
    owner_uid,
    'owner@smartenterprise.tz',
    jsonb_build_object('sub', owner_uid::text, 'email', 'owner@smartenterprise.tz', 'email_verified', true),
    'email',
    now(), now(), now()
  );

  -- Owner profile is created by the trigger automatically,
  -- but upsert here as fallback
  INSERT INTO public.users (id, email, full_name, role, created_at, updated_at)
  VALUES (owner_uid, 'owner@smartenterprise.tz', 'Demo Owner', 'owner', now(), now())
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE 'Owner created: % / Owner@1234', 'owner@smartenterprise.tz';

END $$;


-- ─────────────────────────────────────────────
-- STEP 5: Confirm all auth users have identities
-- ─────────────────────────────────────────────
SELECT
  u.email,
  pu.role,
  u.email_confirmed_at IS NOT NULL AS confirmed,
  (SELECT COUNT(*) FROM auth.identities i WHERE i.user_id = u.id) AS identity_count
FROM auth.users u
LEFT JOIN public.users pu ON pu.id = u.id
WHERE u.email IN ('admin@smartenterprise.tz', 'owner@smartenterprise.tz')
ORDER BY pu.role;


-- ─────────────────────────────────────────────
-- 1. RLS POLICIES — drop old, recreate correctly
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "users_own_profile"  ON users;
DROP POLICY IF EXISTS "users_select_own"   ON users;
DROP POLICY IF EXISTS "users_insert_own"   ON users;
DROP POLICY IF EXISTS "users_update_own"   ON users;

-- SELECT: read own row
CREATE POLICY "users_select_own" ON users
  FOR SELECT USING (auth.uid() = id);

-- INSERT: allow inserting own row (needed for sign-up)
CREATE POLICY "users_insert_own" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- UPDATE: allow updating own row
CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (auth.uid() = id);


-- ─────────────────────────────────────────────
-- 2. TRIGGER: Auto-create public.users on signup
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    -- Preserve admin role for the known admin account; everyone else defaults to 'owner'
    CASE WHEN NEW.email = 'admin@smartenterprise.tz' THEN 'admin' ELSE 'owner' END,
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ─────────────────────────────────────────────
-- 3. CREATE SAMPLE USERS
-- ─────────────────────────────────────────────
DO $$
DECLARE
  admin_id  uuid;
  owner_id  uuid;
BEGIN

  -- ── ADMIN USER ───────────────────────────
  SELECT id INTO admin_id FROM auth.users WHERE email = 'admin@smartenterprise.tz';
  IF admin_id IS NULL THEN
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      aud, role, created_at, updated_at, confirmation_token, recovery_token
    ) VALUES (
      gen_random_uuid(),
      '00000000-0000-0000-0000-000000000000',
      'admin@smartenterprise.tz',
      crypt('Admin@1234', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Super Admin"}',
      'authenticated', 'authenticated',
      now(), now(), '', ''
    ) RETURNING id INTO admin_id;
    RAISE NOTICE 'Admin auth user created: %', admin_id;
  ELSE
    UPDATE auth.users
    SET encrypted_password = crypt('Admin@1234', gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = admin_id;
    RAISE NOTICE 'Admin auth user updated: %', admin_id;
  END IF;

  -- Upsert admin profile
  INSERT INTO public.users (id, email, full_name, role, created_at, updated_at)
  VALUES (admin_id, 'admin@smartenterprise.tz', 'Super Admin', 'admin', now(), now())
  ON CONFLICT (id) DO UPDATE
    SET role = 'admin', email = EXCLUDED.email,
        full_name = EXCLUDED.full_name, updated_at = now();

  -- Also sync by email in case id drifted
  UPDATE public.users SET id = admin_id, role = 'admin', updated_at = now()
  WHERE email = 'admin@smartenterprise.tz' AND id <> admin_id;


  -- ── OWNER USER ───────────────────────────
  SELECT id INTO owner_id FROM auth.users WHERE email = 'owner@smartenterprise.tz';
  IF owner_id IS NULL THEN
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      aud, role, created_at, updated_at, confirmation_token, recovery_token
    ) VALUES (
      gen_random_uuid(),
      '00000000-0000-0000-0000-000000000000',
      'owner@smartenterprise.tz',
      crypt('Owner@1234', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Demo Owner"}',
      'authenticated', 'authenticated',
      now(), now(), '', ''
    ) RETURNING id INTO owner_id;
    RAISE NOTICE 'Owner auth user created: %', owner_id;
  ELSE
    UPDATE auth.users
    SET encrypted_password = crypt('Owner@1234', gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = owner_id;
    RAISE NOTICE 'Owner auth user updated: %', owner_id;
  END IF;

  -- Upsert owner profile
  INSERT INTO public.users (id, email, full_name, role, created_at, updated_at)
  VALUES (owner_id, 'owner@smartenterprise.tz', 'Demo Owner', 'owner', now(), now())
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, updated_at = now();

END $$;


-- ─────────────────────────────────────────────
-- 4. ADMIN BYPASS RLS POLICIES
--    Allow the admin role to see ALL rows in key
--    tables (businesses, users, subscriptions,
--    support_tickets).  Normal owner/staff RLS
--    policies remain unchanged.
-- ─────────────────────────────────────────────

-- businesses: admin can see / manage all
DROP POLICY IF EXISTS "admin_businesses_all" ON businesses;
CREATE POLICY "admin_businesses_all" ON businesses
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- users: admin can see / manage all profiles
DROP POLICY IF EXISTS "admin_users_all" ON users;
CREATE POLICY "admin_users_all" ON users
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- subscriptions: admin can see / manage all
DROP POLICY IF EXISTS "admin_subscriptions_all" ON subscriptions;
CREATE POLICY "admin_subscriptions_all" ON subscriptions
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- support_tickets: admin can see / manage all
DROP POLICY IF EXISTS "admin_support_all" ON support_tickets;
CREATE POLICY "admin_support_all" ON support_tickets
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );


-- ─────────────────────────────────────────────
-- 5. SEED DEMO BUSINESS FOR OWNER
--    The owner account has no business after the
--    DELETE/recreate above.  Create one so the
--    owner skips onboarding and lands directly
--    on the dashboard.
-- ─────────────────────────────────────────────
DO $$
DECLARE
  v_owner_id  uuid;
  v_biz_id    uuid;
BEGIN
  SELECT id INTO v_owner_id FROM public.users WHERE email = 'owner@smartenterprise.tz';

  IF v_owner_id IS NULL THEN
    RAISE NOTICE 'Owner user not found — skipping demo business creation';
    RETURN;
  END IF;

  -- Check whether a business already exists for this owner
  SELECT id INTO v_biz_id FROM public.businesses WHERE owner_id = v_owner_id LIMIT 1;

  IF v_biz_id IS NULL THEN
    -- Create a demo business
    INSERT INTO public.businesses
      (name, category, owner_id, phone, address, currency, is_verified, created_at, updated_at)
    VALUES
      ('Demo Restaurant', 'Restaurant & Food', v_owner_id,
       '+255700000000', 'Dar es Salaam, Tanzania', 'TZS', true, now(), now())
    RETURNING id INTO v_biz_id;

    -- Seed a free subscription
    INSERT INTO public.subscriptions
      (business_id, plan, status, starts_at, expires_at, billing_cycle, created_at)
    VALUES
      (v_biz_id, 'free', 'active', now(), now() + interval '365 days', 'monthly', now());

    RAISE NOTICE 'Demo business created: % for owner %', v_biz_id, v_owner_id;
  ELSE
    RAISE NOTICE 'Owner already has business: % — skipping', v_biz_id;
  END IF;

  -- Always ensure users.business_id points to the correct business
  UPDATE public.users
  SET business_id = v_biz_id, updated_at = now()
  WHERE id = v_owner_id
    AND (business_id IS NULL OR business_id <> v_biz_id);

END $$;


-- ─────────────────────────────────────────────
-- 6. VERIFY — check both users exist correctly
-- ─────────────────────────────────────────────
SELECT
  au.email,
  pu.role,
  pu.full_name,
  (au.id = pu.id) AS ids_match,
  au.email_confirmed_at IS NOT NULL AS email_confirmed
FROM auth.users au
JOIN public.users pu ON au.id = pu.id
WHERE au.email IN ('admin@smartenterprise.tz', 'owner@smartenterprise.tz')
ORDER BY pu.role;
