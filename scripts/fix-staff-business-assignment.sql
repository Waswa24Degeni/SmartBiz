-- Fix for Staff Assignment
-- 1. Create a secure function that allows business owners to update the 'users' table 
--    for their new staff members. Regular RLS prevents owners from updating other users' profiles.
CREATE OR REPLACE FUNCTION assign_staff_to_business(p_user_id uuid, p_business_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with elevated privileges to bypass the 'users_own_profile' RLS policy
AS $$
BEGIN
  -- Verify that the caller is the owner of the target business
  IF NOT EXISTS (SELECT 1 FROM businesses WHERE id = p_business_id AND owner_id = auth.uid()) THEN
    -- If the caller is a system admin, allow it. Otherwise deny.
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin') THEN
      RAISE EXCEPTION 'Not authorized to assign staff to this business';
    END IF;
  END IF;

  -- Update the target user's profile
  UPDATE users
  SET business_id = p_business_id,
      role = p_role,
      updated_at = NOW()
  WHERE id = p_user_id;
END;
$$;

-- 2. Add an RLS policy so that staff can read their own business data
-- Without this, staff get redirected to the Onboarding screen because they can't fetch their business.
-- We must also make get_my_business_id() SECURITY DEFINER to prevent an infinite recursion loop 
-- with the users table policies.

CREATE OR REPLACE FUNCTION get_my_business_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ 
  SELECT business_id FROM users WHERE id = auth.uid() 
$$;

DROP POLICY IF EXISTS "staff_read_business" ON businesses;
CREATE POLICY "staff_read_business" ON businesses
  FOR SELECT USING (id = get_my_business_id());
