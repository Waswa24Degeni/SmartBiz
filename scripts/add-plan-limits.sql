-- Add numeric limit columns to subscription_plans
alter table subscription_plans 
  add column if not exists max_businesses integer not null default 1,
  add column if not exists max_users integer not null default 1,
  add column if not exists max_products integer not null default 100;

-- Update defaults to map to original text labels
-- Free: 1 Business, 1 user, 100 products
update subscription_plans set max_businesses = 1, max_users = 1, max_products = 100 where id = 'free';

-- Starter: 1 Business, 3 users, 500 products
update subscription_plans set max_businesses = 1, max_users = 3, max_products = 500 where id = 'starter';

-- Business: 2 Businesses, 10 users, Unlimited products
update subscription_plans set max_businesses = 2, max_users = 10, max_products = -1 where id = 'business';

-- Premium: 2 Businesses, Unlimited users, Unlimited products
update subscription_plans set max_businesses = 2, max_users = -1, max_products = -1 where id = 'premium';
