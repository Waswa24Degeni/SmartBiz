// =====================================
// Core Database Types
// =====================================

export type UserRole = 'owner' | 'staff' | 'admin' | 'banned';
export type SubscriptionPlan = 'free' | 'starter' | 'business' | 'premium';
export type OrderStatus = 'active' | 'completed' | 'cancelled' | 'refunded';
export type PaymentMethod = 'cash' | 'mobile_money';
export type PaymentStatus = 'pending' | 'paid' | 'partial' | 'overdue';

export interface User {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  avatar_url?: string;
  role: UserRole;
  business_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Business {
  id: string;
  name: string;
  category: string;
  owner_id: string;
  logo_url?: string;
  phone?: string;
  email?: string;
  address?: string;
  currency: string;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  business_id: string;
  plan: SubscriptionPlan;
  status: 'active' | 'expired' | 'trial' | 'cancelled' | 'pending';
  starts_at: string;
  expires_at: string;
  billing_cycle: 'monthly' | 'yearly';
  created_at: string;
}

export interface Category {

  id: string;
  business_id: string;
  name: string;
  image_url?: string;
  description?: string;
  created_at: string;
}

export interface Product {
  id: string;
  business_id: string;
  category_id?: string;
  name: string;
  description?: string;
  image_url?: string;
  purchase_price: number;
  selling_price: number;
  stock_quantity: number;
  low_stock_threshold: number;
  unit: string;
  barcode?: string;
  is_active: boolean;
  has_tax?: boolean;
  created_at: string;
  updated_at: string;
  category?: Category;
}

export interface Customer {
  id: string;
  business_id: string;
  full_name: string;
  phone?: string;
  email?: string;
  address?: string;
  credit_balance: number;
  loyalty_points: number;
  created_at: string;
  updated_at: string;
}

export interface Sale {
  id: string;
  business_id: string;
  customer_id?: string;
  cashier_id: string;
  order_number: string;
  table_number?: string;
  guests?: number;
  status: OrderStatus;
  subtotal: number;
  discount: number;
  total: number;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  notes?: string;
  tax?: number;
  mobile_phone?: string;
  payer_name?: string;
  created_at: string;
  updated_at: string;
  items?: SaleItem[];
  customer?: Customer;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  discount: number;
  total: number;
  product?: Product;
}

export interface CartItem {
  product: Product;
  quantity: number;
  discount: number;
}

export interface Staff {
  id: string;
  business_id: string;
  user_id: string;
  role: 'manager' | 'cashier' | 'waiter';
  shift_start?: string;
  shift_end?: string;
  is_active: boolean;
  permissions: string[];
  created_at: string;
  user?: User;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: 'low_stock' | 'subscription' | 'sales' | 'system' | 'payment';
  is_read: boolean;
  created_at: string;
}

export interface DashboardStats {
  today_sales: number;
  today_expenses: number;
  today_profit: number;
  monthly_sales: number;
  monthly_expenses: number;
  net_profit: number;
  total_orders: number;
  new_customers: number;
  low_stock_count: number;
  pending_invoices: number;
}

// Navigation param types
export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  OTPVerification: { email: string };
};

export type OnboardingStackParamList = {
  BusinessProfile: undefined;
  BusinessCategory: undefined;
  CurrencySettings: undefined;
  SubscriptionPlan: undefined;
};

export type MainTabParamList = {
  Dashboard: undefined;
  Inventory: undefined;
  POS: undefined;
  Reports: undefined;
  Bills: undefined;
  Settings: undefined;
};

export type ProductsStackParamList = {
  FoodDrinksHome: undefined;
  Categories: undefined;
  CategoryItems: { category: Category };
  ProductDetail: { product: Product };
  AddProduct: undefined;
  EditProduct: { product: Product };
};

export type BillsStackParamList = {
  BillsList: undefined;
  BillDetail: { saleId: string };
  NewOrder: undefined;
};

export type SettingsStackParamList = {
  SettingsHome: undefined;
  Profile: undefined;
  Notifications: undefined;
  Appearance: undefined;
  CheckoutSettings: undefined;
  Security: undefined;
  LanguageRegion: undefined;
};

