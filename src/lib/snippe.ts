/**
 * snippe.ts — CLIENT-SAFE types and UI helpers for Snippe.sh
 *
 * SECURITY: This file contains NO API keys and makes NO direct
 * calls to the Snippe API.  All Snippe API calls are proxied
 * through Supabase Edge Functions which hold secrets server-side.
 *
 * Frontend flow:
 *   supabase.functions.invoke('initiate-payment', { body: {...} })
 *   supabase.functions.invoke('verify-payment',   { body: { paymentId } })
 */

// ─────────────────────────────────────────────────────────────
// Shared payload types (used by both frontend and Edge Functions)
// ─────────────────────────────────────────────────────────────

export type PaymentType    = 'subscription' | 'pos' | 'payout';
export type PaymentChannel = 'mobile' | 'bank';
export type PaymentStatus  =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'expired'
  | 'refunded';

/** Request body sent from frontend → Edge Function: initiate-payment */
export interface InitiatePaymentRequest {
  payment_type:     PaymentType;
  channel:          PaymentChannel;
  amount:           number;          // TZS
  business_id:      string;          // uuid
  idempotency_key:  string;          // client-generated, max 30 chars

  // Payer details (subscription / POS collections)
  payer_phone?:         string;      // 0XXXXXXXXX or 255XXXXXXXXX
  payer_name?:          string;
  payer_email?:         string;
  payer_bank_code?:     string;
  payer_bank_account?:  string;

  // App-level links
  subscription_id?:  string;
  pos_order_id?:     string;

  // Optional diagnostic metadata — NO secrets
  metadata?: Record<string, string>;
}

/** Success response from Edge Function: initiate-payment */
export interface InitiatePaymentResponse {
  success:         true;
  payment_id:      string;           // payments.id (uuid)
  gateway_reference: string;         // Snippe reference
  status:          PaymentStatus;
  message:         string;           // human-readable, e.g. "USSD push sent"
}

/** Error response from any Edge Function */
export interface EdgeFunctionError {
  success:    false;
  error_code: string;
  message:    string;
}

/** Request body for verify-payment */
export interface VerifyPaymentRequest {
  payment_id: string;   // payments.id
}

/** Response from verify-payment */
export interface VerifyPaymentResponse {
  success:          boolean;
  payment_id:       string;
  status:           PaymentStatus;
  gateway_reference?: string;
  amount:           number;
  fee_amount:       number;
  completed_at?:    string;
}

// ─────────────────────────────────────────────────────────────
// Snippe gateway response shapes (for Edge Function use)
// These are re-exported so edge functions can import from one place.
// ─────────────────────────────────────────────────────────────

export interface SnippePaymentResponse {
  status:  'success' | 'error';
  code:    number;
  data?: {
    reference:    string;
    status:       'pending' | 'completed' | 'failed' | 'expired';
    amount:       { currency: string; value: number };
    expires_at:   string;
    payment_type: string;
    object:       string;
    api_version:  string;
  };
  error_code?: string;
  message?:    string;
}

export interface SnippePayoutResponse {
  status: 'success' | 'error';
  code:   number;
  data?: {
    reference:         string;
    status:            'pending' | 'completed' | 'failed';
    source:            string;
    amount:            number;
    fee_amount:        number;
    currency:          string;
    channel:           string;
    recipient: {
      name:     string;
      phone?:   string;
      bank?:    string;
      account?: string;
    };
    narration?:  string;
    created_at:  string;
  };
  error_code?: string;
  message?:    string;
}

export interface SnippeStatusResponse {
  status: 'success' | 'error';
  code:   number;
  data?: {
    id:                 string;
    reference:          string;
    external_reference: string;
    status:             'pending' | 'completed' | 'failed';
    source?:            string;
    object?:            string;
    api_version?:       string;
    amount:  { currency: string; value: number };
    fees:    { currency: string; value: number };
    total:   { currency: string; value: number };
    recipient: {
      name:     string;
      phone?:   string;
      account?: string;
      bank?:    string;
    };
    channel: { provider: string; type: string };
    narration?:    string;
    created_at:    string;
    completed_at?: string;
  };
  error_code?: string;
  message?:    string;
}

export type SnippeWebhookEvent =
  | 'payment.completed'
  | 'payment.failed'
  | 'payment.expired'
  | 'payout.completed'
  | 'payout.failed';

