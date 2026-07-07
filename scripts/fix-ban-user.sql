-- =============================================
-- SmartEnterprise: Fix Ban User Feature
-- Run this in: Supabase Dashboard → SQL Editor
-- =============================================
-- The users.role CHECK constraint only allowed
-- ('owner', 'staff', 'admin'). This migration
-- drops that constraint and recreates it with
-- 'banned' included so admins can ban users.
-- =============================================

-- Drop the old check constraint
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

-- Add new constraint that includes 'banned'
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('owner', 'staff', 'admin', 'banned'));