export type AdminStackParamList = {
  AdminHome: undefined;
  Users: undefined;
  Businesses: undefined;
  Revenue: undefined;
  Plans: undefined;
  Support: undefined;
};

// =====================================
// Invoicing System Types
// =====================================

export type DocumentType = 'proforma' | 'invoice' | 'receipt';
export type InvoicePaymentStatus = 'unpaid' | 'partial' | 'paid' | 'overdue';

export interface Invoice {
  id: string;
  business_id: string;
  sale_id?: string;
  customer_id?: string;
  cashier_id: string;
  document_type: DocumentType;
  invoice_number: string;
  invoice_date: string;
  due_date?: string;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  customer_address?: string;
  business_name: string;
  business_address?: string;
  business_phone?: string;
  business_email?: string;
  business_logo_url?: string;
  table_number?: string;
  guests?: number;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  discount: number;
  discount_reason?: string;
  grand_total: number;
  payment_status: InvoicePaymentStatus;
  payment_method?: PaymentMethod;
  amount_paid: number;
  balance_amount: number;
  paid_date?: string;
  transaction_reference?: string;
  proforma_id?: string;
  receipt_id?: string;
  notes?: string;
  terms_conditions?: string;
  thank_you_message?: string;
  created_at: string;
  updated_at: string;
  invoice_items?: InvoiceItem[];
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  product_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount: number;
  item_total: number;
  created_at: string;
}

export interface Receipt {
  id: string;
  business_id: string;
  invoice_id: string;
  sale_id?: string;
  customer_id?: string;
  receipt_number: string;
  receipt_date: string;
  customer_name: string;
  customer_phone?: string;
  business_name: string;
  cashier_name: string;
  cashier_id: string;
  amount_paid: number;
  payment_method: PaymentMethod;
  transaction_reference?: string;
  previous_balance: number;
  current_balance: number;
  credit_applied: number;
  payment_status: 'received' | 'refunded' | 'disputed';
  notes?: string;
  created_at: string;
  updated_at: string;
  receipt_items?: ReceiptItem[];
}

export interface ReceiptItem {
  id: string;
  receipt_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  item_total: number;
  created_at: string;
}

// =====================================
// Wallet / Collection & Payout Types
// =====================================

export interface WalletAccount {
  id: string;
  business_id: string;
  balance: number;
  total_collected: number;
  total_withdrawn: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

export type WalletTransactionType = 'collection' | 'withdrawal' | 'refund' | 'adjustment';
export type WalletTransactionStatus = 'pending' | 'completed' | 'failed' | 'cancelled';

export interface WalletTransaction {
  id: string;
  business_id: string;
  wallet_id: string;
  type: WalletTransactionType;
  amount: number;
  balance_before: number;
  balance_after: number;
  reference?: string;
  description: string;
  status: WalletTransactionStatus;
  initiated_by?: string;
  payout_method_id?: string;
  created_at: string;
}

export type PayoutMethodType = 'bank' | 'mobile_money';

export interface PayoutMethod {
  id: string;
  business_id: string;
  type: PayoutMethodType;
  label: string;
  account_number: string;
  account_name: string;
  bank_code?: string;
  bank_name?: string;
  mobile_network?: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export type WithdrawalStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface WithdrawalRequest {
  id: string;
  business_id: string;
  wallet_id: string;
  payout_method_id: string;
  amount: number;
  fee: number;
  net_amount: number;
  status: WithdrawalStatus;
  initiated_by?: string;
  notes?: string;
  processed_at?: string;
  created_at: string;
  updated_at: string;
  payout_method?: PayoutMethod;
}

// =====================================
// Expense Types
// =====================================

export interface ExpenseCategory {
  id: string;
  business_id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface Expense {
  id: string;
  business_id: string;
  category_id?: string;
  title: string;
  amount: number;
  description?: string;
  receipt_url?: string;
  expense_date: string;
  supplier?: string;
  payment_method?: PaymentMethod | string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  category?: ExpenseCategory;
}

// =====================================
// Activity Log Types
// =====================================

export interface ActivityLog {
  id: string;
  business_id: string;
  user_id?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  details?: Record<string, any>;
  created_at: string;
}
