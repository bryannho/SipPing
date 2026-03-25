-- Add optional custom message to scheduled rules
ALTER TABLE public.scheduled_rules ADD COLUMN sender_note TEXT;
