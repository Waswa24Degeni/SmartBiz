-- Fix Messaging system constraints and RLS

-- 1. Update the check constraint on 'notifications' table to allow 'message' type.
-- First, drop the existing check constraint.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Add it back with 'message' included
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check 
  CHECK (type IN ('low_stock', 'subscription', 'sales', 'system', 'payment', 'message'));

-- 2. Add an RLS policy so teammates can send messages to each other.
-- Currently, the 'notifications_own' policy only allows inserting if user_id = auth.uid(),
-- which prevents you from sending a message to a staff member (since user_id = staff_id).
DROP POLICY IF EXISTS "teammates_send_messages" ON notifications;
CREATE POLICY "teammates_send_messages" ON notifications
  FOR INSERT WITH CHECK (
    -- Allow insert if the notification type is 'message' and the sender and recipient share a business_id
    type = 'message' AND
    EXISTS (
      SELECT 1 FROM users sender
      JOIN users recipient ON sender.business_id = recipient.business_id
      WHERE sender.id = auth.uid() AND recipient.id = notifications.user_id
    )
  );
