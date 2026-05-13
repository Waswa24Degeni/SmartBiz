-- SmartBiz Database Schema for Supabase PostgreSQL
-- Run this in your Supabase SQL editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- =============================================
-- USERS TABLE
-- =============================================
create table if not exists users (
  id uuid primary key default uuid_generate_v4(),
  email text not null unique,
  full_name text not null,
  phone text,
  avatar_url text,
  role text not null default 'owner' check (role in ('owner', 'staff', 'admin')),
  business_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================
-- BUSINESSES TABLE
-- =============================================
create table if not exists businesses (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  category text not null default 'Other',
  owner_id uuid not null references users(id),
  logo_url text,
  phone text,
  email text,
  address text,
  currency text not null default 'TZS',
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add FK from users to businesses
alter table users add constraint fk_users_business
  foreign key (business_id) references businesses(id) on delete set null;

-- =============================================
-- SUBSCRIPTIONS TABLE
-- =============================================
create table if not exists subscriptions (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'starter', 'business', 'premium')),
  status text not null default 'active' check (status in ('active', 'expired', 'trial', 'cancelled')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'yearly')),
  created_at timestamptz not null default now()
);

-- =============================================
-- CATEGORIES TABLE
-- =============================================
create table if not exists categories (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  image_url text,
  description text,
  created_at timestamptz not null default now()
);

-- =============================================
-- PRODUCTS TABLE
-- =============================================
create table if not exists products (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  category_id uuid references categories(id) on delete set null,
  name text not null,
  description text,
  image_url text,
  purchase_price numeric(12,2) not null default 0,
  selling_price numeric(12,2) not null default 0,
  stock_quantity integer not null default 0,
  low_stock_threshold integer not null default 5,
  unit text not null default 'piece',
  barcode text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================
-- CUSTOMERS TABLE
-- =============================================
create table if not exists customers (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  full_name text not null,
  phone text,
  email text,
  address text,
  credit_balance numeric(12,2) not null default 0,
  loyalty_points integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================
-- SALES TABLE
-- =============================================
create table if not exists sales (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  cashier_id uuid not null references users(id),
  order_number text not null,
  table_number text,
  guests integer default 1,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled', 'refunded')),
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'partial', 'overdue')),
  payment_method text not null default 'cash' check (payment_method in ('cash', 'mobile_money', 'bank_card', 'credit')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================
-- SALE ITEMS TABLE
-- =============================================
create table if not exists sale_items (
  id uuid primary key default uuid_generate_v4(),
  sale_id uuid not null references sales(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity integer not null default 1,
  unit_price numeric(12,2) not null,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null
);

-- =============================================
-- INVENTORY LOGS TABLE
-- =============================================
create table if not exists inventory_logs (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  product_id uuid not null references products(id),
  change_type text not null check (change_type in ('sale', 'restock', 'adjustment', 'return')),
  quantity_change integer not null,
  stock_after integer not null,
  note text,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

-- =============================================
-- STAFF TABLE
-- =============================================
create table if not exists staff (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references users(id),
  role text not null default 'cashier' check (role in ('manager', 'cashier', 'waiter')),
  shift_start text,
  shift_end text,
  is_active boolean not null default true,
  permissions jsonb default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- =============================================
-- NOTIFICATIONS TABLE
-- =============================================
create table if not exists notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  body text not null,
  type text not null check (type in ('low_stock', 'subscription', 'sales', 'system', 'payment')),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- =============================================
-- SETTINGS TABLE
-- =============================================
create table if not exists settings (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade unique,
  save_payment_history boolean not null default true,
  payment_bank_card boolean not null default true,
  payment_cash boolean not null default true,
  notify_new_messages_push boolean not null default true,
  notify_new_messages_email boolean not null default false,
  notify_weekly_report boolean not null default true,
  notify_billing_alert boolean not null default true,
  theme text not null default 'light',
  language text not null default 'English',
  currency text not null default 'TZS',
  updated_at timestamptz not null default now()
);

-- =============================================
-- ACTIVITY LOGS TABLE
-- =============================================
create table if not exists activity_logs (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid references users(id),
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- =============================================
-- SUPPORT TICKETS TABLE
-- =============================================
create table if not exists support_tickets (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id),
  subject text not null,
  body text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

alter table users enable row level security;
alter table businesses enable row level security;
alter table subscriptions enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table customers enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;
alter table inventory_logs enable row level security;
alter table staff enable row level security;
alter table notifications enable row level security;
alter table settings enable row level security;
alter table activity_logs enable row level security;
alter table support_tickets enable row level security;

-- Users can read/update their own profile
create policy "users_own_profile" on users
  for all using (auth.uid() = id);

-- Businesses: owner can do everything
create policy "business_owner_all" on businesses
  for all using (owner_id = auth.uid());

-- Helper: get user's business_id
create or replace function get_my_business_id()
returns uuid language sql stable
as $$ select business_id from users where id = auth.uid() $$;

-- Business data policies (products, categories, sales, customers, staff, etc.)
create policy "business_data_policy" on products
  for all using (business_id = get_my_business_id());

create policy "business_data_policy" on categories
  for all using (business_id = get_my_business_id());

create policy "business_data_policy" on customers
  for all using (business_id = get_my_business_id());

create policy "business_data_policy" on sales
  for all using (business_id = get_my_business_id());

create policy "business_data_policy" on sale_items
  for all using (
    sale_id in (select id from sales where business_id = get_my_business_id())
  );

create policy "business_data_policy" on inventory_logs
  for all using (business_id = get_my_business_id());

create policy "business_data_policy" on staff
  for all using (business_id = get_my_business_id());

create policy "business_data_policy" on settings
  for all using (business_id = get_my_business_id());

create policy "business_data_policy" on subscriptions
  for all using (business_id = get_my_business_id());

create policy "notifications_own" on notifications
  for all using (user_id = auth.uid());

create policy "support_tickets_own" on support_tickets
  for all using (user_id = auth.uid());

-- =============================================
-- INDEXES for performance
-- =============================================
create index if not exists idx_products_business on products(business_id);
create index if not exists idx_sales_business on sales(business_id);
create index if not exists idx_sales_created on sales(created_at desc);
create index if not exists idx_sale_items_sale on sale_items(sale_id);
create index if not exists idx_categories_business on categories(business_id);
create index if not exists idx_customers_business on customers(business_id);
create index if not exists idx_inventory_product on inventory_logs(product_id);
create index if not exists idx_notifications_user on notifications(user_id, is_read);
