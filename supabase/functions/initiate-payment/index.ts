/**
 * initiate-payment/index.ts — Supabase Edge Function
 *
 * Initiates a payment or payout through Snippe.
 * API keys are read exclusively from environment variables — never
 * from the request body or database.
 *
 * POST /functions/v1/initiate-payment
 * Auth: Bearer <user JWT>  (Supabase auth)
 *
 * Body: InitiatePaymentRequest  (see src/lib/snippe.ts for the shared type)
 */

import { serve }        from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─────────────────────────────────────────────────────────────
// Inlined from _shared/snippe.ts  (required for single-file deploy)
// ─────────────────────────────────────────────────────────────

const SNIPPE_BASE = 'https://api.snippe.sh/v1';

function getEnv(name: string): string {
  const val = Deno.env.get(name);
  if (!val) throw new Error(`Missing environment variable: ${name}`);
  return val;
}

async function snippeFetch<T>(
  apiKey: string, method: 'GET' | 'POST', path: string,
  body?: unknown, idempotencyKey?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
  };
  if (method === 'POST') {
    headers['Content-Type'] = 'application/json';
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  }
  const controller = new AbortController();
  const timeoutMs = 20000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const res = await fetch(`${SNIPPE_BASE}${path}`, {
    method,
    headers,
    signal: controller.signal,
    ...(body ? { body: JSON.stringify(body) } : {}),
  }).finally(() => clearTimeout(timeout));

  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    throw new Error(`Snippe HTTP ${res.status}${raw ? `: ${raw}` : ''}`);
  }

  return res.json() as Promise<T>;
}

async function snippeCollect(
  req: { amount: number; phone_number: string; customer: { firstname: string; lastname: string; email: string }; webhook_url?: string; metadata?: Record<string, string> },
  options?: { apiKey?: string; idempotencyKey?: string },
): Promise<any> {
  const apiKey = options?.apiKey ?? getEnv('SNIPPE_API_KEY');
  return snippeFetch<any>(apiKey, 'POST', '/payments', {
    payment_type: 'mobile',
    details:      { amount: req.amount, currency: 'TZS' },
    phone_number: req.phone_number,
    customer:     req.customer,
    ...(req.webhook_url ? { webhook_url: req.webhook_url } : {}),
    ...(req.metadata    ? { metadata:    req.metadata    } : {}),
  }, options?.idempotencyKey);
}

async function snippePayout(req: any, options?: { apiKey?: string; idempotencyKey?: string }): Promise<any> {
  const apiKey = options?.apiKey ?? getEnv('SNIPPE_API_KEY');
  return snippeFetch<any>(apiKey, 'POST', '/payouts/send', req, options?.idempotencyKey);
}

function normalisePhone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.startsWith('255') && d.length === 12) return d;
  if (d.startsWith('0')   && d.length === 10) return `255${d.slice(1)}`;
  if (d.length === 9)                          return `255${d}`;
  return d;
}

// ─────────────────────────────────────────────────────────────
// CORS headers  (tighten origin in production)
// ─────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─────────────────────────────────────────────────────────────
// Payment type constants
// ─────────────────────────────────────────────────────────────

type PaymentType = 'subscription' | 'pos' | 'payout';
type PaymentChannel = 'mpesa' | 'airtel' | 'tigopesa' | 'halopesa' | 'bank' | 'mobile';

const MOBILE_MONEY_MIN_AMOUNT = 500;
const PAYOUT_FEE_AMOUNT = 1500;

interface InitiatePaymentRequest {
  payment_type:      PaymentType;
  channel:           PaymentChannel;
  amount:            number;
  business_id:       string;
  idempotency_key:   string;

  // Collection fields
  payer_phone?:    string;
  payer_name?:     string;
  payer_email?:    string;

  // Payout fields
  recipient_phone?:   string;
  recipient_name?:    string;
  recipient_bank?:    string;
  recipient_account?: string;

  // Link back to domain records
  subscription_id?: string;
  pos_order_id?:    string;

  metadata?: Record<string, string>;
}

