-- ============================================================
-- One-time Backfill: confirmed payments + wallet reconciliation
-- ============================================================
-- Purpose:
-- 1) For already-confirmed historical payments, activate subscriptions.
-- 2) Mark linked POS orders completed/paid for completed POS payments.
-- 3) Backfill wallet collection transactions for completed sales that
--    never generated wallet rows.
-- 4) Recompute wallet balances/totals from wallet_transactions.
--
-- Safe to run multiple times (idempotent where possible).
-- ============================================================

-- 0) Ensure wallet exists for every business
insert into wallet_accounts (business_id)
select b.id
from businesses b
left join wallet_accounts w on w.business_id = b.id
where w.id is null;

-- 1) Subscription payments already completed -> subscription active
update subscriptions s
set status = 'active'
where s.id in (
  select p.subscription_id
  from payments p
  where p.payment_type = 'subscription'
    and p.status = 'completed'
    and p.subscription_id is not null
)
and s.status <> 'active';

-- 1b) If some completed subscription payments are not linked to a subscription_id,
--     link them to the latest pending/trial/cancelled subscription for that business.
with unlinked_completed_sub_payments as (
  select p.id, p.business_id
  from payments p
  where p.payment_type = 'subscription'
    and p.status = 'completed'
    and p.subscription_id is null
),
latest_sub as (
  select distinct on (s.business_id)
         s.business_id,
         s.id as subscription_id
  from subscriptions s
  where s.status in ('pending', 'trial', 'cancelled', 'expired')
  order by s.business_id, s.created_at desc
)
update payments p
set subscription_id = ls.subscription_id
from unlinked_completed_sub_payments u
join latest_sub ls on ls.business_id = u.business_id
where p.id = u.id;

-- Activate newly-linked subscriptions too
update subscriptions s
set status = 'active'
where s.id in (
  select p.subscription_id
  from payments p
  where p.payment_type = 'subscription'
    and p.status = 'completed'
    and p.subscription_id is not null
)
and s.status <> 'active';

-- 2) Completed POS payments -> linked sale completed + paid
update sales s
set status = 'completed',
    payment_status = 'paid',
    updated_at = now()
where s.id in (
  select p.pos_order_id::uuid
  from payments p
  where p.payment_type = 'pos'
    and p.status = 'completed'
    and p.pos_order_id is not null
)
and (s.status <> 'completed' or s.payment_status <> 'paid');

-- 2b) Cash historical cleanup: cash sales should be completed/paid
update sales s
set status = 'completed',
    payment_status = 'paid',
    updated_at = now()
where s.payment_method = 'cash'
  and (s.status <> 'completed' or s.payment_status <> 'paid');

-- 3) Remove wallet collection transactions that are not mobile-money paid sales
delete from wallet_transactions tx
using sales s
where tx.type = 'collection'
  and tx.reference = s.id::text
  and (
    s.payment_method <> 'mobile_money'
    or s.payment_status <> 'paid'
    or s.status <> 'completed'
  );

-- 4) Backfill missing wallet collection transactions from successful mobile-money sales
--    (skip sales already represented by collection tx reference).
insert into wallet_transactions (
  id,
  business_id,
  wallet_id,
  type,
  amount,
  balance_before,
  balance_after,
  reference,
  description,
  status,
  initiated_by,
  created_at
)
select
  gen_random_uuid(),
  s.business_id,
  w.id,
  'collection',
  s.total,
  0, -- recalculated below
  0, -- recalculated below
  s.id::text,
  'Backfill: Sale #' || coalesce(s.order_number, left(s.id::text, 8)),
  'completed',
  s.cashier_id,
  s.created_at
from sales s
join wallet_accounts w on w.business_id = s.business_id
left join wallet_transactions tx
  on tx.type = 'collection'
 and tx.reference = s.id::text
where s.status = 'completed'
  and s.payment_status = 'paid'
  and s.payment_method = 'mobile_money'
  and tx.id is null;

-- 5) Recompute wallet totals by business
--    (collection adds, refund/withdrawal subtracts)
with agg as (
  select
    tx.business_id,
    coalesce(sum(case when tx.type = 'collection' then tx.amount else 0 end), 0) as total_collected,
    coalesce(sum(case when tx.type = 'withdrawal' then tx.amount else 0 end), 0) as total_withdrawn,
    coalesce(sum(case when tx.type = 'collection' then tx.amount
                      when tx.type in ('refund', 'withdrawal') then -tx.amount
                      else 0 end), 0) as final_balance
  from wallet_transactions tx
  group by tx.business_id
)
update wallet_accounts w
set
  total_collected = a.total_collected,
  total_withdrawn = a.total_withdrawn,
  balance = greatest(0, a.final_balance),
  updated_at = now()
from agg a
where w.business_id = a.business_id;

-- 6) Optional sanity checks (uncomment to inspect)
-- select count(*) as pending_subscriptions_after_fix from subscriptions where status = 'pending';
-- select business_id, balance, total_collected, total_withdrawn from wallet_accounts order by updated_at desc;
-- select count(*) as completed_sales_without_wallet_tx
-- from sales s
-- left join wallet_transactions tx on tx.type='collection' and tx.reference = s.id::text
-- where s.status='completed' and tx.id is null;
