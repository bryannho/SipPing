-- =============================================================
-- SipPing: Initial Database Schema
-- Creates all 6 core tables, enums, indexes, and triggers
-- =============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================
-- Custom Types
-- =============================================================
CREATE TYPE drink_type AS ENUM ('water', 'shot');
CREATE TYPE ping_status AS ENUM ('pending', 'accepted', 'declined', 'snoozed');
CREATE TYPE trip_status AS ENUM ('active', 'completed', 'archived');

-- =============================================================
-- 1. USERS
-- Public profile table linked to Supabase Auth
-- =============================================================
CREATE TABLE public.users (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  expo_push_token TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- 2. TRIPS
-- =============================================================
CREATE TABLE public.trips (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  start_date  DATE NOT NULL,
  end_date    DATE,
  status      trip_status NOT NULL DEFAULT 'active',
  created_by  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  invite_code TEXT UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trips_status ON public.trips(status);
CREATE INDEX idx_trips_created_by ON public.trips(created_by);

-- =============================================================
-- 3. TRIP_MEMBERS
-- =============================================================
CREATE TABLE public.trip_members (
  trip_id   UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, user_id)
);

CREATE INDEX idx_trip_members_user_id ON public.trip_members(user_id);

-- =============================================================
-- 4. DRINK_PINGS
-- =============================================================
CREATE TABLE public.drink_pings (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id        UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  from_user_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  to_user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type           drink_type NOT NULL,
  status         ping_status NOT NULL DEFAULT 'pending',
  sender_note    TEXT,
  response_note  TEXT,
  scheduled_at   TIMESTAMPTZ,
  responded_at   TIMESTAMPTZ,
  snoozed_until  TIMESTAMPTZ,
  snooze_count   INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_drink_pings_trip_id ON public.drink_pings(trip_id);
CREATE INDEX idx_drink_pings_to_user ON public.drink_pings(to_user_id, status);
CREATE INDEX idx_drink_pings_snoozed ON public.drink_pings(status, snoozed_until)
  WHERE status = 'snoozed';

-- =============================================================
-- 5. SCHEDULED_RULES
-- =============================================================
CREATE TABLE public.scheduled_rules (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id          UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  from_user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  to_user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type             drink_type NOT NULL,
  start_time       TIME NOT NULL,
  end_time         TIME NOT NULL,
  interval_minutes INTEGER NOT NULL CHECK (interval_minutes > 0),
  timezone         TEXT NOT NULL DEFAULT 'UTC',
  active           BOOLEAN NOT NULL DEFAULT true,
  last_fired_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scheduled_rules_active ON public.scheduled_rules(active, trip_id)
  WHERE active = true;

-- =============================================================
-- 6. DRINK_LOG
-- =============================================================
CREATE TABLE public.drink_log (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id   UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type      drink_type NOT NULL,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ping_id   UUID REFERENCES public.drink_pings(id) ON DELETE SET NULL,
  image_url TEXT
);

CREATE INDEX idx_drink_log_trip_user ON public.drink_log(trip_id, user_id);
CREATE INDEX idx_drink_log_logged_at ON public.drink_log(logged_at);

-- =============================================================
-- Trigger: auto-update updated_at
-- =============================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_users
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_trips
  BEFORE UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =============================================================
-- Trigger: auto-create public.users row on auth signup
-- =============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.email, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
