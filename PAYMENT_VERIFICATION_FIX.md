# Payment Verification Fix — Reason & Solution

## Problem You Reported

After successfully paying **500 TZS via Snippe**:
- ❌ No success message displayed
- ❌ Dashboard reloaded showing the order as still **pending**
- ❌ **Wallet balance not updated**
- ❌ Payment record not visible anywhere

## Root Causes Identified

### 1. **No Payment Verification After Initiation**
When you initiated a mobile money payment, the app:
- Sent the USSD prompt to the customer's phone ✓
- Returned a "Request Sent" message
- **But then did nothing** — it never checked if the payment actually completed

The order only updates when the Snippe webhook fires AND the sales table is updated. If you never checked, you wouldn't know if:
- The customer confirmed on their phone
- The webhook was received by Supabase
- The order status actually changed

### 2. **Silent Webhook Failures**
If the webhook encountered an error:
- It would log the error but **not inform the user**
- The order would remain "pending" indefinitely
- No visibility into what went wrong

### 3. **Dashboard Doesn't Auto-Refresh**
Even if the webhook succeeded and updated the database:
- The dashboard wasn't polling for changes
- You'd only see the update if you manually refreshed

---

## Solution Implemented

### 1. **Auto-Polling for Payment Completion** 🔄
After initiating a mobile money payment, the app now:

```javascript
pollPaymentStatus(paymentId, maxAttempts = 60)
  ↓ checks every 5 seconds
  ↓ runs for up to 5 minutes
  ↓ stops early if payment completes/fails
```

**What it does:**
- Calls `verify-payment` Edge Function
- Checks Snippe gateway for current payment status
- If completed → Shows success
- If failed/expired → Shows error
- If still processing → Keeps polling (silently)

### 2. **Webhook Logging Improvements** 📋
Webhook now logs:
- ✓ Signature verification: `[Webhook] ✓ Signature verified — Event: payment.completed`
- ✓ Payment lookup: `[Webhook] ✓ Found payment abc-123 (type: pos, current: processing)`
- ✓ Status transitions: `[Webhook] ✓ Payment abc-123 transitioned processing → completed`
- ✓ Side-effects: `[Webhook.POS] ✓ Order pos-456 updated to paid/completed`
- ✗ Failures with context: `[Webhook] ✗ Signature verification failed: ...`

These logs appear in Supabase Edge Function logs → helps diagnose issues.

### 3. **User Feedback Flow** 💬

#### When Payment Initiates:
```
User taps "Charge Mobile Money"
  ↓
USSD prompt sent to customer's phone
  ↓
Alert: "A payment prompt has been sent to 255XXXXXXXXX"
  ↓
([Background Polling Starts])
```

#### If Payment Completes (within 5 minutes):
```
Polling detects: status = 'completed'
  ↓
Sales table updated via webhook/trigger
  ↓
Wallet transaction recorded automatically
  ↓
Alert: "✓ Payment Confirmed — Order and wallet updated"
```

#### If Payment Fails:
```
Polling detects: status = 'failed'
  ↓
Alert: "✗ Payment Failed — Please try again"
```

#### If Customer Never Confirms (timeout):
```
5 minutes pass, still waiting for confirmation
  ↓
Polling stops silently (customer already waiting anyway)
  ↓
User can manually refresh or try again later
```

---

## What Gets Updated When Payment Completes

### 1. **Sales Table** (Order Status)
```sql
UPDATE sales 
SET payment_status = 'paid',
    status = 'completed'
WHERE id = order_id;
```

### 2. **Wallet Account** (Balance)
The `trg_sale_wallet` trigger automatically:
```sql
INSERT INTO wallet_transactions (...)  -- Create audit record
UPDATE wallet_accounts 
SET balance = balance + 500,
    total_collected = total_collected + 500;
```

