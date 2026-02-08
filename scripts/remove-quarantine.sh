#!/bin/bash
# Script to remove quarantine attribute from built Electron app
# This allows the app to run on macOS without Gatekeeper blocking it

APP_PATH="${1:-dist/mac-arm64/Netly.app}"

if [ ! -d "$APP_PATH" ]; then
  echo "Error: App not found at $APP_PATH"
  echo "Usage: $0 [path-to-app]"
  exit 1
fi

echo "Removing quarantine attribute from $APP_PATH..."
xattr -cr "$APP_PATH"

echo "✓ Quarantine attribute removed"
echo ""
echo "You can now run the app by:"
echo "  open \"$APP_PATH\""
echo ""
echo "Or if you still get an error, right-click the app and select 'Open'"
