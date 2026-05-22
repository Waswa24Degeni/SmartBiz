-- =============================================
-- SmartBiz: Support Messaging Module
-- Purpose:
-- 1) Enable threaded conversation between owners and admin on support tickets
-- 2) Allow admin to send notifications to owners
-- =============================================

-- Ensure admin helper exists
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Threaded messages for each support ticket
CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('owner', 'admin')),
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

-- Owner: view messages only for own tickets
DROP POLICY IF EXISTS "support_messages_owner_select" ON public.support_ticket_messages;
CREATE POLICY "support_messages_owner_select"
ON public.support_ticket_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.support_tickets t
    WHERE t.id = support_ticket_messages.ticket_id
      AND t.user_id = auth.uid()
  )
);

-- Owner: insert only into own tickets and only as owner sender
DROP POLICY IF EXISTS "support_messages_owner_insert" ON public.support_ticket_messages;
CREATE POLICY "support_messages_owner_insert"
ON public.support_ticket_messages
FOR INSERT
WITH CHECK (
  sender_user_id = auth.uid()
  AND sender_role = 'owner'
  AND EXISTS (
    SELECT 1
    FROM public.support_tickets t
    WHERE t.id = support_ticket_messages.ticket_id
      AND t.user_id = auth.uid()
  )
);

-- Admin: full access
DROP POLICY IF EXISTS "support_messages_admin_all" ON public.support_ticket_messages;
CREATE POLICY "support_messages_admin_all"
ON public.support_ticket_messages
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Keep ticket updated_at in sync when a new thread message is posted
CREATE OR REPLACE FUNCTION public.touch_support_ticket_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.support_tickets
  SET updated_at = now()
  WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_support_ticket_updated_at ON public.support_ticket_messages;
CREATE TRIGGER trg_touch_support_ticket_updated_at
AFTER INSERT ON public.support_ticket_messages
FOR EACH ROW EXECUTE FUNCTION public.touch_support_ticket_updated_at();

-- Admin notifications policies so admin can message owners directly
DROP POLICY IF EXISTS "notifications_admin_all" ON public.notifications;
CREATE POLICY "notifications_admin_all"
ON public.notifications
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin() OR user_id = auth.uid());

-- Internal team messaging: owner/staff can send notifications to teammates in same business
DROP POLICY IF EXISTS "notifications_internal_same_business_insert" ON public.notifications;
CREATE POLICY "notifications_internal_same_business_insert"
ON public.notifications
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.users sender
    JOIN public.users recipient ON recipient.id = notifications.user_id
    WHERE sender.id = auth.uid()
      AND sender.role IN ('owner', 'staff')
      AND recipient.role IN ('owner', 'staff')
      AND sender.business_id IS NOT NULL
      AND sender.business_id = recipient.business_id
  )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket_created
  ON public.support_ticket_messages(ticket_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_updated
  ON public.support_tickets(user_id, updated_at DESC);
