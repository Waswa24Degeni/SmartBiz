-- Migration for SmartEnterprise TZ Premium Features
-- Run this in the Supabase SQL Editor

-- 1. Create missing tables if they don't exist

-- Expenses
CREATE TABLE IF NOT EXISTS public.expense_categories (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  title text NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  description text,
  receipt_url text,
  expense_date date DEFAULT CURRENT_DATE NOT NULL,
  supplier text,
  payment_method text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Sales & Sale Items (Assuming POS creates sales)
CREATE TABLE IF NOT EXISTS public.sales (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_id uuid, -- Assuming customers table exists
  cashier_id uuid REFERENCES auth.users(id),
  order_number text NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  subtotal numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'paid',
  payment_method text NOT NULL DEFAULT 'cash',
  notes text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.sale_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit_price numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure tax column exists on sales (in case the table already existed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'tax'
  ) THEN
    ALTER TABLE public.sales ADD COLUMN tax numeric NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Ensure created_at column exists on sale_items (in case the table already existed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sale_items' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.sale_items ADD COLUMN created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL;
  END IF;
END $$;


-- Wallet Transactions
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  wallet_id uuid, -- Assuming wallet_accounts table exists or wallet_id references something
  type text NOT NULL, -- 'collection', 'withdrawal', 'refund', 'adjustment'
  amount numeric NOT NULL,
  balance_before numeric NOT NULL DEFAULT 0,
  balance_after numeric NOT NULL DEFAULT 0,
  reference text,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  initiated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  type text NOT NULL, -- 'low_stock', 'sales', 'system', etc.
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure business_id column exists on notifications (in case the table already existed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'business_id'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE;
  END IF;
END $$;


-- Activity Logs
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  details jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create updated_at triggers if they don't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
    AND table_name IN ('expense_categories', 'expenses', 'sales')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON %I', t);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', t);
  END LOOP;
END;
$$;

-- 3. Enable RLS on new tables
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies (Assuming users have business_id in users table, standard Supabase approach)
-- Simplistic approach: Owner/Staff can access data for their business_id
-- We'll use a helper function to get current user's business_id or assume application filters correctly
-- if a proper business context function is defined.
-- Here we'll just allow authenticated users to do operations if they belong to the business.

-- Helper to check user business (if public.users stores business_id)
-- CREATE OR REPLACE FUNCTION get_user_business_id() RETURNS uuid AS $$
--   SELECT business_id FROM public.users WHERE id = auth.uid() LIMIT 1;
-- $$ LANGUAGE sql SECURITY DEFINER;

-- For brevity and robustness, we use subqueries in policies matching `auth.uid()` against `public.users` or `public.businesses`
-- Note: Replace with actual business validation logic if different in existing codebase.

CREATE POLICY "Enable all access for business members" ON public.expense_categories
  FOR ALL TO authenticated
  USING (business_id IN (SELECT business_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Enable all access for business members" ON public.expenses
  FOR ALL TO authenticated
  USING (business_id IN (SELECT business_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Enable all access for business members" ON public.sales
  FOR ALL TO authenticated
  USING (business_id IN (SELECT business_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Enable all access for business members" ON public.sale_items
  FOR ALL TO authenticated
  USING (sale_id IN (SELECT id FROM public.sales WHERE business_id IN (SELECT business_id FROM public.users WHERE id = auth.uid())));

CREATE POLICY "Enable all access for business members" ON public.wallet_transactions
  FOR ALL TO authenticated
  USING (business_id IN (SELECT business_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Enable read for own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR business_id IN (SELECT business_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Enable update for own notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Enable all access for business members" ON public.activity_logs
  FOR ALL TO authenticated
  USING (business_id IN (SELECT business_id FROM public.users WHERE id = auth.uid()));

-- 5. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_expenses_business_id ON public.expenses(business_id);
CREATE INDEX IF NOT EXISTS idx_sales_business_id ON public.sales(business_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_business_id ON public.wallet_transactions(business_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_business_id ON public.activity_logs(business_id);

-- ============================================================
-- SmartEnterprise TZ — Notification Auto-Generation Triggers
-- ============================================================

-- Helper: insert a notification for the business owner
CREATE OR REPLACE FUNCTION notify_business_owner(
  p_business_id uuid,
  p_title text,
  p_body text,
  p_type text
) RETURNS void AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  SELECT owner_id INTO v_owner_id
    FROM public.businesses
   WHERE id = p_business_id
   LIMIT 1;

  IF v_owner_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, business_id, title, body, type)
    VALUES (v_owner_id, p_business_id, p_title, p_body, p_type);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 1. Low Stock Alert (after sale_items insert) ───────────
CREATE OR REPLACE FUNCTION check_low_stock_after_sale()
RETURNS TRIGGER AS $$
DECLARE
  v_product RECORD;
  v_business_id uuid;
BEGIN
  -- Get the product details
  SELECT p.id, p.name, p.stock_quantity, p.low_stock_threshold, p.business_id
    INTO v_product
    FROM public.products p
   WHERE p.id = NEW.product_id;

  IF v_product IS NULL THEN
    RETURN NEW;
  END IF;

  v_business_id := v_product.business_id;

  -- Check if stock is now at or below threshold
  IF v_product.stock_quantity <= v_product.low_stock_threshold
     AND v_product.stock_quantity > 0 THEN
    PERFORM notify_business_owner(
      v_business_id,
      'Low Stock Alert',
      v_product.name || ' has only ' || v_product.stock_quantity || ' units left (threshold: ' || v_product.low_stock_threshold || ').',
      'low_stock'
    );
  ELSIF v_product.stock_quantity <= 0 THEN
    PERFORM notify_business_owner(
      v_business_id,
      'Out of Stock!',
      v_product.name || ' is now out of stock. Restock immediately.',
      'low_stock'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_low_stock_after_sale ON public.sale_items;
CREATE TRIGGER trg_low_stock_after_sale
  AFTER INSERT ON public.sale_items
  FOR EACH ROW
  EXECUTE FUNCTION check_low_stock_after_sale();


-- ─── 2. New Sale Notification ───────────────────────────────
CREATE OR REPLACE FUNCTION notify_new_sale()
RETURNS TRIGGER AS $$
DECLARE
  v_cashier_name text;
BEGIN
  -- Only notify on completed sales
  IF NEW.status = 'completed' AND (OLD IS NULL OR OLD.status != 'completed') THEN
    SELECT full_name INTO v_cashier_name
      FROM public.users
     WHERE id = NEW.cashier_id;

    PERFORM notify_business_owner(
      NEW.business_id,
      'New Sale Completed',
      'Order ' || NEW.order_number || ' completed by ' || COALESCE(v_cashier_name, 'staff') || ' — TZS ' || TRIM(to_char(NEW.total, '999,999,999')),
      'sales'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_new_sale ON public.sales;
CREATE TRIGGER trg_notify_new_sale
  AFTER INSERT OR UPDATE ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_sale();


-- ─── 3. New Expense Notification ────────────────────────────
CREATE OR REPLACE FUNCTION notify_new_expense()
RETURNS TRIGGER AS $$
DECLARE
  v_creator_name text;
BEGIN
  SELECT full_name INTO v_creator_name
    FROM public.users
   WHERE id = NEW.created_by;

  PERFORM notify_business_owner(
    NEW.business_id,
    'New Expense Recorded',
    COALESCE(v_creator_name, 'Staff') || ' recorded "' || NEW.title || '" — TZS ' || TRIM(to_char(NEW.amount, '999,999,999')),
    'system'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_new_expense ON public.expenses;
CREATE TRIGGER trg_notify_new_expense
  AFTER INSERT ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_expense();


-- ─── 4. New Customer Notification ───────────────────────────
CREATE OR REPLACE FUNCTION notify_new_customer()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM notify_business_owner(
    NEW.business_id,
    'New Customer Added',
    NEW.full_name || COALESCE(' (' || NEW.phone || ')', '') || ' was added to your customer list.',
    'system'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_new_customer ON public.customers;
CREATE TRIGGER trg_notify_new_customer
  AFTER INSERT ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_customer();


-- ─── 5. Seed Default Expense Categories ─────────────────────
-- This function seeds default categories for a business if none exist.
CREATE OR REPLACE FUNCTION seed_expense_categories(p_business_id uuid)
RETURNS void AS $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
    FROM public.expense_categories
   WHERE business_id = p_business_id;

  IF v_count = 0 THEN
    INSERT INTO public.expense_categories (business_id, name, description) VALUES
      (p_business_id, 'Rent',         'Monthly rent and lease payments'),
      (p_business_id, 'Salary',       'Staff wages and salaries'),
      (p_business_id, 'Transport',    'Transportation and delivery costs'),
      (p_business_id, 'Utilities',    'Electricity, water, gas bills'),
      (p_business_id, 'Internet',     'Internet and phone bills'),
      (p_business_id, 'Marketing',    'Advertising and marketing expenses'),
      (p_business_id, 'Maintenance',  'Repairs and equipment maintenance'),
      (p_business_id, 'Fuel',         'Fuel and petrol costs'),
      (p_business_id, 'Miscellaneous','Other miscellaneous expenses');
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 6. Auto-seed categories when a business is created ─────
CREATE OR REPLACE FUNCTION auto_seed_on_business_create()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM seed_expense_categories(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_seed_expense_cats ON public.businesses;
CREATE TRIGGER trg_seed_expense_cats
  AFTER INSERT ON public.businesses
  FOR EACH ROW
  EXECUTE FUNCTION auto_seed_on_business_create();


-- ─── 7. Backfill Default Expense Categories for Existing Businesses ───
DO $$
DECLARE
  b RECORD;
BEGIN
  FOR b IN SELECT id FROM public.businesses LOOP
    PERFORM seed_expense_categories(b.id);
  END LOOP;
END $$;


-- ─── 8. Add notes column to customers if missing ────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'notes'
  ) THEN
    ALTER TABLE public.customers ADD COLUMN notes text;
  END IF;
END $$;
