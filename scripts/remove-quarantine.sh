#!/bin/bash
# Local-build helper only. Do not use this on an app you did not build yourself.
# Stripping the quarantine flag skips macOS Gatekeeper's first-run check.
# For an app you compiled locally, prefer signing it (see scripts/fix-app-signature.sh
# and docs/macos-unsigned-builds.md) instead of handing this script to other people.

APP_PATH="${1:-dist/mac-arm64/Altair.app}"

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
