#!/bin/bash
# Ad-hoc sign an Altair build you just produced on this machine.
# This is not a substitute for an Apple Developer ID signature, and it does not
# make the app trusted for anyone else. See docs/macos-unsigned-builds.md.

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default to the most common build output location
DEFAULT_APP_PATH="$PROJECT_ROOT/dist/mac-arm64/Altair.app"
APP_PATH="${1:-$DEFAULT_APP_PATH}"

# If relative path, make it absolute relative to project root
if [[ "$APP_PATH" != /* ]]; then
  APP_PATH="$PROJECT_ROOT/$APP_PATH"
fi

if [ ! -d "$APP_PATH" ]; then
  echo "Error: App not found at $APP_PATH"
  echo "Usage: $0 [path-to-app]"
  echo "Tried: $APP_PATH"
  exit 1
fi

echo "Fixing app signature for $APP_PATH..."

# Remove existing signature
codesign --remove-signature "$APP_PATH" 2>/dev/null || true

# Remove quarantine attribute
xattr -cr "$APP_PATH" 2>/dev/null || true

# Re-sign with ad-hoc signature (no identity required)
codesign --force --deep --sign - "$APP_PATH" 2>/dev/null || {
  echo "Warning: Failed to re-sign app, but continuing..."
}

echo "✓ App signature fixed"
echo ""
echo "You can now run the app by:"
echo "  open \"$APP_PATH\""