### 3. **Payment Audit Log**
For traceability:
```
payment_id: abc-123-def
event_type: webhook.payment.completed
old_status: processing
new_status: completed
metadata: {...full Snippe response...}
```

---

## How to Test

### Test 1: Automatic Polling
1. Go to Bills → Create a sale
2. Select "Mobile Money" as payment method
3. Enter a test phone number (e.g., 07XXXXXXXX)
4. Tap "Charge Mobile Money"
5. **Expected:** See "Request Sent" alert
6. Monitor browser console (F12) → look for:
   ```
   [Payment Poll] Status: processing (attempt 1/60)
   [Payment Poll] Status: processing (attempt 2/60)
   ...
   [Payment Poll] Status: completed (attempt 15/60)
   ```

### Test 2: Webhook Logging
1. In Supabase dashboard → go to Edge Functions
2. Select `snippe-webhook`
3. Look at recent invocation logs:
   ```
   [Webhook] ✓ Signature verified — Event: payment.completed
   [Webhook.POS] ✓ Order xyz-789 updated to paid/completed
   ```

### Test 3: End-to-End
1. After payment completes:
   - ✅ Order status should be "completed"
   - ✅ Wallet balance should increase by 500 TZS
   - ✅ Wallet transaction should appear in transaction history
   - ✅ Dashboard should regenerate receipt

---

## Deployment Checklist

- [ ] **Deploy Edge Functions**
  ```bash
  supabase functions deploy initiate-payment
  supabase functions deploy verify-payment
  supabase functions deploy snippe-webhook
  ```

- [ ] **Verify Webhook URL**
  In Supabase dashboard:
  ```
  SELECT webhook_url FROM payment_gateway_config;
  ```
  Should be: `https://<supabase-project>.supabase.co/functions/v1/snippe-webhook`

- [ ] **Verify Webhook Secret**
  In Supabase → Edge Function Secrets:
  ```
  SNIPPE_WEBHOOK_SECRET = <from Snippe dashboard>
  ```

- [ ] **Test in Staging** with actual phone numbers

- [ ] **Monitor Logs**
  - Edge Function logs for webhook events
  - Database audit log for payment records
  - Mobile app console for polling status

---

## Troubleshooting

### Still showing "pending" after payment?

**Check 1: Is polling running?**
```javascript
Open browser console (F12)
Look for: [Payment Poll] Status: ...
```

**Check 2: Did webhook fire?**
```sql
SELECT * FROM payment_audit_log 
WHERE payment_id = 'xxx'
ORDER BY created_at DESC;
```

**Check 3: Is wallet transaction recorded?**
```sql
SELECT * FROM wallet_transactions
WHERE business_id = 'yyy'
ORDER BY created_at DESC
LIMIT 5;
```

### Webhook signature fails?

- Confirm `SNIPPE_WEBHOOK_SECRET` in Edge Function Secrets matches Snippe dashboard
- Check network tab — verify raw request body is correct format
- Sign up for Snippe webhook logs to see if they're sending it

### Polling times out but payment actually completed?

The customer's money may have gone through at Snippe's end but didn't update your DB yet.

**Manual recovery:**
1. Go to wallet → find the payment record
2. Tap "Verify Payment" button (if available)
3. Or refresh and check sales table directly in Supabase

---

## Files Changed

1. **`src/screens/bills/BillsScreen.tsx`**
   - Added `pollPaymentStatus()` function
   - Auto-start polling after successful payment initiation
   - Show success/failure alerts based on polling result

2. **`supabase/functions/snippe-webhook/index.ts`**
   - Enhanced logging at every stage
   - Use `Promise.allSettled()` for robust side-effects
   - Log errors with full context

3. **`scripts/wallet-module.sql`**
   - No changes (already has correct trigger logic)

---

## Next Steps

- **For now:** Monitor logs when you process test payments
- **If issues persist:** Check Snippe webhook settings
- **Consider:** Adding manual "Verify Payment" button to orders in pending state