export interface SnippeWebhookPayload {
  event:     SnippeWebhookEvent;
  reference: string;
  data:      Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────
// Supported banks (UI use)
// ─────────────────────────────────────────────────────────────

export const SNIPPE_BANKS = [
  { code: 'ABSA',        name: 'ABSA Bank Tanzania Ltd' },
  { code: 'ACCESS',      name: 'AccessBank Tanzania Ltd' },
  { code: 'AKIBA',       name: 'Akiba Commercial Bank Ltd' },
  { code: 'AMANA',       name: 'Amana Bank Limited' },
  { code: 'AZANIA',      name: 'Azania Bank Limited' },
  { code: 'BANCABC',     name: 'African Banking Corporation Tanzania Ltd' },
  { code: 'BARODA',      name: 'Bank of Baroda (Tanzania) Ltd' },
  { code: 'BOA',         name: 'Bank of Africa Tanzania Limited' },
  { code: 'BOI',         name: 'Bank of India (Tanzania) Limited' },
  { code: 'CANARA',      name: 'Canara Bank Tanzania Ltd' },
  { code: 'CITI',        name: 'Citibank Tanzania Ltd' },
  { code: 'CRDB',        name: 'CRDB Bank PLC' },
  { code: 'DASHENG',     name: 'China Dasheng Bank Limited' },
  { code: 'DCB',         name: 'Dar es Salaam Community Bank Ltd' },
  { code: 'DTB',         name: 'Diamond Trust Bank Tanzania Ltd' },
  { code: 'ECOBANK',     name: 'Ecobank Tanzania Limited' },
  { code: 'EQUITY',      name: 'Equity Bank Tanzania Limited' },
  { code: 'EXIM',        name: 'Exim Bank (Tanzania) Ltd' },
  { code: 'FNB',         name: 'First National Bank Limited' },
  { code: 'GT BANK',     name: 'Guaranty Trust Bank (T) Ltd' },
  { code: 'HABIB',       name: 'Habib African Bank Limited' },
  { code: 'ICB',         name: 'International Commercial Bank (Tanzania) Limited' },
  { code: 'IMBANK',      name: 'I&M Bank Limited' },
  { code: 'KCB',         name: 'KCB Bank Tanzania Limited' },
  { code: 'KILIMANJARO', name: 'Kilimanjaro Co-operative Bank Ltd' },
  { code: 'MAENDELEO',   name: 'Maendeleo Bank Ltd' },
  { code: 'MKOMBOZI',    name: 'Mkombozi Commercial Bank' },
  { code: 'MWALIMU',     name: 'Mwalimu Commercial Bank PLC' },
  { code: 'MWANGA',      name: 'Mwanga Hakika Microfinance Bank Limited' },
  { code: 'NBC',         name: 'National Bank of Commerce Ltd' },
  { code: 'NCBA',        name: 'NCBA Bank Limited' },
  { code: 'NMB',         name: 'National Microfinance Bank Limited' },
  { code: 'PBZ',         name: "People's Bank of Zanzibar Ltd" },
  { code: 'SCB',         name: 'Standard Chartered Bank (T) Limited' },
  { code: 'SELCOMPESA',  name: 'Selcompesa Bank Ltd' },
  { code: 'STANBIC',     name: 'Stanbic Bank Tanzania Ltd' },
  { code: 'TCB',         name: 'Tanzania Commercial Bank PLC' },
  { code: 'UBA',         name: 'United Bank for Africa (T) Ltd' },
  { code: 'UCHUMI',      name: 'Uchumi Commercial Bank (T) Ltd' },
  { code: 'YETU',        name: 'Yetu Microfinance Bank PLC' },
] as const;

export type SnippeBankCode = typeof SNIPPE_BANKS[number]['code'];

// ─────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────

/** Normalise any local format to Snippe's 255XXXXXXXXX */
export function normalisePhone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.startsWith('255') && d.length === 12) return d;
  if (d.startsWith('0')   && d.length === 10) return `255${d.slice(1)}`;
  if (d.length === 9)                          return `255${d}`;
  return d;
}

/** Convert 255XXXXXXXXX to display form 0XXXXXXXXX */
export function displayPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.startsWith('255') && d.length === 12) return `0${d.slice(3)}`;
  return phone;
}

/** Generate a client-side idempotency key (≤30 chars) */
export function generateIdempotencyKey(prefix = 'pay'): string {
  const ts  = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${ts}-${rnd}`.slice(0, 30);
}
