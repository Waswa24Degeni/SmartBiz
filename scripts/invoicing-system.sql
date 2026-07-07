-- SmartEnterprise Invoicing System Schema
-- Supports Proforma Invoices → Invoices → Receipts
-- Run this in your Supabase SQL editor AFTER the main schema

-- =============================================
-- DOCUMENT SEQUENCES TABLE
-- =============================================
create table if not exists document_sequences (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  document_type text not null check (document_type in ('proforma', 'invoice', 'receipt')),
  next_number bigint not null default 1001,
  prefix text not null default '',
  created_at timestamptz not null default now(),
  unique(business_id, document_type)
);

-- =============================================
-- INVOICES TABLE
-- Tracks: Proforma → Invoice → Receipt lifecycle
-- =============================================
create table if not exists invoices (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  sale_id uuid references sales(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  cashier_id uuid not null references users(id),
  
  -- Document identification
  document_type text not null default 'proforma' check (document_type in ('proforma', 'invoice', 'receipt')),
  invoice_number text not null unique,
  invoice_date timestamptz not null default now(),
  due_date timestamptz,
  
  -- Customer details (denormalized for offline support)
  customer_name text not null,
  customer_phone text,
  customer_email text,
  customer_address text,
  
  -- Business details (denormalized)
  business_name text not null,
  business_address text,
  business_phone text,
  business_email text,
  business_logo_url text,
  
  -- Order info
  table_number text,
  guests integer default 1,
  
  -- Financials
  subtotal numeric(12,2) not null default 0,
  tax_rate numeric(5,2) not null default 0,  -- Tax percentage (e.g., 18 for 18%)
  tax_amount numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  discount_reason text,
  grand_total numeric(12,2) not null default 0,
  
  -- Payment tracking
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'partial', 'paid', 'overdue')),
  payment_method text check (payment_method in ('cash', 'mobile_money', 'bank_card', 'credit', 'cheque')),
  amount_paid numeric(12,2) not null default 0,
  balance_amount numeric(12,2) not null default 0,
  
  -- Payment details for paid invoices
  paid_date timestamptz,
  transaction_reference text,
  
  -- Lifecycle tracking
  proforma_id uuid references invoices(id),  -- Reference to proforma if this is an invoice
  receipt_id uuid,                           -- Reference to receipts.id (FK added after receipts table creation)
  
  -- Notes and metadata
  notes text,
  terms_conditions text,
  thank_you_message text default 'Thank you for your business',
  
  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Prevent duplicate receipts per sale (partial unique index)
create unique index if not exists idx_invoices_unique_receipt_per_sale
  on invoices(sale_id)
  where document_type = 'receipt' and sale_id is not null;

