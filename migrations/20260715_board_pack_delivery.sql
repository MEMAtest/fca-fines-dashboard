-- Reliable Board Pack lead notification lifecycle.

ALTER TABLE public.board_pack_leads
  ADD COLUMN IF NOT EXISTS notification_last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS notification_next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS notification_message_id text;

ALTER TABLE public.board_pack_leads
  DROP CONSTRAINT IF EXISTS board_pack_leads_notification_status_check;

ALTER TABLE public.board_pack_leads
  ADD CONSTRAINT board_pack_leads_notification_status_check
  CHECK (notification_status IN ('pending', 'processing', 'sent', 'failed'));

UPDATE public.board_pack_leads
SET notification_next_attempt_at = COALESCE(notification_next_attempt_at, created_at)
WHERE notification_status = 'pending';

CREATE INDEX IF NOT EXISTS board_pack_leads_notification_due_idx
  ON public.board_pack_leads (notification_next_attempt_at, created_at)
  WHERE notification_status = 'pending';
