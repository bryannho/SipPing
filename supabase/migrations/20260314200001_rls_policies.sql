-- =============================================================
-- SipPing: Row-Level Security Policies
-- =============================================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drink_pings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drink_log ENABLE ROW LEVEL SECURITY;

-- =============================================================
-- Helper: check if current user is a member of a trip
-- SECURITY DEFINER avoids recursive RLS on trip_members
-- =============================================================
CREATE OR REPLACE FUNCTION public.is_trip_member(p_trip_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trip_members
    WHERE trip_id = p_trip_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- =============================================================
-- USERS
-- =============================================================

-- Can read own profile + profiles of people in the same trip
CREATE POLICY "users_select" ON public.users
  FOR SELECT USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.trip_members tm1
      JOIN public.trip_members tm2 ON tm1.trip_id = tm2.trip_id
      WHERE tm1.user_id = auth.uid() AND tm2.user_id = users.id
    )
  );

-- Can update only own profile
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- =============================================================
-- TRIPS
-- =============================================================

-- Any authenticated user can create a trip (they must be the creator)
CREATE POLICY "trips_insert" ON public.trips
  FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Trip members can read the trip
CREATE POLICY "trips_select" ON public.trips
  FOR SELECT USING (public.is_trip_member(id));

-- Only the creator can update trip details
CREATE POLICY "trips_update" ON public.trips
  FOR UPDATE USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- =============================================================
-- TRIP_MEMBERS
-- =============================================================

-- Trip members can see who else is in the trip
CREATE POLICY "trip_members_select" ON public.trip_members
  FOR SELECT USING (public.is_trip_member(trip_id));

-- Trip creator can add members, OR a user can add themselves (invite join)
CREATE POLICY "trip_members_insert" ON public.trip_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trips
      WHERE id = trip_id AND created_by = auth.uid()
    )
    OR user_id = auth.uid()
  );

-- Trip creator can remove members, or a member can leave
CREATE POLICY "trip_members_delete" ON public.trip_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.trips
      WHERE id = trip_id AND created_by = auth.uid()
    )
    OR user_id = auth.uid()
  );

-- =============================================================
-- DRINK_PINGS
-- =============================================================

-- Trip members can see pings in their trip
CREATE POLICY "drink_pings_select" ON public.drink_pings
  FOR SELECT USING (public.is_trip_member(trip_id));

-- Sender can create a ping (must be a trip member)
CREATE POLICY "drink_pings_insert" ON public.drink_pings
  FOR INSERT WITH CHECK (
    auth.uid() = from_user_id
    AND public.is_trip_member(trip_id)
  );

-- Recipient can update ping status (accept/decline/snooze)
CREATE POLICY "drink_pings_update" ON public.drink_pings
  FOR UPDATE USING (auth.uid() = to_user_id)
  WITH CHECK (auth.uid() = to_user_id);

-- =============================================================
-- SCHEDULED_RULES
-- =============================================================

-- Trip members can see rules in their trip
CREATE POLICY "scheduled_rules_select" ON public.scheduled_rules
  FOR SELECT USING (public.is_trip_member(trip_id));

-- Rule creator can insert (must be a trip member)
CREATE POLICY "scheduled_rules_insert" ON public.scheduled_rules
  FOR INSERT WITH CHECK (
    auth.uid() = from_user_id
    AND public.is_trip_member(trip_id)
  );

-- Rule creator can update
CREATE POLICY "scheduled_rules_update" ON public.scheduled_rules
  FOR UPDATE USING (auth.uid() = from_user_id)
  WITH CHECK (auth.uid() = from_user_id);

-- Rule creator can delete
CREATE POLICY "scheduled_rules_delete" ON public.scheduled_rules
  FOR DELETE USING (auth.uid() = from_user_id);

-- =============================================================
-- DRINK_LOG
-- =============================================================

-- Trip members can see logs in their trip
CREATE POLICY "drink_log_select" ON public.drink_log
  FOR SELECT USING (public.is_trip_member(trip_id));

-- User can insert their own log entries (must be a trip member)
CREATE POLICY "drink_log_insert" ON public.drink_log
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND public.is_trip_member(trip_id)
  );
