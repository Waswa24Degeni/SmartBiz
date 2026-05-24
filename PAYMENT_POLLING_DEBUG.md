# Payment Polling Not Detecting Completion — Debugging Guide

## Issue
After confirming payment on your phone, the app continues showing:
```
"Payment request sent. Waiting for customer confirmation on phone..."
```

The polling loop is not detecting that the payment completed.

---

## Root Cause Analysis

The polling function calls `verify-payment` Edge Function, which:
1. Queries Snippe API for current payment status
2. Gets response like: `{ status: "success", data: { status: "pending" | "completed" | "failed" } }`
3. Maps to internal status: `pending → processing`, `completed → completed`
4. Returns the status to the client

**The issue is likely one of:**
- ✗ `verify-payment` Edge Function is not deployed to Supabase yet
- ✗ Snippe API is not returning `status: "completed"` even though payment went through
- ✗ The status mapping is incorrect or missing
- ✗ Side-effects (sales table update) are failing silently

---

## Step 1: Deploy Updated Edge Functions

### Required deployments:
```bash
supabase functions deploy verify-payment
supabase functions deploy initiate-payment
supabase functions deploy snippe-webhook
```

### Verify deployment:
```bash
supabase functions list
```

Should show all three functions with status `✓ Active`.

---

## Step 2: Check Browser Console for Detailed Logs

When you process a test payment:

1. **Open DevTools** (F12 in browser)
2. **Click "Console" tab**
3. **Process a mobile money payment** (500 TZS test)
4. **Confirm on your phone** (when prompt appears)
5. **Watch the console** — look for logs like:

```
[BillsScreen] Starting payment verification...
[Payment Poll] Calling verify-payment (attempt 1/60)...
[Payment Poll] Response (attempt 1): { data: {...}, error: null }
[Payment Poll] Status value: "processing" | Full data: {...}
[Payment Poll] Still waiting... (1/60)
```

**After you confirm payment, logs should change to:**
```
[Payment Poll] Response (attempt 5): { data: {...}, error: null }
[Payment Poll] Status value: "completed" | Full data: {...}
[Payment Poll] ✓ Payment completed!
BillsScreen] Payment completed, refreshing sales...
✓ Payment Confirmed — Order and wallet updated.
```

---

## Step 3: If polling shows `"processing"` for 5 minutes

### That means:
- ✓ Snippe received the USSD push
- ✓ Customer is waiting on their phone
- ✗ Customer hasn't confirmed yet

**Action:** Wait for customer to enter PIN/confirm on USSD menu.

---

## Step 4: If polling shows wrong status values

### Example: Status keeps showing `"processing"` even after you confirm

**Copy the full logged response:**
```
[Payment Poll] Status value: "???" | Full data: {
  success: true,
  payment_id: "abc-123",
  status: "???",
  gateway_reference: "snippe-ref-456",
  gateway_data: { ... }
}
```

### Check Edge Function logs in Supabase:

1. Go to Supabase dashboard
2. **Functions** → `verify-payment`
3. **Logs** tab (right side)
4. Look for entries when you tested:
   ```
   [Verify-Payment] Payment abc-123: processing → ??? (Snippe: ???)
   [Verify-Payment.POS] ✓ Order xyz-789 updated to paid/completed
   ```

---

## Step 5: Check Snippe API Response

If Edge Function logs show `Snippe: "pending"` even after customer confirmed:

### The issue is at Snippe's side:
- Snippe hasn't processed the confirmation yet
- Snippe API is cached or delayed
- Network issue between Supabase and Snippe

### Action:
1. Check Snippe webhook logs (in Snippe dashboard)
2. Verify Snippe received `payment.completed` event from customer's phone
3. Ask Snippe support if API status is delayed

---

## Step 6: Manual Payment Verification

If automated polling times out:

### Option A: Verify in Supabase Dashboard
```sql
-- Check current payment record
SELECT id, status, gateway_reference, payment_type, pos_order_id 
FROM payments 
WHERE pos_order_id = 'your-sale-id' 
ORDER BY created_at DESC;

-- Check if sales order was updated
SELECT id, status, payment_status 
FROM sales 
WHERE id = 'your-sale-id';

-- Check wallet transaction
SELECT * FROM wallet_transactions 
WHERE reference = 'your-sale-id' 
ORDER BY created_at DESC;
```

### Option B: Manually call verify-payment
From your app's browser console:
```javascript
const paymentId = 'abc-123-def'; // from earlier logs
const response = await fetch(
  'https://<project>.supabase.co/functions/v1/verify-payment',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('sb_token')}`
    },
    body: JSON.stringify({ payment_id: paymentId })
  }
);
const data = await response.json();
console.log('Manual verify result:', data);
```

---

## Troubleshooting Checklist

| Issue | Check | Fix |
|-------|-------|-----|
| Polling times out at "processing" | Customer hasn't confirmed USSD | Wait/remind customer to check phone |
| Logs show `error: "verify-payment error"` | Edge Function not deployed | Run `supabase functions deploy verify-payment` |
| Logs show `status: "processing"` for hours | Snippe API is slow | Check Snippe webhook logs, contact support |
| Order never updates to "completed" | Side-effect handlers failing | Check Edge Function logs for `[Verify-Payment.POS]` errors |
| Wallet not updated | Trigger not firing | Check `trg_sale_wallet` trigger in database |
| Payment marked "failed" | Customer rejected USSD | Show user error and allow retry |

---

## Key Console Logs to Capture

When reporting issues, paste the **full console output**:

```
[BillsScreen] Starting payment verification for order ... (payment_id: ...)
[Payment Poll] Calling verify-payment (attempt 1/60)...
[Payment Poll] Response (attempt 1): { data: {...}, error: null }
[Payment Poll] Status value: "???" | Full data: {
  success: ...,
  payment_id: ...,
  status: ...,
  gateway_reference: ...,
  gateway_data: ...
}
```

This helps us see:
- If verify-payment is being called
- What Snippe is returning
- If status mapping is working
- If polling is stuck/timing out

---

## Next Steps

1. **Deploy functions:** `supabase functions deploy verify-payment`
2. **Test payment:** Process 500 TZS mobile money payment
3. **Check console:** F12 → Console tab → watch logs
4. **Confirm on phone:** When USSD appears
5. **Report logs:** If still not working, share the console output above

Let me know what status values you're seeing in the console and we'll fix it!
