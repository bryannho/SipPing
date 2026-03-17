#!/bin/bash
set -e

# Read values from .env file and push to EAS as production environment variables.
# Only needs to be run once, or when .env values change.

ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ]; then
  echo "❌ .env file not found. Run this script from the project root."
  exit 1
fi

get_env() {
  grep "^$1=" "$ENV_FILE" | cut -d '=' -f2-
}

SUPABASE_URL=$(get_env EXPO_PUBLIC_SUPABASE_URL)
SUPABASE_ANON_KEY=$(get_env EXPO_PUBLIC_SUPABASE_ANON_KEY)
GOOGLE_WEB_CLIENT_ID=$(get_env EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID)
GOOGLE_IOS_CLIENT_ID=$(get_env EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID)

echo "🔐 Setting EAS environment variables..."
eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value "$SUPABASE_URL" --environment production --force
eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "$SUPABASE_ANON_KEY" --environment production --force
eas env:create --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value "$GOOGLE_WEB_CLIENT_ID" --environment production --force
eas env:create --name EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID --value "$GOOGLE_IOS_CLIENT_ID" --environment production --force

echo "✅ EAS environment variables set for production."
