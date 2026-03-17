# SipPing

A lightweight mobile app for couples and friends to keep each other hydrated (and entertained) while on separate trips. Pair up on a trip, send each other drink pings — water to stay healthy, shots to stay fun. Track everything per trip.

## Tech Stack

- **Frontend:** React Native with Expo
- **Backend:** Supabase (Postgres, Auth, Realtime, Edge Functions, Storage)
- **Push Notifications:** Expo Push Notifications (wraps APNs + FCM)
- **Distribution:** Expo Go (dev) → EAS Build → TestFlight / App Store

## Prerequisites

- Node.js 18+
- An [Expo](https://expo.dev) account
- A [Supabase](https://supabase.com) project
- Apple Developer Program enrollment (for push notifications + TestFlight)
- Expo Go app on your physical device (push notifications don't work in simulators)

## Setup

1. Clone the repo and install dependencies:

```bash
git clone <repo-url>
cd SipPing
npm install
```

2. Create a `.env` file in the project root:

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

3. Start the dev server:

```bash
npm start
```

4. Scan the QR code with Expo Go on your phone.

## Deploy to TestFlight

1. First time only — push environment variables to EAS:

```bash
./scripts/setup-eas-env.sh
```

2. Build and submit to TestFlight:

```bash
./scripts/deploy-testflight.sh
```

The build number auto-increments on each run. Testers with the app installed will be notified of the new version in TestFlight.

## Project Structure

```
SipPing/
├── App.js              # App entry point
├── app.json            # Expo config
├── assets/             # Icons, splash screen
├── src/
│   ├── components/     # Reusable UI components
│   ├── screens/        # Screen components
│   ├── navigation/     # React Navigation setup
│   ├── lib/            # Supabase client, utilities
│   ├── hooks/          # Custom hooks (useAuth, etc.)
│   └── types/          # TypeScript types (generated from Supabase)
└── supabase/
    ├── migrations/     # Database migrations
    └── functions/      # Edge Functions (cron, push sender)
```