-- =============================================
-- INVOICE ITEMS TABLE
-- =============================================
create table if not exists invoice_items (
  id uuid primary key default uuid_generate_v4(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  product_id uuid references products(id),
  
  description text not null,
  quantity numeric(12,2) not null,
  unit_price numeric(12,2) not null,
  discount numeric(12,2) not null default 0,
  item_total numeric(12,2) not null,
  
  created_at timestamptz not null default now()
);

-- =============================================
-- RECEIPTS TABLE (Archive of paid invoices)
-- =============================================
create table if not exists receipts (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  invoice_id uuid not null references invoices(id) on delete cascade unique,
  sale_id uuid references sales(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  
  -- Receipt identification
  receipt_number text not null unique,
  receipt_date timestamptz not null default now(),
  
  -- Customer & Business info (denormalized)
  customer_name text not null,
  customer_phone text,
  business_name text not null,
  cashier_name text not null,
  cashier_id uuid not null references users(id),
  
  -- Payment details
  amount_paid numeric(12,2) not null,
  payment_method text not null check (payment_method in ('cash', 'mobile_money', 'bank_card', 'credit', 'cheque')),
  transaction_reference text,
  
  -- Balance tracking
  previous_balance numeric(12,2) not null default 0,
  current_balance numeric(12,2) not null default 0,
  credit_applied numeric(12,2) not null default 0,
  
  -- Audit trail
  payment_status text not null default 'received' check (payment_status in ('received', 'refunded', 'disputed')),
  
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Link invoices.receipt_id to receipts.id (added after receipts table exists)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fk_invoices_receipt_id'
  ) then
    alter table invoices
      add constraint fk_invoices_receipt_id
      foreign key (receipt_id) references receipts(id) on delete set null;
  end if;
end $$;

-- =============================================
-- RECEIPT ITEMS TABLE
-- =============================================
create table if not exists receipt_items (
  id uuid primary key default uuid_generate_v4(),
  receipt_id uuid not null references receipts(id) on delete cascade,
  description text not null,
  quantity numeric(12,2) not null,
  unit_price numeric(12,2) not null,
  item_total numeric(12,2) not null,
  created_at timestamptz not null default now()
);

-- =============================================
-- PAYMENT AUDIT LOG TABLE
-- =============================================
create table if not exists payment_logs (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  invoice_id uuid not null references invoices(id) on delete cascade,
  user_id uuid not null references users(id),
  
  action text not null check (action in ('created', 'marked_paid', 'refunded', 'disputed', 'corrected')),
  amount numeric(12,2) not null,
  payment_method text,
  transaction_reference text,
  notes text,
  
  created_at timestamptz not null default now()
);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

alter table document_sequences enable row level security;
alter table invoices enable row level security;
alter table invoice_items enable row level security;
alter table receipts enable row level security;
alter table receipt_items enable row level security;
alter table payment_logs enable row level security;

-- Document sequences: business owner only
create policy "doc_sequences_policy" on document_sequences
  for all using (business_id = get_my_business_id());

-- Invoices: business data policy
create policy "invoices_policy" on invoices
  for all using (business_id = get_my_business_id());

-- Invoice items: access via invoice
create policy "invoice_items_policy" on invoice_items
  for all using (
    invoice_id in (select id from invoices where business_id = get_my_business_id())
  );

-- Receipts: business data policy
create policy "receipts_policy" on receipts
  for all using (business_id = get_my_business_id());

-- Receipt items: access via receipt
create policy "receipt_items_policy" on receipt_items
  for all using (
    receipt_id in (select id from receipts where business_id = get_my_business_id())
  );

-- Payment logs: business data policy
create policy "payment_logs_policy" on payment_logs
  for all using (business_id = get_my_business_id());

-- =============================================
-- HELPER FUNCTIONS
-- =============================================

-- Function to get next document number
create or replace function get_next_document_number(
  p_business_id uuid,
  p_doc_type text
)
returns text language plpgsql as $$
declare
  v_next_num bigint;
  v_prefix text;
  v_seq_id uuid;
begin
  -- Get or create sequence
  insert into document_sequences (business_id, document_type, next_number, prefix)
  values (p_business_id, p_doc_type, 1001, upper(substring(p_doc_type, 1, 1)))
  on conflict (business_id, document_type) do nothing;
  
  -- Update and return next number
  update document_sequences
  set next_number = next_number + 1
  where business_id = p_business_id and document_type = p_doc_type
  returning next_number - 1, prefix into v_next_num, v_prefix;
  
  return v_prefix || '-' || to_char(v_next_num, '0000000');
end
$$;

-- Function to convert proforma to invoice
create or replace function convert_proforma_to_invoice(
  p_proforma_id uuid,
  p_new_due_date timestamptz default null
)
returns uuid language plpgsql as $$
declare
  v_invoice_id uuid;
  v_invoice_number text;
  v_business_id uuid;
  v_proforma record;
begin
  -- Get proforma details
  select * into v_proforma from invoices
  where id = p_proforma_id and document_type = 'proforma';
  
  if v_proforma is null then
    raise exception 'Proforma not found';
  end if;
  
  v_business_id := v_proforma.business_id;
  v_invoice_number := get_next_document_number(v_business_id, 'invoice');
  
  -- Create new invoice from proforma
  insert into invoices (
    business_id, sale_id, customer_id, cashier_id,
    document_type, invoice_number, invoice_date, due_date,
    customer_name, customer_phone, customer_email, customer_address,
    business_name, business_address, business_phone, business_email, business_logo_url,
    table_number, guests, subtotal, tax_rate, tax_amount, discount, grand_total,
    payment_status, notes, proforma_id
  )
  select
    v_business_id, sale_id, customer_id, cashier_id,
    'invoice', v_invoice_number, now(), coalesce(p_new_due_date, now() + interval '30 days'),
    customer_name, customer_phone, customer_email, customer_address,
    business_name, business_address, business_phone, business_email, business_logo_url,
    table_number, guests, subtotal, tax_rate, tax_amount, discount, grand_total,
    'unpaid', notes, p_proforma_id
  from invoices where id = p_proforma_id
  returning id into v_invoice_id;
  
  -- Copy invoice items
  insert into invoice_items (invoice_id, product_id, description, quantity, unit_price, discount, item_total)
  select v_invoice_id, product_id, description, quantity, unit_price, discount, item_total
  from invoice_items where invoice_id = p_proforma_id;
  
  return v_invoice_id;
end
$$;

-- Function to mark invoice as paid and create receipt
create or replace function mark_invoice_paid(
  p_invoice_id uuid,
  p_payment_method text,
  p_amount_paid numeric,
  p_transaction_reference text default null
)
returns uuid language plpgsql as $$
declare
  v_receipt_id uuid;
  v_receipt_number text;
  v_invoice record;
  v_cashier record;
  v_business_id uuid;
begin
  -- Get invoice and validate
  select * into v_invoice from invoices where id = p_invoice_id;
  if v_invoice is null then
    raise exception 'Invoice not found';
  end if;
  
  v_business_id := v_invoice.business_id;
  
  -- Get cashier info
  select * into v_cashier from users where id = v_invoice.cashier_id;
  
  -- Generate receipt number
  v_receipt_number := get_next_document_number(v_business_id, 'receipt');
  
  -- Create receipt
  insert into receipts (
    business_id, invoice_id, sale_id, customer_id,
    receipt_number, receipt_date,
    customer_name, customer_phone, business_name, cashier_name, cashier_id,
    amount_paid, payment_method, transaction_reference, current_balance, notes
  )
  values (
    v_business_id, p_invoice_id, v_invoice.sale_id, v_invoice.customer_id,
    v_receipt_number, now(),
    v_invoice.customer_name, v_invoice.customer_phone, v_invoice.business_name, v_cashier.full_name, v_cashier.id,
    p_amount_paid, p_payment_method, p_transaction_reference,
    greatest(0, v_invoice.grand_total - p_amount_paid), null
  )
  returning id into v_receipt_id;
  
  -- Copy receipt items from invoice
  insert into receipt_items (receipt_id, description, quantity, unit_price, item_total)
  select v_receipt_id, description, quantity, unit_price, item_total
  from invoice_items where invoice_id = p_invoice_id;
  
  -- Update invoice as paid
  update invoices
  set
    payment_status = case when p_amount_paid >= grand_total then 'paid' else 'partial' end,
    amount_paid = p_amount_paid,
    balance_amount = greatest(0, grand_total - p_amount_paid),
    payment_method = p_payment_method,
    transaction_reference = p_transaction_reference,
    paid_date = now(),
    receipt_id = v_receipt_id,
    updated_at = now()
  where id = p_invoice_id;
  
  -- Create payment audit log
  insert into payment_logs (business_id, invoice_id, user_id, action, amount, payment_method, transaction_reference)
  values (v_business_id, p_invoice_id, v_invoice.cashier_id, 'marked_paid', p_amount_paid, p_payment_method, p_transaction_reference);
  
  return v_receipt_id;
end
$$;

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

create index if not exists idx_invoices_business_id on invoices(business_id);
create index if not exists idx_invoices_customer_id on invoices(customer_id);
create index if not exists idx_invoices_sale_id on invoices(sale_id);
create index if not exists idx_invoices_document_type on invoices(document_type);
create index if not exists idx_invoices_payment_status on invoices(payment_status);
create index if not exists idx_invoices_created_at on invoices(created_at);
create index if not exists idx_invoices_invoice_number on invoices(invoice_number);

create index if not exists idx_receipts_business_id on receipts(business_id);
create index if not exists idx_receipts_invoice_id on receipts(invoice_id);
create index if not exists idx_receipts_customer_id on receipts(customer_id);
create index if not exists idx_receipts_receipt_number on receipts(receipt_number);
create index if not exists idx_receipts_created_at on receipts(created_at);

create index if not exists idx_payment_logs_invoice_id on payment_logs(invoice_id);
create index if not exists idx_payment_logs_business_id on payment_logs(business_id);
create index if not exists idx_payment_logs_created_at on payment_logs(created_at);
