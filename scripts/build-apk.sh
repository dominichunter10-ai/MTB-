#!/usr/bin/env bash
set -euo pipefail

# Build a free, sideloadable Android APK for HamsterleyMTB using Capacitor.
# Requires: Node.js 18+, Java 17+, and Android SDK (ANDROID_HOME or ANDROID_SDK_ROOT).

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> Checking prerequisites..."
command -v node >/dev/null 2>&1 || { echo "Error: Node.js is required."; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "Error: npm is required."; exit 1; }
command -v java >/dev/null 2>&1 || { echo "Error: Java 17+ JDK is required to compile the APK."; exit 1; }

if [[ -z "${ANDROID_HOME:-}" && -z "${ANDROID_SDK_ROOT:-}" ]]; then
  echo "Error: ANDROID_HOME or ANDROID_SDK_ROOT is not set. Install Android Studio / SDK Command-line Tools first."
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "==> Installing app dependencies..."
  npm install
fi

if [[ ! -d node_modules/@capacitor/android ]]; then
  echo "==> Installing Capacitor Android tooling (--no-save)..."
  npm install --no-save @capacitor/core @capacitor/cli @capacitor/android
fi

echo "==> Building web assets (dist/)..."
npm run build

if [[ ! -d android ]]; then
  echo "==> Creating Android project with Capacitor..."
  npx cap add android
fi

echo "==> Syncing web build to Android project..."
npx cap sync android

MANIFEST_PATH="android/app/src/main/AndroidManifest.xml"
if [[ -f "$MANIFEST_PATH" ]]; then
  echo "==> Ensuring GPS location permissions in AndroidManifest.xml..."
  node -e '
    const fs = require("fs");
    const p = process.argv[1];
    let xml = fs.readFileSync(p, "utf8");
    const perms = [
      "android.permission.INTERNET",
      "android.permission.ACCESS_NETWORK_STATE",
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.ACCESS_FINE_LOCATION"
    ];
    for (const perm of perms) {
      if (!xml.includes(perm)) {
        xml = xml.replace(
          "<application",
          `    <uses-permission android:name="${perm}" />\n\n    <application`
        );
      }
    }
    fs.writeFileSync(p, xml);
  ' "$MANIFEST_PATH"
fi

echo "==> Applying HamsterleyMTB launcher icons..."
for density in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
  TARGET_DIR="android/app/src/main/res/mipmap-${density}"
  if [[ -d "$TARGET_DIR" ]]; then
    if [[ "$density" == "mdpi" || "$density" == "hdpi" ]]; then
      cp -f public/pwa-192x192.png "$TARGET_DIR/ic_launcher.png"
      cp -f public/pwa-192x192.png "$TARGET_DIR/ic_launcher_round.png"
      cp -f public/pwa-192x192.png "$TARGET_DIR/ic_launcher_foreground.png" 2>/dev/null || true
    else
      cp -f public/pwa-512x512.png "$TARGET_DIR/ic_launcher.png"
      cp -f public/pwa-512x512.png "$TARGET_DIR/ic_launcher_round.png"
      cp -f public/pwa-maskable-512x512.png "$TARGET_DIR/ic_launcher_foreground.png" 2>/dev/null || true
    fi
  fi
done

echo "==> Compiling Android APK via Gradle..."
pushd android >/dev/null
chmod +x ./gradlew
./gradlew assembleDebug
popd >/dev/null

mkdir -p dist-apk
APK_SOURCE="android/app/build/outputs/apk/debug/app-debug.apk"
APK_OUT="dist-apk/HamsterleyMTB.apk"
cp -f "$APK_SOURCE" "$APK_OUT"

echo ""
echo "APK built successfully: $APK_OUT"
echo "Transfer HamsterleyMTB.apk to your Android phone and tap to install (enable 'Install unknown apps' when prompted — $0 fee)."
