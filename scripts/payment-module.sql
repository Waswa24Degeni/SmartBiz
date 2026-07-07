-- ============================================================
-- PAYMENT MODULE — SmartEnterprise TZ  (fintech-grade revision)
-- ============================================================
-- SECURITY NOTES:
--   • NO API keys or webhook secrets are stored in this schema.
--     All credentials live exclusively in Supabase Vault /
--     Edge Function environment variables (SNIPPE_API_KEY,
--     SNIPPE_WEBHOOK_SECRET).
--   • The frontend never calls Snippe directly. It calls
--     Edge Functions which hold the secrets.
--   • RLS restricts every table to the minimum required access.
--   • An audit log captures every payment state transition.
-- ============================================================

-- ============================================================
-- EXTENSIONS
-- ============================================================
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";   -- gen_random_uuid(), digest()

-- ============================================================
-- HELPER: is_admin()
-- Avoids repeating the admin check in every policy.
-- ============================================================
create or replace function is_admin()
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from users
    where id  = auth.uid()
      and role = 'admin'
  );
$$;

-- ============================================================
-- HELPER: owns_business(business_id)
-- ============================================================
create or replace function owns_business(bid uuid)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from businesses
    where id       = bid
      and owner_id = auth.uid()
  );
$$;

-- ============================================================
-- 1. PAYMENT GATEWAY CONFIG (admin-only)
--    Stores ONLY non-secret configuration — no API keys.
--    Secrets are stored in Supabase Vault (see notes below).
-- ============================================================
create table if not exists payment_gateway_config (
  id                        uuid primary key default gen_random_uuid(),

  -- Which gateway (extensible for future gateways)
  gateway                   text not null default 'snippe'
                              check (gateway in ('snippe')),

  -- Live / sandbox toggle
  is_live                   boolean not null default false,

  -- Receive-account details (where admin collects plan fees)
  receive_method            text not null default 'mobile'
                              check (receive_method in ('mobile', 'bank')),
  receive_phone             text,          -- 255XXXXXXXXX
  receive_name              text,
  receive_email             text,
  receive_bank_code         text,
  receive_bank_account      text,
  receive_bank_account_name text,

  -- Webhook URL registered with Snippe (set once)
  webhook_url               text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Singleton: only one global config row
create unique index if not exists payment_gateway_config_singleton
  on payment_gateway_config ((true));

-- ============================================================
-- 2. BUSINESS PAYMENT CONFIG
--    Per-business receive account for POS customer payments.
--    NO API keys here — businesses always use the platform key.
-- ============================================================
create table if not exists business_payment_config (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null unique references businesses(id) on delete cascade,

  payout_method   text not null default 'mobile'
                    check (payout_method in ('mobile', 'bank')),

  -- Mobile money
  receive_phone   text,
  receive_name    text,
  receive_email   text,

  -- Bank disbursement
  bank_code           text,
  bank_account        text,
  bank_account_name   text,

  -- Optional: business can supply their own Snippe key
  -- IMPORTANT: this boolean flag is stored; the actual key goes
  -- in Supabase Vault secret "snippe_key_<business_id>" and is
  -- fetched server-side only inside Edge Functions.
  use_own_snippe_key  boolean not null default false,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- 3. PAYMENTS (unified ledger)
--    One row per payment attempt.
--    Covers: subscription, pos, payout (withdrawals).
-- ============================================================
create table if not exists payments (
  id                uuid primary key default gen_random_uuid(),

  -- Ownership
  business_id       uuid not null references businesses(id) on delete restrict,

  -- Classification
  payment_type      text not null
                      check (payment_type in ('subscription', 'pos', 'payout')),

  -- Amount
  amount            bigint not null check (amount > 0),  -- TZS, no fractional
  fee_amount        bigint not null default 0 check (fee_amount >= 0),
  currency          text   not null default 'TZS',

  -- Channel
  channel           text not null
                      check (channel in ('mobile', 'bank')),

  -- Status lifecycle
  status            text not null default 'pending'
                      check (status in (
                        'pending',    -- record created, not yet sent to gateway
                        'processing', -- USSD push sent / bank transfer initiated
                        'completed',  -- confirmed by Snippe webhook
                        'failed',     -- gateway returned failure
                        'expired',    -- timed out without confirmation
                        'refunded'    -- future-use
                      )),

  -- Payer (for collection/subscription payments)
  payer_phone       text,
  payer_name        text,
  payer_email       text,
  payer_bank_code   text,
  payer_bank_account text,

  -- Recipient (for payout payments)
  recipient_phone       text,
  recipient_name        text,
  recipient_bank_code   text,
  recipient_bank_account text,

  -- Gateway references
  gateway               text not null default 'snippe',
  gateway_reference     text unique,          -- Snippe reference UUID
  gateway_external_ref  text,                 -- Snippe external_reference
  idempotency_key       text unique not null, -- client-generated, prevents duplicates

  -- App-level links
  subscription_id   uuid references subscriptions(id) on delete set null,
  pos_order_id      uuid,                     -- references orders(id) when POS table exists

  -- Metadata (non-secret, diagnostic info)
  metadata          jsonb not null default '{}',

  -- Error detail (populated on failure)
  error_code        text,
  error_message     text,

  -- Timing
  initiated_at      timestamptz not null default now(),
  processing_at     timestamptz,
  completed_at      timestamptz,
  expired_at        timestamptz,

  -- Who initiated (for audit: 'system', 'admin:<uid>', 'owner:<uid>')
  initiated_by      text not null default 'system'
);

-- Performance indexes
create index if not exists idx_payments_business     on payments(business_id);
create index if not exists idx_payments_status       on payments(status);
create index if not exists idx_payments_type_status  on payments(payment_type, status);
create index if not exists idx_payments_gateway_ref  on payments(gateway_reference);
create index if not exists idx_payments_initiated_at on payments(initiated_at desc);
create index if not exists idx_payments_sub_id       on payments(subscription_id) where subscription_id is not null;

-- ============================================================
-- 4. PAYMENT AUDIT LOG
--    Immutable append-only history of every status change.
-- ============================================================
create table if not exists payment_audit_log (
  id          uuid primary key default gen_random_uuid(),
  payment_id  uuid not null references payments(id) on delete cascade,

  event       text not null,   -- e.g. 'status_changed', 'webhook_received', 'retry'
  from_status text,
  to_status   text,

  -- Who/what triggered the change
  actor       text,            -- 'webhook', 'admin:<uid>', 'edge_fn:initiate-payment'

  -- Full event payload (webhook body, error detail, etc.)
  payload     jsonb not null default '{}',

  created_at  timestamptz not null default now()
);

-- Audit log is append-only — no updates/deletes allowed by anyone
create index if not exists idx_audit_payment  on payment_audit_log(payment_id);
create index if not exists idx_audit_created  on payment_audit_log(created_at desc);

-- ============================================================
-- 5. TRIGGER: auto-update updated_at
-- ============================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_gateway_cfg_updated_at
  before update on payment_gateway_config
  for each row execute procedure set_updated_at();

create trigger trg_biz_cfg_updated_at
  before update on business_payment_config
  for each row execute procedure set_updated_at();

-- ============================================================
-- 6. TRIGGER: auto-write audit log on payment status change
-- ============================================================
create or replace function payment_status_audit()
returns trigger language plpgsql
security definer
as $$
begin
  if old.status is distinct from new.status then
    insert into payment_audit_log (
      payment_id, event, from_status, to_status, actor, payload
    ) values (
      new.id,
      'status_changed',
      old.status,
      new.status,
      coalesce(new.initiated_by, 'system'),
      jsonb_build_object(
        'gateway_reference', new.gateway_reference,
        'error_code',        new.error_code,
        'error_message',     new.error_message,
        'ts',                now()
      )
    );
  end if;
  return new;
end;
$$;

create trigger trg_payment_audit
  after update on payments
  for each row execute procedure payment_status_audit();

-- ============================================================
-- 7. ROW LEVEL SECURITY
-- ============================================================

-- ── payment_gateway_config ──────────────────────────────────
alter table payment_gateway_config enable row level security;

-- Only admins may read or write global gateway config
create policy "pgc_admin_all"
  on payment_gateway_config for all
  using  (is_admin())
  with check (is_admin());

-- Edge Functions use service_role key — bypasses RLS by design.

-- ── business_payment_config ─────────────────────────────────
alter table business_payment_config enable row level security;

-- Business owner: full access to their own row
create policy "bpc_owner_all"
  on business_payment_config for all
  using  (owns_business(business_id))
  with check (owns_business(business_id));

-- Admin: read-only (they don't need to edit owner configs)
create policy "bpc_admin_read"
  on business_payment_config for select
  using (is_admin());

-- ── payments ────────────────────────────────────────────────
alter table payments enable row level security;

-- Owner sees only their business's payments
create policy "pay_owner_select"
  on payments for select
  using (owns_business(business_id));

-- Owner may INSERT their own payment records
-- (Edge Function uses service_role, but we allow owner-initiated POS too)
create policy "pay_owner_insert"
  on payments for insert
  with check (owns_business(business_id));

-- Owner may NOT update or delete payments (immutability)
-- Admins see everything
create policy "pay_admin_all"
  on payments for all
  using (is_admin())
  with check (is_admin());

-- ── payment_audit_log ───────────────────────────────────────
alter table payment_audit_log enable row level security;

-- Append-only: nobody can UPDATE or DELETE audit rows via client
-- Owners may read their own payment logs
create policy "pal_owner_select"
  on payment_audit_log for select
  using (
    exists (
      select 1 from payments p
      where p.id = payment_audit_log.payment_id
        and owns_business(p.business_id)
    )
  );

-- Admins read all
create policy "pal_admin_select"
  on payment_audit_log for select
  using (is_admin());

-- Only service_role (Edge Functions) may INSERT audit entries
-- (authenticated users cannot write to audit log directly)
create policy "pal_service_insert"
  on payment_audit_log for insert
  with check (false);  -- blocked for all JWT roles; service_role bypasses RLS

-- ============================================================
-- 8. VAULT SETUP NOTES (run manually in Supabase dashboard)
-- ============================================================
-- Supabase Vault stores secrets that are NEVER exposed to the
-- client or stored in plaintext in any table.
--
-- Create the following secrets via:
--   Dashboard → Settings → Vault → New Secret
--   or: select vault.create_secret('value', 'name');
--
--   Secret name                  | Description
--   ─────────────────────────────┼──────────────────────────────
--   snippe_api_key               | Platform Snippe secret key
--   snippe_webhook_secret        | Snippe webhook signing secret
--   snippe_api_key_<business_id> | Optional per-business key
--
-- Access inside Edge Functions:
--   const { data } = await supabaseAdmin
--     .rpc('vault.decrypted_secrets')
--     .eq('name', 'snippe_api_key')
--   OR: use environment variable SNIPPE_API_KEY set in
--   Dashboard → Settings → Edge Functions → Secrets
-- ============================================================

-- ============================================================
-- 9. GRANT service_role access to audit log INSERT
--    (Edge Functions run as service_role)
-- ============================================================
grant insert on payment_audit_log to service_role;
grant update on payments          to service_role;
grant insert on payments          to service_role;
grant select on payments          to service_role;
grant select on payment_gateway_config   to service_role;
grant select on business_payment_config  to service_role;
