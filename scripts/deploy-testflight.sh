#!/bin/bash
set -e

# Build
echo "🏗️  Building iOS production..."
eas build --platform ios --profile production

# Submit to App Store Connect / TestFlight
echo "🚀 Submitting to TestFlight..."
eas submit --platform ios --latest

echo "✅ Done! Check App Store Connect for the new build."
