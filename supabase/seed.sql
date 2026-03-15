-- =============================================================
-- SipPing: Seed Data for Development / Testing
-- =============================================================
-- Prerequisites: create auth users first via Supabase Dashboard or CLI:
--   npx supabase auth signup --email alice@test.com --password test1234
--   npx supabase auth signup --email bob@test.com --password test1234
--
-- The handle_new_user trigger auto-creates public.users rows.
-- This seed adds trips, pings, and other test data.

DO $$
DECLARE
  alice_id UUID;
  bob_id UUID;
  trip_id UUID;
BEGIN
  -- Look up auth users by email
  SELECT id INTO alice_id FROM auth.users WHERE email = 'alice@test.com';
  SELECT id INTO bob_id FROM auth.users WHERE email = 'bob@test.com';

  IF alice_id IS NULL OR bob_id IS NULL THEN
    RAISE NOTICE 'Seed skipped: create auth users first (alice@test.com, bob@test.com)';
    RETURN;
  END IF;

  -- Update user names
  UPDATE public.users SET name = 'Alice' WHERE id = alice_id;
  UPDATE public.users SET name = 'Bob' WHERE id = bob_id;

  -- Create a trip
  INSERT INTO public.trips (id, name, start_date, end_date, status, created_by, invite_code)
  VALUES (uuid_generate_v4(), 'Beach Weekend', '2026-03-15', '2026-03-17', 'active', alice_id, 'BEACH1')
  RETURNING id INTO trip_id;

  -- Add both users as trip members
  INSERT INTO public.trip_members (trip_id, user_id) VALUES
    (trip_id, alice_id),
    (trip_id, bob_id);

  -- Create sample drink pings
  -- 1. Pending water ping from Alice to Bob
  INSERT INTO public.drink_pings (trip_id, from_user_id, to_user_id, type, status, sender_note)
  VALUES (trip_id, alice_id, bob_id, 'water', 'pending', 'Stay hydrated!');

  -- 2. Accepted shot ping from Bob to Alice
  INSERT INTO public.drink_pings (trip_id, from_user_id, to_user_id, type, status, responded_at)
  VALUES (trip_id, bob_id, alice_id, 'shot', 'accepted', now());

  -- Create a drink log entry for the accepted ping
  INSERT INTO public.drink_log (trip_id, user_id, type, ping_id)
  VALUES (trip_id, alice_id, 'shot', (
    SELECT id FROM public.drink_pings
    WHERE trip_id = trip_id AND to_user_id = alice_id AND status = 'accepted'
    LIMIT 1
  ));

  -- Create a scheduled rule: water every hour 9am-10pm Eastern
  INSERT INTO public.scheduled_rules (trip_id, from_user_id, to_user_id, type, start_time, end_time, interval_minutes, timezone)
  VALUES (trip_id, alice_id, bob_id, 'water', '09:00:00', '22:00:00', 60, 'America/New_York');

  RAISE NOTICE 'Seed data created! Trip ID: %', trip_id;
END $$;
