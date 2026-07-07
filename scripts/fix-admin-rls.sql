-- =============================================
-- SmartEnterprise: Admin RLS Fix
-- Run this in: Supabase Dashboard → SQL Editor
-- =============================================
-- This script adds policies so that users with
-- role = 'admin' can read/update ALL rows in
-- users, businesses, subscriptions, staff, and
-- support_tickets tables.
-- =============================================


-- ─────────────────────────────────────────────
-- STEP 1: is_admin() helper (SECURITY DEFINER
-- so it bypasses RLS without recursion)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  );
$$;


-- ─────────────────────────────────────────────
-- STEP 2: Admin policies on USERS table
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_select_all_users" ON users;
CREATE POLICY "admin_select_all_users" ON users
  FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS "admin_update_all_users" ON users;
CREATE POLICY "admin_update_all_users" ON users
  FOR UPDATE USING (is_admin());


-- ─────────────────────────────────────────────
-- STEP 3: Admin policies on BUSINESSES table
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_select_all_businesses" ON businesses;
CREATE POLICY "admin_select_all_businesses" ON businesses
  FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS "admin_update_all_businesses" ON businesses;
CREATE POLICY "admin_update_all_businesses" ON businesses
  FOR UPDATE USING (is_admin());


-- ─────────────────────────────────────────────
-- STEP 4: Admin policies on SUBSCRIPTIONS table
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_select_all_subscriptions" ON subscriptions;
CREATE POLICY "admin_select_all_subscriptions" ON subscriptions
  FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS "admin_update_all_subscriptions" ON subscriptions;
CREATE POLICY "admin_update_all_subscriptions" ON subscriptions
  FOR UPDATE USING (is_admin());

DROP POLICY IF EXISTS "admin_insert_all_subscriptions" ON subscriptions;
CREATE POLICY "admin_insert_all_subscriptions" ON subscriptions
  FOR INSERT WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_all_subscriptions" ON subscriptions;
CREATE POLICY "admin_delete_all_subscriptions" ON subscriptions
  FOR DELETE USING (is_admin());


-- ─────────────────────────────────────────────
-- STEP 4.1: Admin policies on SALES table
-- (used for admin revenue analytics)
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_select_all_sales" ON sales;
CREATE POLICY "admin_select_all_sales" ON sales
  FOR SELECT USING (is_admin());


-- ─────────────────────────────────────────────
-- STEP 5: Admin policies on STAFF table
-- (used for user-count in admin businesses view)
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_select_all_staff" ON staff;
CREATE POLICY "admin_select_all_staff" ON staff
  FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS "admin_update_all_staff" ON staff;
CREATE POLICY "admin_update_all_staff" ON staff
  FOR UPDATE USING (is_admin());


-- ─────────────────────────────────────────────
-- STEP 6: Admin policies on SUPPORT_TICKETS table
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_select_all_tickets" ON support_tickets;
CREATE POLICY "admin_select_all_tickets" ON support_tickets
  FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS "admin_update_all_tickets" ON support_tickets;
CREATE POLICY "admin_update_all_tickets" ON support_tickets
  FOR UPDATE USING (is_admin());

DROP POLICY IF EXISTS "admin_insert_all_tickets" ON support_tickets;
CREATE POLICY "admin_insert_all_tickets" ON support_tickets
  FOR INSERT WITH CHECK (true); -- anyone (authenticated) can open a ticket


-- ─────────────────────────────────────────────
-- STEP 7: Ensure admin user has role = 'admin'
-- Handles 3 cases:
--   a) Row exists with wrong role → update it
--   b) Row missing (trigger never ran) → insert it
--   c) Email is different → shows all admin.users
-- ─────────────────────────────────────────────

-- Case (a): update existing row
UPDATE public.users
SET role = 'admin', updated_at = now()
WHERE email = 'admin@smartenterprise.tz';

-- Case (b): insert if the auth user exists but public.users row is missing
INSERT INTO public.users (id, email, full_name, role, created_at, updated_at)
SELECT
  a.id,
  a.email,
  COALESCE(a.raw_user_meta_data->>'full_name', a.email),
  'admin',
  a.created_at,
  now()
FROM auth.users a
WHERE a.email = 'admin@smartenterprise.tz'
  AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = a.id);


-- ─────────────────────────────────────────────
-- DIAGNOSTIC: Show all auth users vs public.users
-- (helps you see if the admin row is missing)
-- ─────────────────────────────────────────────
SELECT
  a.email AS auth_email,
  a.id    AS auth_id,
  u.id    AS public_user_id,
  u.role  AS public_role
FROM auth.users a
LEFT JOIN public.users u ON u.id = a.id
ORDER BY a.created_at DESC;


-- ─────────────────────────────────────────────
-- STEP 8: Verify — confirm policies exist
-- ─────────────────────────────────────────────
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  cmd
FROM pg_policies
WHERE tablename IN ('users', 'businesses', 'subscriptions', 'staff', 'support_tickets')
ORDER BY tablename, policyname;


-- ─────────────────────────────────────────────
-- STEP 9: Verify — confirm admin user role
-- ─────────────────────────────────────────────
SELECT id, email, role FROM public.users WHERE role = 'admin';
