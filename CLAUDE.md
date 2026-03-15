# CLAUDE.md

## Project Overview

SipPing is a React Native (Expo) mobile app backed by Supabase. Users pair up on trips and send each other drink pings (water or shots). The recipient gets a push notification and can accept, decline, or snooze. Everything is tracked per trip.

## Architecture

### Frontend (React Native / Expo)

- **Entry point:** `App.js` → wraps the app in auth context and navigation
- **Navigation:** React Navigation with a bottom tab navigator (Home, Pending, Send, Stats) and stack navigators for sub-screens
- **State management:** React Context for auth, Supabase Realtime subscriptions for live data
- **Screens live in:** `src/screens/`
- **Shared components:** `src/components/`
- **Hooks:** `src/hooks/` — `useAuth()` for session, custom hooks for data fetching
- **Supabase client:** `src/lib/supabase.js` — singleton, imported everywhere

### Backend (Supabase)

- **Database:** Postgres with 6 core tables: `users`, `trips`, `trip_members`, `drink_pings`, `scheduled_rules`, `drink_log`
- **Auth:** Supabase Auth (email/password)
- **Row-Level Security:** Enabled on all tables, scoped to trip membership
- **Edge Functions** (`supabase/functions/`):
  - **Cron function:** Runs every minute. Checks `scheduled_rules` for pings to fire, checks `drink_pings` for snoozed pings past their `snoozed_until`. Creates ping rows and sends push notifications.
  - **Push sender:** Calls Expo Push API with the recipient's `expo_push_token`.
- **Storage:** Supabase Storage bucket for drink photos (uploaded on ping acceptance)
- **Migrations:** `supabase/migrations/` — schema changes tracked here

### Push Notifications

- Uses Expo Push Notifications (wraps APNs for iOS, FCM for Android)
- Push token stored in `users.expo_push_token`, refreshed on every app launch
- iOS notification categories with action buttons (Accept / Decline / Later) for lock screen responses

### Key Data Flows

1. **Send ping:** Insert into `drink_pings` → Edge Function sends push → recipient's app updates via Realtime
2. **Accept ping:** Update `drink_pings.status` → insert into `drink_log` → sender notified
3. **Scheduled pings:** Cron Edge Function checks `scheduled_rules` → creates `drink_pings` → sends push
4. **Snooze:** Set `snoozed_until` on ping → cron re-fires when time passes

## Commands

```bash
npm start          # Start Expo dev server
npm run ios        # Start with iOS target
npm run android    # Start with Android target
```

## Environment Variables

Stored in `.env` (gitignored):

- `EXPO_PUBLIC_SUPABASE_URL` — Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/public key
- `SUPABASE_SERVICE_ROLE_KEY` — used only in Edge Functions, never in client code
