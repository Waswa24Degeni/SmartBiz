/**
 * verify-payment/index.ts — Supabase Edge Function
 *
 * Polls Snippe for the current status of a payment or payout and
 * updates the payments table accordingly (idempotent).
 *
 * POST /functions/v1/verify-payment
 * Auth: Bearer <user JWT>
 *
 * Body: { payment_id: string }
 */

import { serve }        from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─────────────────────────────────────────────────────────────
// Inlined from _shared/snippe.ts  (required for single-file deploy)
// ─────────────────────────────────────────────────────────────

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
  const res = await fetch(`https://api.snippe.sh/v1${path}`, {
    method, headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.json() as Promise<T>;
}

async function snippeGetStatus(reference: string, options?: { apiKey?: string }): Promise<any> {
  const apiKey = options?.apiKey ?? getEnv('SNIPPE_API_KEY');
  return snippeFetch<any>(apiKey, 'GET', `/payouts/${reference}`);
}

async function snippeGetCollectionStatus(reference: string, options?: { apiKey?: string }): Promise<any> {
  const apiKey = options?.apiKey ?? getEnv('SNIPPE_API_KEY');
  return snippeFetch<any>(apiKey, 'GET', `/payments/${reference}`);
}

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Snippe status → internal status mapping
const SNIPPE_TO_INTERNAL: Record<string, string> = {
  pending:   'processing',
  completed: 'completed',
  failed:    'failed',
  expired:   'expired',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return json('ok', 200);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    // Parse body
    let body: { payment_id: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }
    if (!body.payment_id) return json({ error: 'payment_id is required' }, 400);

    // Load payment record — enforce ownership via RLS on supabaseUser
    const { data: payment, error: fetchErr } = await supabaseUser
      .from('payments')
      .select(
        'id, status, gateway_reference, business_id, payment_type, initiated_by, subscription_id, pos_order_id',
      )
      .eq('id', body.payment_id)
      .maybeSingle();

    if (fetchErr) {
      console.error('payments fetch error:', fetchErr);
      return json({ error: 'Failed to fetch payment' }, 500);
    }
    if (!payment) return json({ error: 'Payment not found' }, 404);

    // If already in a terminal state, return immediately (idempotent)
    if (['completed', 'failed', 'expired', 'refunded'].includes(payment.status)) {
      return json({
        payment_id:        payment.id,
        status:            payment.status,
        gateway_reference: payment.gateway_reference,
        message:           'Payment already in terminal state',
      });
    }

    // Must have a gateway reference to poll Snippe
    if (!payment.gateway_reference) {
      return json({
        payment_id: payment.id,
        status:     payment.status,
        message:    'No gateway reference yet',
      });
    }

    // Resolve API key for this business
    const apiKey = await resolveApiKey(supabaseAdmin, payment.business_id);

    // Poll Snippe
    let snippeResp;
    try {
      snippeResp = payment.payment_type === 'payout'
        ? await snippeGetStatus(payment.gateway_reference, { apiKey })
        : await snippeGetCollectionStatus(payment.gateway_reference, { apiKey });
    } catch (err) {
      console.error('Snippe status fetch error:', err);
      return json({ error: 'Failed to fetch status from payment gateway' }, 502);
    }

    if (snippeResp.status !== 'success' || !snippeResp.data) {
      return json({ error: snippeResp.message ?? 'Gateway error' }, 502);
    }

    const newStatus = SNIPPE_TO_INTERNAL[snippeResp.data.status] ?? payment.status;

    console.log(`[Verify-Payment] Payment ${payment.id}: ${payment.status} → ${newStatus} (Snippe: ${snippeResp.data.status})`);

    // Only write if status actually changed (avoid spurious audit entries)
    if (newStatus !== payment.status) {
      console.log(`[Verify-Payment] Updating payment status from ${payment.status} to ${newStatus}`);
      
      const { error: updateErr } = await supabaseAdmin
        .from('payments')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', payment.id);

      if (updateErr) {
        console.error('[Verify-Payment] ✗ Payment status update failed:', updateErr);
        // Non-fatal — still return the current known status
      } else {
        console.log(`[Verify-Payment] ✓ Payment ${payment.id} status updated to ${newStatus}`);
      }

      // Keep core domain records in sync even when webhooks are delayed/misconfigured.
      if (newStatus === 'completed') {
        console.log(`[Verify-Payment] Payment completed — triggering side-effects for ${payment.payment_type}`);
        const sideEffects = await Promise.allSettled([
          handleSubscriptionActivation(supabaseAdmin, payment),
          handlePosOrderCompletion(supabaseAdmin, payment),
        ]);

        sideEffects.forEach((result, idx) => {
          if (result.status === 'rejected') {
            console.error(
              `[Verify-Payment] Side-effect ${idx === 0 ? 'subscription' : 'pos'} failed:`,
              result.reason,
            );
          } else {
            console.log(`[Verify-Payment] ✓ Side-effect ${idx === 0 ? 'subscription' : 'pos'} completed`);
          }
        });
      }
    } else {
      console.log(`[Verify-Payment] No status change needed (already ${payment.status})`);
    }

    const returnData = {
      success:           true,
      payment_id:        payment.id,
      status:            newStatus,
      gateway_reference: payment.gateway_reference,
      gateway_data:      snippeResp.data,
    };

    console.log(`[Verify-Payment] ✓ Returning response:`, returnData);
    return json(returnData);

  } catch (err) {
    console.error('[Verify-Payment] ✗ Unhandled error:', err);
    return json({ error: 'Internal server error', detail: err instanceof Error ? err.message : String(err) }, 500);
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

async function resolveApiKey(
  // Typed as any — Edge Functions use an untyped client (no DB schema provided)
  admin: any,
  businessId: string,
): Promise<string | undefined> {
  const { data: bizCfg } = await admin
    .from('business_payment_config')
    .select('use_own_snippe_key')
    .eq('business_id', businessId)
    .maybeSingle();

  if (bizCfg?.use_own_snippe_key) {
    const envName = `SNIPPE_API_KEY_${businessId.replace(/-/g, '_').toUpperCase()}`;
    return Deno.env.get(envName) ?? Deno.env.get('SNIPPE_API_KEY');
  }
  return Deno.env.get('SNIPPE_API_KEY');
}

async function handleSubscriptionActivation(
  supabase: any,
  payment: { payment_type: string; subscription_id?: string | null; business_id: string },
): Promise<void> {
  if (payment.payment_type !== 'subscription' || !payment.subscription_id) return;

  const { error } = await supabase
    .from('subscriptions')
    .update({
      status:       'active',
      activated_at: new Date().toISOString(),
    })
    .eq('id', payment.subscription_id)
    .eq('business_id', payment.business_id);

  if (error) {
    console.error('subscription activation error:', error);
  }
}

async function handlePosOrderCompletion(
  supabase: any,
  payment: { payment_type: string; pos_order_id?: string | null; business_id: string },
): Promise<void> {
  if (payment.payment_type !== 'pos' || !payment.pos_order_id) return;

  console.log(`[Verify-Payment.POS] Marking order ${payment.pos_order_id} as paid/completed`);

  const { error } = await supabase
    .from('sales')
    .update({
      payment_status: 'paid',
      status:         'completed',
      updated_at:     new Date().toISOString(),
    })
    .eq('id', payment.pos_order_id)
    .eq('business_id', payment.business_id);

  if (error) {
    console.error(
      `[Verify-Payment.POS] Failed to update order ${payment.pos_order_id}:`,
      error.message || error,
    );
    throw error;
    console.log(`[Verify-Payment.POS] ✓ Order ${payment.pos_order_id} updated to paid/completed`);
  }
}
