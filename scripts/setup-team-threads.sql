-- =============================================
-- SmartEnterprise: Team Threaded Messaging Module
-- =============================================

-- 1. team_threads
CREATE TABLE IF NOT EXISTS public.team_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  subject text NOT NULL,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. team_thread_participants
CREATE TABLE IF NOT EXISTS public.team_thread_participants (
  thread_id uuid NOT NULL REFERENCES public.team_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  last_read_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);

-- 3. team_messages
CREATE TABLE IF NOT EXISTS public.team_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.team_threads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================
-- Row Level Security (RLS)
-- =============================================
ALTER TABLE public.team_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_thread_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_messages ENABLE ROW LEVEL SECURITY;

-- Helper function to break infinite recursion
CREATE OR REPLACE FUNCTION get_my_team_threads()
RETURNS setof uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT thread_id FROM team_thread_participants WHERE user_id = auth.uid();
$$;

-- team_threads policies
DROP POLICY IF EXISTS "threads_select_participant" ON public.team_threads;
CREATE POLICY "threads_select_participant" ON public.team_threads
  FOR SELECT USING (
    created_by = auth.uid() OR 
    id IN (SELECT get_my_team_threads())
  );

DROP POLICY IF EXISTS "threads_insert_same_business" ON public.team_threads;
CREATE POLICY "threads_insert_same_business" ON public.team_threads
  FOR INSERT WITH CHECK (
    created_by = auth.uid() AND 
    business_id = get_my_business_id()
  );

-- team_thread_participants policies
DROP POLICY IF EXISTS "participants_select" ON public.team_thread_participants;
CREATE POLICY "participants_select" ON public.team_thread_participants
  FOR SELECT USING (
    thread_id IN (SELECT get_my_team_threads())
  );

DROP POLICY IF EXISTS "participants_insert" ON public.team_thread_participants;
CREATE POLICY "participants_insert" ON public.team_thread_participants
  FOR INSERT WITH CHECK (
    -- You can add participants who belong to the same business
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.id = user_id AND u.business_id = get_my_business_id()
    )
  );

DROP POLICY IF EXISTS "participants_update" ON public.team_thread_participants;
CREATE POLICY "participants_update" ON public.team_thread_participants
  FOR UPDATE USING (
    user_id = auth.uid()
  ) WITH CHECK (
    user_id = auth.uid()
  );

-- team_messages policies
DROP POLICY IF EXISTS "messages_select" ON public.team_messages;
CREATE POLICY "messages_select" ON public.team_messages
  FOR SELECT USING (
    thread_id IN (SELECT get_my_team_threads())
  );

DROP POLICY IF EXISTS "messages_insert" ON public.team_messages;
CREATE POLICY "messages_insert" ON public.team_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid() AND
    thread_id IN (SELECT get_my_team_threads())
  );

-- =============================================
-- Triggers
-- =============================================
-- When a new message is sent, update the thread's updated_at
CREATE OR REPLACE FUNCTION public.touch_team_thread_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.team_threads
  SET updated_at = now()
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_team_thread ON public.team_messages;
CREATE TRIGGER trg_touch_team_thread
AFTER INSERT ON public.team_messages
FOR EACH ROW EXECUTE FUNCTION public.touch_team_thread_updated_at();

-- =============================================
-- Indexes
-- =============================================
CREATE INDEX IF NOT EXISTS idx_team_participants_user ON public.team_thread_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_team_messages_thread ON public.team_messages(thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_team_threads_business ON public.team_threads(business_id, updated_at DESC);

-- =============================================
-- Realtime Subscriptions
-- =============================================
-- Ensure these tables broadcast changes over websockets so the app updates instantly
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'team_threads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_threads;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'team_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'team_thread_participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_thread_participants;
  END IF;
END $$;
