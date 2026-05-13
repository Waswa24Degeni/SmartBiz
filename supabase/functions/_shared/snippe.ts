/**
 * _shared/snippe.ts — Snippe API client for Edge Functions ONLY
 *
 * SECURITY: This module runs exclusively inside Supabase Edge Functions
 * (Deno runtime, server-side).  It reads the API key from environment
 * variables — never from the database or request body.
 *
 * Usage in an Edge Function:
 *   import { snippeCollect, snippePayout, verifyWebhookSignature } from '../_shared/snippe.ts';
 */

const BASE_URL = 'https://api.snippe.sh/v1';

// ─────────────────────────────────────────────────────────────
// Environment helpers  (Deno-compatible)
// ─────────────────────────────────────────────────────────────

function getEnv(name: string): string {
  const val = Deno.env.get(name);
  if (!val) throw new Error(`Missing environment variable: ${name}`);
  return val;
}

// ─────────────────────────────────────────────────────────────
// Internal fetch helper
// ─────────────────────────────────────────────────────────────

async function snippeFetch<T>(
  apiKey: string,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  idempotencyKey?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
  };
  if (method === 'POST') {
    headers['Content-Type'] = 'application/json';
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const json = await res.json() as T;
  return json;
}

// ─────────────────────────────────────────────────────────────
// Types (server-side — mirrors src/lib/snippe.ts shapes)
// ─────────────────────────────────────────────────────────────

export interface SnippePaymentRequest {
  amount:      number;       // TZS integer
  phone_number: string;      // 255XXXXXXXXX
  customer: { firstname: string; lastname: string; email: string };
  webhook_url?: string;
  metadata?:   Record<string, string>;
}

export interface SnippePaymentResponse {
  status:  'success' | 'error';
  code:    number;
  data?: {
    reference:  string;
    status:     'pending' | 'completed' | 'failed' | 'expired';
    amount:     { currency: string; value: number };
    expires_at: string;
  };
  error_code?: string;
  message?:    string;
}

export interface SnimmePayout_MobileRequest {
  amount:         number;
  channel:        'mobile';
  recipient_phone: string;
  recipient_name: string;
  narration?:     string;
  webhook_url?:   string;
  metadata?:      Record<string, string>;
}

export interface SnippePayout_BankRequest {
  amount:            number;
  channel:           'bank';
  recipient_bank:    string;
  recipient_account: string;
  recipient_name:    string;
  narration?:        string;
  webhook_url?:      string;
  metadata?:         Record<string, string>;
}

export type SnippePayoutRequest = SnimmePayout_MobileRequest | SnippePayout_BankRequest;

export interface SnippePayoutResponse {
  status: 'success' | 'error';
  code:   number;
  data?: {
    reference:  string;
    status:     'pending' | 'completed' | 'failed';
    amount:     number;
    fee_amount: number;
    currency:   string;
    recipient:  { name: string; phone?: string; bank?: string; account?: string };
    created_at: string;
  };
  error_code?: string;
  message?:    string;
}

export interface SnippeStatusResponse {
  status: 'success' | 'error';
  code:   number;
  data?: {
    reference:          string;
    external_reference: string;
    status:             'pending' | 'completed' | 'failed';
    amount:   { currency: string; value: number };
    fees:     { currency: string; value: number };
    total:    { currency: string; value: number };
    recipient: { name: string; phone?: string; account?: string; bank?: string };
    channel:   { provider: string; type: string };
    created_at:    string;
    completed_at?: string;
  };
  error_code?: string;
  message?:    string;
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Initiate a mobile-money collection (USSD push to payer).
 * apiKey is read from SNIPPE_API_KEY env var by default.
 */
export async function snippeCollect(
  req:      SnippePaymentRequest,
  options?: { apiKey?: string; idempotencyKey?: string },
): Promise<SnippePaymentResponse> {
  const apiKey = options?.apiKey ?? getEnv('SNIPPE_API_KEY');
  return snippeFetch<SnippePaymentResponse>(
    apiKey, 'POST', '/payments',
    {
      payment_type: 'mobile',
      details:      { amount: req.amount, currency: 'TZS' },
      phone_number: req.phone_number,
      customer:     req.customer,
      ...(req.webhook_url ? { webhook_url: req.webhook_url } : {}),
      ...(req.metadata    ? { metadata:    req.metadata    } : {}),
    },
    options?.idempotencyKey,
  );
}

/**
 * Send a mobile-money or bank payout.
 */
export async function snippePayout(
  req:      SnippePayoutRequest,
  options?: { apiKey?: string; idempotencyKey?: string },
): Promise<SnippePayoutResponse> {
  const apiKey = options?.apiKey ?? getEnv('SNIPPE_API_KEY');
  return snippeFetch<SnippePayoutResponse>(
    apiKey, 'POST', '/payouts/send', req,
    options?.idempotencyKey,
  );
}

/**
 * Poll the status of a payment or payout by Snippe reference.
 */
export async function snippeGetStatus(
  reference: string,
  options?:  { apiKey?: string },
): Promise<SnippeStatusResponse> {
  const apiKey = options?.apiKey ?? getEnv('SNIPPE_API_KEY');
  return snippeFetch<SnippeStatusResponse>(apiKey, 'GET', `/payouts/${reference}`);
}

/**
 * Verify an incoming Snippe webhook signature.
 * Returns the parsed payload if valid, throws otherwise.
 *
 * Snippe signs webhooks with HMAC-SHA256:
 *   signature = HMAC-SHA256(timestamp + '.' + rawBody, secret)
 * Header: X-Webhook-Signature, X-Webhook-Timestamp
 */
export async function verifyWebhookSignature(
  rawBody:   Uint8Array,
  signature: string,
  timestamp: string,
  options?:  { secret?: string; toleranceSecs?: number },
): Promise<Record<string, unknown>> {
  const secret = options?.secret ?? getEnv('SNIPPE_WEBHOOK_SECRET');

  // Replay attack: reject if timestamp is older than 5 minutes
  const tolerance = options?.toleranceSecs ?? 300;
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > tolerance) {
    throw new Error('Webhook timestamp out of tolerance window');
  }

  // Import HMAC key
  const enc     = new TextEncoder();
  const keyData = enc.encode(secret);
  const key     = await crypto.subtle.importKey(
    'raw', keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  );

  // Build signed payload: timestamp + '.' + body
  const tsBytes   = enc.encode(`${timestamp}.`);
  const signedBuf = new Uint8Array(tsBytes.length + rawBody.length);
  signedBuf.set(tsBytes, 0);
  signedBuf.set(rawBody, tsBytes.length);

  const sigBuf    = await crypto.subtle.sign('HMAC', key, signedBuf);
  const expected  = Array.from(new Uint8Array(sigBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time compare
  if (!timingSafeEqual(expected, signature)) {
    throw new Error('Webhook signature mismatch');
  }

  return JSON.parse(new TextDecoder().decode(rawBody));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/** Normalise phone: any format → 255XXXXXXXXX */
export function normalisePhone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.startsWith('255') && d.length === 12) return d;
  if (d.startsWith('0')   && d.length === 10) return `255${d.slice(1)}`;
  if (d.length === 9)                          return `255${d}`;
  return d;
}
