  /**
   * snippe-webhook/index.ts — Supabase Edge Function
   *
   * Receives and processes Snippe payment/payout webhooks.
   *
   * POST /functions/v1/snippe-webhook
   * No auth header required (public endpoint — verified by HMAC signature).
   *
   * Required env vars:
   *   SNIPPE_WEBHOOK_SECRET   — from Snippe dashboard
   *   SUPABASE_URL
   *   SUPABASE_SERVICE_ROLE_KEY
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

  async function snippePayout(req: any, options?: { apiKey?: string; idempotencyKey?: string }): Promise<any> {
    const apiKey = options?.apiKey ?? getEnv('SNIPPE_API_KEY');
    return snippeFetch<any>(apiKey, 'POST', '/payouts/send', req, options?.idempotencyKey);
  }

  async function verifyWebhookSignature(
    rawBody: Uint8Array, signature: string, timestamp: string,
    options?: { secret?: string; toleranceSecs?: number },
  ): Promise<Record<string, unknown>> {
    const secret    = options?.secret ?? getEnv('SNIPPE_WEBHOOK_SECRET');
    const tolerance = options?.toleranceSecs ?? 300;
    const ts = parseInt(timestamp, 10);
    if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > tolerance)
      throw new Error('Webhook timestamp out of tolerance window');

    const enc     = new TextEncoder();
    const key     = await crypto.subtle.importKey(
      'raw', enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const tsBytes   = enc.encode(`${timestamp}.`);
    const signedBuf = new Uint8Array(tsBytes.length + rawBody.length);
    signedBuf.set(tsBytes, 0);
    signedBuf.set(rawBody, tsBytes.length);
    const sigBuf   = await crypto.subtle.sign('HMAC', key, signedBuf);
    const expected = Array.from(new Uint8Array(sigBuf))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    if (expected.length !== signature.length) throw new Error('Webhook signature mismatch');
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    if (diff !== 0) throw new Error('Webhook signature mismatch');

    return JSON.parse(new TextDecoder().decode(rawBody));
  }

  // ─────────────────────────────────────────────────────────────
  // Snippe webhook event types
  // ─────────────────────────────────────────────────────────────

  interface SnippeWebhookPayload {
    event:     string;   // e.g. "payment.completed", "payout.failed"
    reference: string;   // Snippe gateway reference
    status:    string;
    amount?:   { value: number; currency: string };
    metadata?: Record<string, string>;
    [key: string]: unknown;
  }

  // Snippe event → internal status mapping
  const EVENT_TO_STATUS: Record<string, string> = {
    'payment.completed': 'completed',
    'payment.failed':    'failed',
    'payment.expired':   'expired',
    'payout.completed':  'completed',
    'payout.failed':     'failed',
  };

  // ─────────────────────────────────────────────────────────────
  // Main handler
  // ─────────────────────────────────────────────────────────────

  serve(async (req: Request) => {
    // Webhooks are always POST
    if (req.method !== 'POST') {
      return response({ error: 'Method not allowed' }, 405);
    }

    // Read raw body before any parsing (needed for signature verification)
    const rawBody = new Uint8Array(await req.arrayBuffer());

    // 1. Extract signature headers
    const signature = req.headers.get('X-Webhook-Signature') ?? '';
    const timestamp  = req.headers.get('X-Webhook-Timestamp')  ?? '';

    if (!signature || !timestamp) {
      return response({ error: 'Missing webhook signature headers' }, 400);
    }

    // 2. Verify HMAC signature + replay-attack window
    let payload: SnippeWebhookPayload;
    try {
      const parsed = await verifyWebhookSignature(rawBody, signature, timestamp);
      payload = parsed as SnippeWebhookPayload;
      console.log(`[Webhook] ✓ Signature verified — Event: ${payload.event}, Ref: ${payload.reference}`);
    } catch (err) {
      console.error('[Webhook] ✗ Signature verification failed:', err);
      // Return 400 so Snippe stops retrying invalid calls
      return response({ error: 'Invalid webhook signature' }, 400);
    }

    // 3. Early ack — Snippe expects a 200 quickly; heavy work below
    //    (Edge Functions are synchronous, so we just keep it fast)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    try {
      // 4. Look up the payment record by gateway_reference
      const { data: payment, error: fetchErr } = await supabase
        .from('payments')
        .select('id, status, payment_type, business_id, subscription_id, pos_order_id, amount')
        .eq('gateway_reference', payload.reference)
        .maybeSingle();

      if (fetchErr) {
        console.error(`[Webhook] ✗ Payments lookup failed for ref ${payload.reference}:`, fetchErr);
        // Return 200 so Snippe doesn't retry; we log for manual investigation
        return response({ received: true, warning: 'DB lookup failed' });
      }

      if (!payment) {
        console.warn(`[Webhook] ⚠ Unknown reference: ${payload.reference}`);
        // 200 OK — prevent Snippe from retrying for references we don't know
        return response({ received: true, warning: 'Unknown reference' });
      }

      console.log(`[Webhook] ✓ Found payment ${payment.id} (type: ${payment.payment_type}, current: ${payment.status})`);

      // 5. Map event to internal status
      const newStatus = EVENT_TO_STATUS[payload.event];

      if (!newStatus) {
        console.log(`[Webhook] ⚠ Unhandled event type: ${payload.event}`);
        return response({ received: true });
      }

      // 6. Skip if already in this state or a later terminal state
      const terminalStates = ['completed', 'failed', 'expired', 'refunded'];
      if (payment.status === newStatus || (terminalStates.includes(payment.status) && newStatus !== 'refunded')) {
        return response({ received: true, skipped: 'no status change needed' });
      }

      // 7. Update payment status (the audit trigger fires automatically)
      const { error: updateErr } = await supabase
        .from('payments')
        .update({
          status:        newStatus,
          error_code:    payload.event.endsWith('.failed') ? 'GATEWAY_FAILED' : null,
          error_message: payload.event.endsWith('.failed')
            ? (payload.message as string | undefined ?? 'Payment failed at gateway')
            : null,
        })
        .eq('id', payment.id);

      if (updateErr) {
        console.error('payment update error:', updateErr);
        // Return 500 so Snippe will retry — this is a real failure we want to fix
        return response({ error: 'Failed to update payment status' }, 500);
      }

      // 8. Post-completion side effects
      if (newStatus === 'completed') {
        console.log(`[Webhook] Payment completed (${payment.id}) — triggering side effects`);
        const sideEffects = await Promise.allSettled([
          handleSubscriptionActivation(supabase, payment),
          triggerAdminPayout(supabase, payment),
          handlePosOrderCompletion(supabase, payment),
        ]);

        // Log any side-effect failures
        sideEffects.forEach((result, idx) => {
          if (result.status === 'rejected') {
            console.error(
              `[Webhook] Side-effect ${idx === 0 ? 'subscription' : 'pos'} failed:`,
              result.reason,
            );
          }
        });
      }

      // 9. Store raw webhook payload in audit log for traceability
      const { error: auditErr } = await supabase.from('payment_audit_log').insert({
        payment_id:  payment.id,
        event_type:  `webhook.${payload.event}`,
        old_status:  payment.status,
        new_status:  newStatus,
        actor_id:    null,     // external event
        metadata:    payload,  // full raw payload
      });

      if (auditErr) {
        console.warn('[Webhook] Audit log insert failed (non-fatal):', auditErr);
      }

      console.log(`[Webhook] ✓ Payment ${payment.id} transitioned ${payment.status} → ${newStatus}`);
      return response({ received: true, payment_id: payment.id, status: newStatus });

    } catch (err) {
      console.error('Webhook processing error:', err);
      // 500 → Snippe will retry; only use for transient failures
      return response({ error: 'Internal server error' }, 500);
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Side-effect handlers
  // ─────────────────────────────────────────────────────────────

  async function handleSubscriptionActivation(
    // Typed as any — Edge Functions use an untyped client (no DB schema provided)
    supabase: any,
    payment: { payment_type: string; subscription_id: string | null; business_id: string },
  ): Promise<void> {
    if (payment.payment_type !== 'subscription' || !payment.subscription_id) return;

    const { error } = await supabase
      .from('subscriptions')
      .update({
        status:       'active',
        activated_at: new Date().toISOString(),
      })
      .eq('id', payment.subscription_id)
      .eq('business_id', payment.business_id);  // defence in depth

    if (error) {
      console.error('subscription activation error:', error);
    }
  }

  async function triggerAdminPayout(
    supabase: any,
    payment: { id: string; amount: number; payment_type: string },
  ): Promise<void> {
    if (payment.payment_type !== 'subscription') return;

    const { data: gatewayCfg } = await supabase
      .from('payment_gateway_config')
      .select('*')
      .maybeSingle();

    if (!gatewayCfg) return;

    const method = gatewayCfg.receive_method;
    if (!method) return;

    const PAYOUT_FEE = 1500;
    const netAmount = payment.amount - PAYOUT_FEE;
    if (netAmount <= 0) return;

    const payoutBody: any = {
      amount: netAmount,
      channel: method,
      narration: `Subscription payout for payment ${payment.id}`,
      metadata: { original_payment_id: payment.id },
    };

    if (method === 'bank') {
      if (!gatewayCfg.receive_bank_code || !gatewayCfg.receive_bank_account) return;
      payoutBody.recipient_bank = gatewayCfg.receive_bank_code;
      payoutBody.recipient_account = gatewayCfg.receive_bank_account;
      payoutBody.recipient_name = gatewayCfg.receive_bank_account_name || 'Admin';
    } else {
      if (!gatewayCfg.receive_phone) return;
      const d = gatewayCfg.receive_phone.replace(/\D/g, '');
      const phone = (d.startsWith('0') && d.length === 10) ? `255${d.slice(1)}` : (d.length === 9 ? `255${d}` : d);
      payoutBody.recipient_phone = phone;
      payoutBody.recipient_name = gatewayCfg.receive_name || 'Admin';
    }

    try {
      console.log(`[Webhook.Payout] Triggering admin payout of ${netAmount} via ${method}`);
      const idempotencyKey = `payout_sub_${payment.id}`;
      await snippePayout(payoutBody, { idempotencyKey });
      console.log(`[Webhook.Payout] ✓ Admin payout initiated`);
    } catch (err) {
      console.error('[Webhook.Payout] Failed to trigger admin payout:', err);
      throw err;
    }
  }

  async function handlePosOrderCompletion(
    // Typed as any — Edge Functions use an untyped client (no DB schema provided)
    supabase: any,
    payment: { payment_type: string; pos_order_id: string | null; business_id: string },
  ): Promise<void> {
    if (payment.payment_type !== 'pos' || !payment.pos_order_id) return;

    console.log(`[Webhook.POS] Marking order ${payment.pos_order_id} as paid/completed`);

    const { error, data } = await supabase
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
        `[Webhook.POS] Failed to update order ${payment.pos_order_id}:`,
        error.message || error,
      );
      throw error; // Propagate so Promise.allSettled captures it
    }

    console.log(`[Webhook.POS] ✓ Order ${payment.pos_order_id} updated to paid/completed`);
  }

  // ─────────────────────────────────────────────────────────────
  // Response helper
  // ─────────────────────────────────────────────────────────────

  function response(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
