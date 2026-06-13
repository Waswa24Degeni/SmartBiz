-- ============================================================
-- Admin Settings Tables
-- Run this in Supabase SQL Editor → smartbiz-tz project
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. system_config  (key-value store for admin settings)
-- ─────────────────────────────────────────────────────────────
create table if not exists system_config (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

-- Seed default values (safe to re-run)
insert into system_config (key, value)
values
  ('app_name',                   'SmartBiz TZ'),
  ('support_email',              'support@smartbiz.tz'),
  ('support_phone',              '+255 000 000 000'),
  ('default_currency',           'TZS'),
  ('allow_new_registrations',    'true'),
  ('require_email_verification', 'false'),
  ('trial_days',                 '14'),
  ('auto_expire_subscriptions',  'false'),
  ('maintenance_mode',           'false')
on conflict (key) do nothing;

-- RLS: only service_role or admin users can write; authenticated users can read
alter table system_config enable row level security;

drop policy if exists "admin_read_system_config" on system_config;
create policy "admin_read_system_config"
  on system_config for select
  using (true);

drop policy if exists "admin_write_system_config" on system_config;
create policy "admin_write_system_config"
  on system_config for all
  using (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role = 'admin'
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 2. subscription_plans  (editable plan definitions)
-- ─────────────────────────────────────────────────────────────
create table if not exists subscription_plans (
  id         text primary key,   -- 'free' | 'starter' | 'business' | 'premium'
  name       text not null,
  price      integer not null default 0,
  currency   text not null default 'TZS',
  period     text not null default '/month',
  color      text not null default '#6B7280',
  bg_color   text not null default '#F3F4F6',
  features   jsonb not null default '[]',
  is_popular boolean not null default false,
  is_active  boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed default plan definitions
insert into subscription_plans (id, name, price, period, color, bg_color, features, is_popular, sort_order)
values
  ('free',     'Free',     0,     'Forever', '#6B7280', '#F3F4F6',
   '["1 Business","1 user","100 products","Basic reports","Mobile app"]'::jsonb,
   false, 0),
  ('starter',  'Starter',  15000, '/month',  '#3B82F6', '#EFF6FF',
   '["1 Business","3 users","500 products","Advanced reports","Email support"]'::jsonb,
   false, 1),
  ('business', 'Business', 35000, '/month',  '#10B981', '#ECFDF5',
   '["2 Businesses","10 users","Unlimited products","Full analytics","Priority support","Staff management"]'::jsonb,
   true,  2),
  ('premium',  'Premium',  80000, '/month',  '#F59E0B', '#FFFBEB',
   '["2 Businesses","Unlimited users","Unlimited products","Custom reports","24/7 support","API access","Dedicated manager"]'::jsonb,
   false, 3)
on conflict (id) do nothing;

-- RLS
alter table subscription_plans enable row level security;

drop policy if exists "anyone_read_plans" on subscription_plans;
create policy "anyone_read_plans"
  on subscription_plans for select
  using (true);

drop policy if exists "admin_write_plans" on subscription_plans;
create policy "admin_write_plans"
  on subscription_plans for all
  using (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role = 'admin'
    )
  );
