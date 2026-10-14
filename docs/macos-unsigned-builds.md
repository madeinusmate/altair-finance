# Unsigned macOS builds

`pnpm package:mac` produces a local Electron app. Without an Apple Developer ID certificate, macOS Gatekeeper will warn the first time you open it.

`scripts/fix-app-signature.sh` removes the broken signature from an app you just built and applies an ad-hoc signature so you can launch that build on the same Mac. The package script runs it after `electron-builder`. An ad-hoc signature does not make the app trusted for other people.

`scripts/remove-quarantine.sh` clears the quarantine attribute. That skips Gatekeeper's first-run prompt. Use it only on a `.app` you compiled yourself. Do not share either script as a way to open an app that someone else sent you. For a build you give to other people, sign and notarize with your own Developer ID.

These scripts are not part of the app's security model. They do not weaken the database encryption or the local API token.
