-- ============================================================
-- SmartBiz Wallet Module
-- Run this in your Supabase SQL editor to set up the wallet system.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. TABLES
-- ────────────────────────────────────────────────────────────

-- One wallet per business (auto-created on business insert)
CREATE TABLE IF NOT EXISTS wallet_accounts (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  balance           NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  total_collected   NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_withdrawn   NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency          TEXT        NOT NULL DEFAULT 'TZS',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wallet_accounts_business_unique UNIQUE (business_id)
);

-- Every money movement (collection from sale, withdrawal, refund)
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  wallet_id        UUID        NOT NULL REFERENCES wallet_accounts(id) ON DELETE CASCADE,
  type             TEXT        NOT NULL CHECK (type IN ('collection','withdrawal','refund','adjustment')),
  amount           NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  balance_before   NUMERIC(14,2) NOT NULL,
  balance_after    NUMERIC(14,2) NOT NULL,
  reference        TEXT,                          -- sale id or payout reference
  description      TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'completed'
                               CHECK (status IN ('pending','completed','failed','cancelled')),
  initiated_by     UUID        REFERENCES auth.users(id),
  payout_method_id UUID,                          -- set for withdrawals
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Saved payout destinations (bank or mobile money)
CREATE TABLE IF NOT EXISTS payout_methods (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID    NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type           TEXT    NOT NULL CHECK (type IN ('bank','mobile_money')),
  label          TEXT    NOT NULL,           -- "NMB Main Account", "Vodacom M-Pesa"
  account_number TEXT    NOT NULL,           -- bank account no. or phone number
  account_name   TEXT    NOT NULL,           -- account holder name
  bank_code      TEXT,                       -- SNIPPE_BANKS code (bank type)
  bank_name      TEXT,                       -- human-readable bank name
  mobile_network TEXT,                       -- "Vodacom","Airtel","Tigo","Halotel" etc.
  is_default     BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Withdrawal requests with full audit trail
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID    NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  wallet_id        UUID    NOT NULL REFERENCES wallet_accounts(id) ON DELETE CASCADE,
  payout_method_id UUID    NOT NULL REFERENCES payout_methods(id),
  amount           NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  fee              NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_amount       NUMERIC(14,2) NOT NULL,
  status           TEXT    NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','processing','completed','failed')),
  initiated_by     UUID    REFERENCES auth.users(id),
  notes            TEXT,
  processed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_wallet_tx_business  ON wallet_transactions(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_wallet    ON wallet_transactions(wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payout_methods_biz  ON payout_methods(business_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_biz     ON withdrawal_requests(business_id, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- 2. AUTO-CREATE WALLET + SYNC SALES
-- ────────────────────────────────────────────────────────────

-- Auto-create wallet when a new business registers
CREATE OR REPLACE FUNCTION create_wallet_for_business()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO wallet_accounts (business_id)
  VALUES (NEW.id)
  ON CONFLICT (business_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_wallet ON businesses;
CREATE TRIGGER trg_create_wallet
  AFTER INSERT ON businesses
  FOR EACH ROW EXECUTE FUNCTION create_wallet_for_business();

-- Bootstrap wallets for existing businesses (run once)
INSERT INTO wallet_accounts (business_id)
SELECT id FROM businesses
ON CONFLICT (business_id) DO NOTHING;

-- Auto-record wallet collection when a sale is completed
CREATE OR REPLACE FUNCTION record_sale_to_wallet()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_wallet wallet_accounts%ROWTYPE;
BEGIN
  -- Collection: sale just became 'completed'
  IF (TG_OP = 'UPDATE' AND NEW.status = 'completed' AND OLD.status <> 'completed')
  OR (TG_OP = 'INSERT' AND NEW.status = 'completed') THEN

    -- Ensure wallet exists
    INSERT INTO wallet_accounts (business_id)
    VALUES (NEW.business_id)
    ON CONFLICT (business_id) DO NOTHING;

    SELECT * INTO v_wallet
    FROM wallet_accounts WHERE business_id = NEW.business_id;

    INSERT INTO wallet_transactions (
      business_id, wallet_id, type, amount,
      balance_before, balance_after, reference, description, status, initiated_by
    ) VALUES (
      NEW.business_id, v_wallet.id, 'collection', NEW.total,
      v_wallet.balance, v_wallet.balance + NEW.total,
      NEW.id::TEXT, 'Sale #' || NEW.order_number,
      'completed', NEW.cashier_id
    );

    UPDATE wallet_accounts
    SET balance         = balance + NEW.total,
        total_collected = total_collected + NEW.total,
        updated_at      = now()
    WHERE id = v_wallet.id;

  END IF;

  -- Reversal: sale was completed but now cancelled/refunded
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'completed'
     AND NEW.status IN ('cancelled','refunded') THEN

    SELECT * INTO v_wallet
    FROM wallet_accounts WHERE business_id = NEW.business_id;

    IF FOUND THEN
      INSERT INTO wallet_transactions (
        business_id, wallet_id, type, amount,
        balance_before, balance_after, reference, description, status, initiated_by
      ) VALUES (
        NEW.business_id, v_wallet.id, 'refund', NEW.total,
        v_wallet.balance, GREATEST(0, v_wallet.balance - NEW.total),
        NEW.id::TEXT, 'Refund: Sale #' || NEW.order_number,
        'completed', NEW.cashier_id
      );

      UPDATE wallet_accounts
      SET balance         = GREATEST(0, balance - NEW.total),
          total_collected = GREATEST(0, total_collected - NEW.total),
          updated_at      = now()
      WHERE id = v_wallet.id;
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sale_wallet ON sales;
CREATE TRIGGER trg_sale_wallet
  AFTER INSERT OR UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION record_sale_to_wallet();

-- ────────────────────────────────────────────────────────────
-- 3. ROW-LEVEL SECURITY
-- ────────────────────────────────────────────────────────────

ALTER TABLE wallet_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_methods      ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawal_requests ENABLE ROW LEVEL SECURITY;

-- Helper: returns the business_id(s) the calling user belongs to
-- (owner via users table, staff via staff table)
CREATE OR REPLACE FUNCTION user_business_ids()
RETURNS SETOF UUID LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT business_id FROM users  WHERE id = auth.uid() AND business_id IS NOT NULL
  UNION ALL
  SELECT business_id FROM staff  WHERE user_id = auth.uid() AND is_active = true;
$$;

-- Helper: returns true if calling user is the owner of given business
CREATE OR REPLACE FUNCTION is_business_owner(biz_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND business_id = biz_id
      AND role = 'owner'
  );
$$;

-- Wallet accounts: owner + staff can read; only owner can update
DROP POLICY IF EXISTS "wallet_accounts_select" ON wallet_accounts;
CREATE POLICY "wallet_accounts_select" ON wallet_accounts
  FOR SELECT USING (business_id IN (SELECT user_business_ids()));

DROP POLICY IF EXISTS "wallet_accounts_update_owner" ON wallet_accounts;
CREATE POLICY "wallet_accounts_update_owner" ON wallet_accounts
  FOR UPDATE USING (is_business_owner(business_id));

-- Wallet transactions: read for all business members; insert for all
DROP POLICY IF EXISTS "wallet_tx_select" ON wallet_transactions;
CREATE POLICY "wallet_tx_select" ON wallet_transactions
  FOR SELECT USING (business_id IN (SELECT user_business_ids()));

DROP POLICY IF EXISTS "wallet_tx_insert" ON wallet_transactions;
CREATE POLICY "wallet_tx_insert" ON wallet_transactions
  FOR INSERT WITH CHECK (business_id IN (SELECT user_business_ids()));

-- Payout methods: read for all; write only for owner
DROP POLICY IF EXISTS "payout_methods_select" ON payout_methods;
CREATE POLICY "payout_methods_select" ON payout_methods
  FOR SELECT USING (business_id IN (SELECT user_business_ids()));

DROP POLICY IF EXISTS "payout_methods_owner_write" ON payout_methods;
CREATE POLICY "payout_methods_owner_write" ON payout_methods
  FOR ALL USING (is_business_owner(business_id));

-- Withdrawal requests: read for all; insert/update only for owner
DROP POLICY IF EXISTS "withdrawals_select" ON withdrawal_requests;
CREATE POLICY "withdrawals_select" ON withdrawal_requests
  FOR SELECT USING (business_id IN (SELECT user_business_ids()));

DROP POLICY IF EXISTS "withdrawals_owner_insert" ON withdrawal_requests;
CREATE POLICY "withdrawals_owner_insert" ON withdrawal_requests
  FOR INSERT WITH CHECK (is_business_owner(business_id));

DROP POLICY IF EXISTS "withdrawals_owner_update" ON withdrawal_requests;
CREATE POLICY "withdrawals_owner_update" ON withdrawal_requests
  FOR UPDATE USING (is_business_owner(business_id));

-- ────────────────────────────────────────────────────────────
-- 4. SECURE WITHDRAWAL RPC
-- Atomically deducts balance + creates transaction + inserts request
-- Returns error if insufficient balance (never goes negative)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION process_withdrawal(
  p_business_id      UUID,
  p_payout_method_id UUID,
  p_amount           NUMERIC,
  p_fee              NUMERIC DEFAULT 0,
  p_notes            TEXT    DEFAULT NULL
)
RETURNS TABLE (
  ok               BOOLEAN,
  withdrawal_id    UUID,
  new_balance      NUMERIC,
  error_msg        TEXT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_wallet     wallet_accounts%ROWTYPE;
  v_method     payout_methods%ROWTYPE;
  v_net        NUMERIC;
  v_request_id UUID;
BEGIN
  -- Authorisation: caller must be the business owner
  IF NOT is_business_owner(p_business_id) THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::NUMERIC, 'Unauthorised: only the business owner may withdraw.';
    RETURN;
  END IF;

  -- Validate payout method belongs to this business
  SELECT * INTO v_method
  FROM payout_methods
  WHERE id = p_payout_method_id AND business_id = p_business_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::NUMERIC, 'Payout method not found.';
    RETURN;
  END IF;

  -- Lock the wallet row for update
  SELECT * INTO v_wallet
  FROM wallet_accounts
  WHERE business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::NUMERIC, 'Wallet not found.';
    RETURN;
  END IF;

  v_net := p_amount - p_fee;

  -- Sufficient balance check
  IF v_wallet.balance < p_amount THEN
    RETURN QUERY SELECT false, NULL::UUID, v_wallet.balance,
      'Insufficient balance. Available: ' || v_wallet.balance::TEXT || ' TZS';
    RETURN;
  END IF;

  -- Deduct balance
  UPDATE wallet_accounts
  SET balance        = balance - p_amount,
      total_withdrawn = total_withdrawn + p_amount,
      updated_at     = now()
  WHERE id = v_wallet.id;

  -- Record transaction
  INSERT INTO wallet_transactions (
    business_id, wallet_id, type, amount,
    balance_before, balance_after, description, status,
    initiated_by, payout_method_id
  ) VALUES (
    p_business_id, v_wallet.id, 'withdrawal', p_amount,
    v_wallet.balance, v_wallet.balance - p_amount,
    'Withdrawal to ' || v_method.label, 'completed',
    auth.uid(), p_payout_method_id
  );

  -- Insert withdrawal request
  INSERT INTO withdrawal_requests (
    business_id, wallet_id, payout_method_id,
    amount, fee, net_amount, status, initiated_by, notes
  ) VALUES (
    p_business_id, v_wallet.id, p_payout_method_id,
    p_amount, p_fee, v_net, 'processing', auth.uid(), p_notes
  )
  RETURNING id INTO v_request_id;

  RETURN QUERY SELECT true, v_request_id, (v_wallet.balance - p_amount), NULL::TEXT;
END;
$$;