// ─────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    // 1. Authenticate caller
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Missing Authorization header' }, 401);
    }

    // Admin/service client — bypasses RLS for trusted writes
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // User client — respects RLS; used to verify the JWT
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !user) {
      return json({ error: 'Unauthorized' }, 401);
    }

    // 2. Parse + validate request body
    let body: InitiatePaymentRequest;
    try {
      body = await req.json() as InitiatePaymentRequest;
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const validationError = validateRequest(body);
    if (validationError) {
      return json({ error: validationError }, 400);
    }

    // 3. Idempotency check: return early if this key was already processed
    const { data: existing } = await supabaseAdmin
      .from('payments')
      .select('id, status, gateway_reference')
      .eq('idempotency_key', body.idempotency_key)
      .maybeSingle();

    if (existing) {
      return json({
        success: true,
        duplicate: true,
        payment_id:        existing.id,
        gateway_reference: existing.gateway_reference,
        status:            existing.status,
        message:           'Payment already initiated',
      });
    }

    // 4. Load gateway config + resolve API key
    const { apiKey, webhookUrl, receiveConfig } =
      await resolveConfig(supabaseAdmin, body.business_id, body.payment_type);

    // 5. Insert payment record in PENDING state (before calling Snippe)
    // Normalise channel: mobile-money providers map to 'mobile'; bank stays 'bank'
    const dbChannel = body.channel === 'bank' ? 'bank' : 'mobile';

    const paymentInsert: Record<string, unknown> = {
      payment_type:    body.payment_type,
      business_id:     body.business_id,
      initiated_by:    user.id,
      amount:          body.amount,
      currency:        'TZS',
      status:          'pending',
      idempotency_key: body.idempotency_key,
      channel:         dbChannel,
      subscription_id: body.subscription_id ?? null,
      pos_order_id:    body.pos_order_id    ?? null,
    };

    if (body.payment_type !== 'payout') {
      paymentInsert.payer_phone = normalisePhone(body.payer_phone!);
      paymentInsert.payer_name  = body.payer_name  ?? null;
      paymentInsert.payer_email = body.payer_email ?? null;
    } else {
      paymentInsert.recipient_name         = body.recipient_name    ?? null;
      paymentInsert.recipient_phone        = body.recipient_phone ? normalisePhone(body.recipient_phone) : null;
      paymentInsert.recipient_bank_account = body.recipient_account ?? null;
      paymentInsert.recipient_bank_code    = body.recipient_bank    ?? null;
    }

    const { data: payment, error: insertErr } = await supabaseAdmin
      .from('payments')
      .insert(paymentInsert)
      .select('id')
      .single();

    if (insertErr || !payment) {
      console.error('payments insert error:', insertErr);
      return json({ error: 'Failed to record payment', detail: insertErr?.message ?? 'unknown' }, 500);
    }

    const paymentId: string = payment.id;

    // 6. Call Snippe API
    let gatewayReference: string | null = null;
    let errorCode:    string | null = null;
    let errorMessage: string | null = null;

    try {
      if (body.payment_type !== 'payout') {
        // Collection (USSD push to payer)
        const phone    = normalisePhone(body.payer_phone!);
        const nameParts = (body.payer_name ?? 'Customer').split(' ');

        const snippeResp = await snippeCollect(
          {
            amount:       body.amount,
            phone_number: phone,
            customer: {
              firstname: nameParts[0]  ?? 'Customer',
              lastname:  nameParts[1]  ?? '',
              email:     body.payer_email ?? `${phone}@noemail.com`,
            },
            webhook_url: webhookUrl,
            metadata: { payment_id: paymentId, ...body.metadata },
          },
          {
            idempotencyKey: body.idempotency_key,
          },
        );

        if (snippeResp.status === 'success' && snippeResp.data?.reference) {
          gatewayReference = snippeResp.data.reference;
        } else {
          errorCode    = snippeResp.error_code ?? 'SNIPPE_ERROR';
          errorMessage = snippeResp.message    ?? 'Unknown Snippe error';
        }
      } else {
        // Payout
        const payoutBody =
          body.channel === 'bank'
            ? {
                amount:            body.amount,
                channel:           'bank' as const,
                recipient_bank:    body.recipient_bank!,
                recipient_account: body.recipient_account!,
                recipient_name:    body.recipient_name!,
                narration:         'Business payout via SmartEnterprise',
                webhook_url:       webhookUrl,
                metadata: { payment_id: paymentId, ...body.metadata },
              }
            : {
                amount:          body.amount,
                channel:         'mobile' as const,
                recipient_phone: normalisePhone(body.recipient_phone!),
                recipient_name:  body.recipient_name!,
                narration:       'Business payout via SmartEnterprise',
                webhook_url:     webhookUrl,
                metadata: { payment_id: paymentId, ...body.metadata },
              };

        const snippeResp = await snippePayout(
          payoutBody,
          { apiKey, idempotencyKey: body.idempotency_key },
        );

        if (snippeResp.status === 'success' && snippeResp.data?.reference) {
          gatewayReference = snippeResp.data.reference;
        } else {
          errorCode    = snippeResp.error_code ?? 'SNIPPE_ERROR';
          errorMessage = snippeResp.message    ?? 'Unknown Snippe error';
        }
      }
    } catch (snippeErr) {
      console.error('Snippe API error:', snippeErr);
      errorCode    = 'FETCH_ERROR';
      errorMessage = snippeErr instanceof Error ? snippeErr.message : 'Network error';
    }

    // 7. Update payment record with Snippe result
    const newStatus = gatewayReference ? 'processing' : 'failed';

    const { error: updateErr } = await supabaseAdmin
      .from('payments')
      .update({
        status:            newStatus,
        gateway_reference: gatewayReference,
        error_code:        errorCode,
        error_message:     errorMessage,
      })
      .eq('id', paymentId);

    if (updateErr) {
      // Non-fatal — payment is still recorded; log and continue
      console.error('payment update error:', updateErr);
    }

    if (!gatewayReference) {
      return json({
        success: false,
        payment_id: paymentId,
        status:     'failed',
        error_code: errorCode,
        message:    errorMessage,
      });
    }

    return json({
      success:           true,
      payment_id:        paymentId,
      gateway_reference: gatewayReference,
      status:            'processing',
      message:           'Payment initiated successfully',
    });

  } catch (err) {
    console.error('Unhandled error:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: 'Internal server error', detail: msg }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function validateRequest(body: InitiatePaymentRequest): string | null {
  if (!body.payment_type) return 'payment_type is required';
  if (!['subscription', 'pos', 'payout'].includes(body.payment_type))
    return 'Invalid payment_type';
  if (!body.channel)           return 'channel is required';
  if (typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount <= 0) {
    return 'amount must be a positive number';
  }

  if (!body.business_id?.trim()) return 'business_id is required';
  if (!body.idempotency_key?.trim()) return 'idempotency_key is required';
  if (body.idempotency_key.length > 120) return 'idempotency_key is too long';

  if (body.payment_type !== 'payout' && body.amount < MOBILE_MONEY_MIN_AMOUNT) {
    return `Mobile money payments must be at least TZS ${MOBILE_MONEY_MIN_AMOUNT.toLocaleString()}`;
  }
  if (body.payment_type === 'payout' && body.amount <= PAYOUT_FEE_AMOUNT) {
    return `Payout amount must be greater than TZS ${PAYOUT_FEE_AMOUNT.toLocaleString()} fee`;
  }

  if (body.payment_type !== 'payout') {
    if (!body.payer_phone?.trim()) return 'payer_phone is required for collections';
    const normalized = normalisePhone(body.payer_phone);
    if (!/^255\d{9}$/.test(normalized)) {
      return 'payer_phone must be a valid Tanzania mobile number';
    }
  } else {
    if (!body.recipient_name?.trim()) return 'recipient_name is required for payouts';
    if (body.recipient_name.trim().length < 3 || body.recipient_name.trim().length > 80) {
      return 'recipient_name must be between 3 and 80 characters';
    }

    if (body.channel === 'bank') {
      if (!body.recipient_bank?.trim()) return 'recipient_bank is required for bank payout';
      if (!body.recipient_account?.trim()) return 'recipient_account is required for bank payout';
      if (!/^[A-Za-z0-9]{6,34}$/.test(body.recipient_account.replace(/\s+/g, ''))) {
        return 'recipient_account must be 6-34 letters/numbers';
      }
    } else {
      if (!body.recipient_phone?.trim()) return 'recipient_phone is required for mobile payout';
      if (!/^255\d{9}$/.test(normalisePhone(body.recipient_phone))) {
        return 'recipient_phone must be a valid Tanzania mobile number';
      }
    }
  }

  return null;
}

async function resolveConfig(
  // Typed as any — Edge Functions use an untyped client (no DB schema provided)
  admin: any,
  businessId: string,
  paymentType: PaymentType,
): Promise<{ apiKey: string; webhookUrl: string | undefined; receiveConfig: unknown }> {
  // Always use the platform SNIPPE_API_KEY set in Edge Function secrets.
  const apiKey = Deno.env.get('SNIPPE_API_KEY');
  if (!apiKey) throw new Error('SNIPPE_API_KEY environment variable is not set');

  // Load platform webhook URL from gateway config (optional — may not exist yet)
  const { data: gatewayCfg } = await admin
    .from('payment_gateway_config')
    .select('webhook_url')
    .maybeSingle();

  const envSupabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const fallbackWebhookUrl = envSupabaseUrl
    ? `${envSupabaseUrl}/functions/v1/snippe-webhook`
    : undefined;
  const webhookUrl = (gatewayCfg?.webhook_url as string | undefined) ?? fallbackWebhookUrl;

  return { apiKey, webhookUrl, receiveConfig: gatewayCfg };
}
