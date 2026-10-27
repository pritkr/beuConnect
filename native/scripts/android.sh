#!/usr/bin/env bash
# Build, install and screenshot BEUConnect on the Android emulator.
# Usage: ./scripts/android.sh [install|slim|shot|emulator|log]
set -euo pipefail
source ~/.config/nsh/env.sh >/dev/null 2>&1
cd "$(dirname "$0")/.."

AVD="${AVD:-beuconnect_api35}"

case "${1:-run}" in
  run)
    nsh package App.tsx --target android --run
    ;;
  slim)
    ./scripts/package-android.sh
    ;;
  install)
    INSTALL=1 ./scripts/package-android.sh
    ;;
  shot)
    adb shell screencap -p /sdcard/beuconnect.png
    adb pull /sdcard/beuconnect.png /tmp/beuconnect.png
    open /tmp/beuconnect.png
    ;;
  emulator)
    emulator -avd "$AVD" -netdelay none -netspeed full -no-boot-anim &
    adb wait-for-device
    adb shell settings put global window_animation_scale 1
    ;;
  log)
    adb logcat -s nsh:V AndroidRuntime:E ActivityManager:I | grep -iE "beuconnect|nsh|AndroidRuntime"
    ;;
  *)
    echo "usage: $0 [run|slim|install|shot|emulator|log]"
    exit 1
    ;;
esac
