-- =============================================================
-- SipPing: Add avatar_url to users table
-- Supports profile photos (uploaded) and Google OAuth avatars
-- =============================================================

-- Add avatar_url column (nullable — existing users get NULL, fallback to initials)
ALTER TABLE public.users ADD COLUMN avatar_url TEXT;

-- Update the handle_new_user trigger to capture avatar_url from OAuth metadata.
-- Google provides: full_name, avatar_url, email in raw_user_meta_data.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, name, email, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.email, ''),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
