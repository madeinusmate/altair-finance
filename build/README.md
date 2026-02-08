# Electron App Icons

This directory contains the icon files for the Electron app build.

## Required Files

### For macOS (Required)
Place your macOS icon file here:
- **`icon.icns`** - macOS icon set file (recommended)

### Fallback Option
If you don't have an `.icns` file, you can use:
- **`icon.png`** - PNG image (electron-builder will convert it to `.icns`)

## Icon Requirements

### macOS (.icns)
- Should contain multiple sizes: 16x16, 32x32, 128x128, 256x256, 512x512, 1024x1024
- You can create an `.icns` file from a PNG using:
  - Online tools (e.g., cloudconvert.com)
  - Command line: `iconutil -c icns icon.iconset` (requires creating an iconset folder)
  - Apps like Icon Composer or Image2icon

### PNG (fallback)
- Recommended size: 1024x1024 pixels
- Square aspect ratio
- PNG format with transparency support

## Current Configuration

The icon is configured in `package.json`:
- General icon: `build/icon.png`
- macOS specific: `build/icon.icns`

Once you add your icon file(s), the Electron build will automatically use them when you run:
- `pnpm build:electron`
- `pnpm package:mac`
