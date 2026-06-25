-- ============================================================
-- SmartBiz TZ — Notification Auto-Generation Triggers
-- Run in Supabase SQL Editor
-- ============================================================

-- Ensure new tables exist
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
-- Call it from the application or run once per business.
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


-- ─── 7. Add notes column to customers if missing ────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'notes'
  ) THEN
    ALTER TABLE public.customers ADD COLUMN notes text;
  END IF;
END $$;
