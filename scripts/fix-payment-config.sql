-- ============================================================
-- FIX: Create business_payment_config table + RLS policies
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- Safe to run multiple times (all statements are idempotent).
-- ============================================================

-- Helper functions (recreate safely)
create or replace function is_admin()
returns boolean language sql stable security definer as $$
  select exists (select 1 from users where id = auth.uid() and role = 'admin');
$$;

create or replace function owns_business(bid uuid)
returns boolean language sql stable security definer as $$
  select exists (select 1 from businesses where id = bid and owner_id = auth.uid());
$$;

-- ── Table ────────────────────────────────────────────────────
create table if not exists business_payment_config (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null unique references businesses(id) on delete cascade,
  payout_method       text not null default 'mobile'
                        check (payout_method in ('mobile', 'bank')),
  receive_phone       text,
  receive_name        text,
  receive_email       text,
  bank_code           text,
  bank_account        text,
  bank_account_name   text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ── updated_at trigger ───────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trg_biz_cfg_updated_at on business_payment_config;
create trigger trg_biz_cfg_updated_at
  before update on business_payment_config
  for each row execute procedure set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────
alter table business_payment_config enable row level security;

-- Drop and recreate policies cleanly
drop policy if exists "bpc_owner_all"   on business_payment_config;
drop policy if exists "bpc_admin_read"  on business_payment_config;

-- Business owner: full CRUD on their own row
create policy "bpc_owner_all"
  on business_payment_config for all
  using  (owns_business(business_id))
  with check (owns_business(business_id));

-- Admin: read-only
create policy "bpc_admin_read"
  on business_payment_config for select
  using (is_admin());

-- ── Grants ───────────────────────────────────────────────────
grant select, insert, update, delete on business_payment_config to authenticated;
grant select on business_payment_config to service_role;

-- ============================================================
-- FIX: Add missing columns to sales table
-- These columns are required by the charge-customer flow.
-- ============================================================
alter table sales
  add column if not exists mobile_phone text,
  add column if not exists payer_name   text;
