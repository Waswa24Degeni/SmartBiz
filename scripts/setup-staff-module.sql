-- ============================================================
-- Staff Module RLS Setup
-- Run in Supabase SQL Editor (once)
-- ============================================================

-- Owner helper (safe and reusable)
create or replace function is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from users where id = auth.uid() and role = 'owner'
  );
$$;

-- Owners can read staff users in their own business
-- (needed for Staff management screen joins and email lookup)
drop policy if exists "owner_select_business_users" on users;
create policy "owner_select_business_users"
  on users for select
  using (
    is_owner()
    and (
      exists (
        select 1
        from businesses b
        where b.id = users.business_id
          and b.owner_id = auth.uid()
      )
      or users.business_id is null
    )
  );

-- Owners can update users in their business
-- (needed to assign role=staff and business_id)
drop policy if exists "owner_update_business_users" on users;
create policy "owner_update_business_users"
  on users for update
  using (
    is_owner()
    and exists (
      select 1
      from businesses b
      where b.id = users.business_id
        and b.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from businesses b
      where b.id = users.business_id
        and b.owner_id = auth.uid()
    )
  );

-- Owners can claim an unassigned user by email (business_id is null)
-- so they can add existing registered users as staff.
drop policy if exists "owner_claim_unassigned_user" on users;
create policy "owner_claim_unassigned_user"
  on users for update
  using (
    is_owner() and business_id is null
  )
  with check (
    exists (
      select 1
      from businesses b
      where b.id = users.business_id
        and b.owner_id = auth.uid()
    )
  );

-- staff table is already covered by business_data_policy in supabase_schema.sql.
-- If missing in your DB, ensure this exists:
-- create policy "business_data_policy" on staff
--   for all using (business_id = get_my_business_id());
