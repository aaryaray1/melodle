#!/usr/bin/env bash
# Builds the Android launcher with the public server address built in, and puts
# it in public/ so the site serves it at /melodle.apk. Run scripts/deploy.sh
# afterwards to publish it.
# Usage: scripts/build-apk.sh [https://server.address]   (default: PUBLIC_ORIGIN in .env;
#        pass "" to build one that asks for an address)
set -euo pipefail
cd "$(dirname "$0")/.."

SERVER="${1-$(grep -E '^PUBLIC_ORIGIN=' .env | cut -d= -f2-)}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
# Forward slashes only: Java properties eat backslashes.
echo "sdk.dir=$ANDROID_HOME" > android/local.properties

npx cap sync android

# The meta tag is the launcher's default server; sync copied it in empty.
SHELL_PAGE=android/app/src/main/assets/public/index.html
sed -i "s|<meta name=\"melodle-server\" content=\"[^\"]*\" />|<meta name=\"melodle-server\" content=\"$SERVER\" />|" "$SHELL_PAGE"
grep -q "content=\"$SERVER\"" "$SHELL_PAGE"

(cd android && ./gradlew --quiet assembleDebug)
cp android/app/build/outputs/apk/debug/app-debug.apk public/melodle.apk
echo "built public/melodle.apk for ${SERVER:-no built-in server} ($(du -h public/melodle.apk | cut -f1))"
